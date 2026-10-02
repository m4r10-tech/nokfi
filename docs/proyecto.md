# Nokfi — Documento maestro del producto

> Última actualización: **2026-10-02 (sesión 12)**. Estado: **producción en vivo
> bajo HTTPS con Cloudflare (Full strict) y cobros reales Stripe**.
>
> Este es el documento de referencia del producto Nokfi. Para el contrato técnico
> Backend↔Frontend ver [`api.md`](api.md); para el despliegue y operación del VPS
> ver [`deploy.md`](deploy.md). Las secciones 20-23 son históricas (handoffs).

## 0. Estado actual (2026-10-02)

- **Producto**: diagnóstico y finanzas para autónomos y pymes de España. Libro de
  facturas (lectura con IA de PDF, fotos y facturas electrónicas), impuestos del
  trimestre (303 y 130) y lo apartado, cobros con reclamación, fugas, previsión,
  comparación con el sector, calendario fiscal con avisos, **emisión de facturas
  con VERI*FACTU** (registros encadenados y QR; envío a la AEAT apagado) y
  factura electrónica (UBL 2.5, Facturae 3.2.2, Factur-X, CII), cuestionario y
  análisis de Excel con IA, asistente, calculadoras y enlaces para la gestoría.
- **Espacios**: Negocio y Desarrolladores (claves `nk_live_`/`nk_test_`,
  webhooks, Playground, registro, clientes).
- **IA**: Groq → Cloudflare Workers AI → Cerebras (Cerebras se quita el
  2026-10-29); topes de gasto en `utils/aiBudget.js`. Gemini ya no se usa por
  defecto (queda como proveedor opcional en el código).
- **Integraciones**: API pública v1, servidor MCP 1.2.0, nodo n8n 0.3.0 (npm).
- **Web pública (sesión 12)**: landing, precios, 5 calculadoras, calendario
  fiscal, validador de NIF y 8 guías, en castellano (raíz) e inglés (`/en/…`),
  prerenderizadas en el build y con `sitemap.xml`. Ver §24.
- **Idiomas de la app**: es, en, fr, it, de, pl.
- **Tests**: `cd backend && node test/e2e.test.js` → **520**. Frontend:
  `npm run check:i18n`, `npm run check:seo`, `npm run test:einvoice`.

---

## 1. Qué es Nokfi

SaaS de **diagnóstico financiero** para autónomos y pymes. Combina un **cuestionario
interactivo** (5 bloques × 6 preguntas Sí/No) con el **análisis de archivos
Excel/PDF** mediante IA (Groq / Cloudflare Workers AI), generando **informes estilo consultoría**
con cifras, gráficas y recomendaciones concretas exportables a PDF/Excel.

- Cuestionario de diagnóstico → salud financiera del negocio
- Análisis de Excel/PDF con IA — 6 subapartados: stock, ventas, servicios, entrada
  de productos, caja y profit total
- Informes exportables — PDF y Excel con cifras, gráficas y recomendaciones
- Calculadoras financieras — punto de equilibrio, margen, ROI

## 2. Modelo de negocio (Fase 3 — suscripción mensual Stripe)

**Suscripción mensual** vía Stripe, sin permanencia, cancelable a fin de periodo.
Tres tiers:

| Plan | Precio/mes | Análisis IA/día | Trial |
|------|-----------|-----------------|-------|
| **mini** | 5 € | 10 | **14 días gratis** (tarjeta obligatoria) |
| **pro** | 20 € | 50 | — |
| **max** | 50 € | 130 | — |

**Modelo de billing (decisión 2026-08-13, Deuda B — MIGRADO y DESPLEGADO):**
3 **Products separados** en Stripe (Nokfi Mini / Pro / Max), **un único Price
recurring mensual EUR** cada uno. NO se usa "1 Product con 3 Prices" — el Stripe
Customer Portal solo permite un price por (product, intervalo, moneda) para el
cambio de plan.

- **Precios cobrados** = `STRIPE_PRICE_{MINI,PRO,MAX}` (el `price_id` de Stripe).
  `create-checkout` referencia el `price_id` estable (`line_items[0][price]`), ya
  NO `price_data` inline efímero.
- **Precios mostrados** = `PLAN_PRICE_{MINI,PRO,MAX}_EUR` (catálogo público
  `GET /api/payments/plans`). Dos orígenes que deben mantenerse **sincronizados a
  mano** (drift caveat): si cambias el precio en Stripe sin tocar `.env` (o al
  revés) la web muestra 5€ y Stripe cobra 7€.
- **Proración del Portal = `None`** ("Sin cargos ni créditos"): elegir otro plan
  → **€0 hoy** → se aplica al **fin del periodo de facturación actual** (anclado a
  su propia fecha de pago, no al fin de mes calendario). Downgrade no genera
  abono/reembolso. "Un mes" = desde que pagó (Stripe ancla cada sub a su fecha).
- **Trial de mini = Opción 1**: el usuario en trial **puede** abrir el Portal y
  subir a pro/max. Con proration `None` no cobra hoy — el cambio aterriza al
  **fin del trial (día 14)** cobrando €20/€50 (no €5). Si vuelve a mini antes,
  cobra €5. Maximiza captura de revenue caliente.
- **Anti-drift de precios**: el frontend SIEMPRE pasa por `GET /api/payments/plans`,
  nunca hardcodea. Lo que muestra la web == lo que cobra Stripe.
- **Trial**: `subscription_data[trial_period_days]=14` (tarjeta obligatoria, no
  cobra al instante; cobra el día 14). NO se manda
  `trial_settings[end_behavior][type]` — ese campo es de la API de Subscriptions,
  no de Checkout Sessions, y Stripe lo rechaza con "unknown parameter"
  (bug J, visto en prod 2026-08-04). El comportamiento por defecto al acabar el
  trial es empezar a cobrar (= el "release" querido).

**Auth y anti-sharing**: email + clave de licencia (`XXXX-XXXX-XXXX-XXXX`) +
contraseña (hash scrypt). El viejo modelo de device-fingerprint se eliminó
(`f9385af`); el anti-sharing es la **cuota diaria de IA por licencia** (una clave
compartida se agota entre sus usuarios).

**Pasarela única**: Stripe. PayPal / Revolut / Coinbase retirados (404).

## 3. Flujo de venta (end-to-end)

1. Landing pública `/` (Hero → Info → Planes → CTA) y `/pricing` muestran precios
   al día desde `/api/payments/plans`.
2. El usuario elige plan → `POST /api/payments/stripe/create-checkout`
   `{ email, plan }` → Stripe Checkout Session (suscripción; mini con trial 14d).
3. Stripe cobra (mini: a los 14 días; pro/max: al momento) y entrega
   `checkout.session.completed` al webhook.
4. El webhook **crea la licencia** (`webhooks.js createLicense`) — la clave solo
   existe tras el pago confirmado (nunca antes), y envía la clave por email (Resend).
5. El usuario aterriza en `/reveal?session_id=` → polling a
   `GET /api/payments/stripe/reveal` hasta 200 → ve su clave.
6. `/activate` (elige contraseña) → login → dashboard.
7. La gestión de la subscripción (cancelar, cambiar de plan, método de pago) se
   hace en el **Stripe Customer Portal** nativo vía `create-portal-session`.

## 4. Principio clave

**"La clave nunca existe antes del pago confirmado"**: la generación real de la
licencia ocurre SOLO en `routes/webhooks.js` (desde el evento
`checkout.session.completed`). `create-checkout` únicamente crea la intención de
cobro en Stripe. Esto impide la farmación de claves sin pagar.

## 5. Arquitectura

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 22 + Express + SQLite (`better-sqlite3` 13) |
| IA | Groq, Cloudflare Workers AI y Cerebras (orden en `AI_PROVIDERS` / `CHAT_PROVIDERS`) |
| Frontend | React 18 + Vite 5 + Tailwind CSS + PWA; páginas públicas prerenderizadas (SSR en el build) |
| Gráficas | Recharts |
| Excel/PDF | `xlsx` (SheetJS), `jspdf`, `pdfjs-dist`, `docx`, `pptxgenjs` |
| Pagos | **Stripe** (suscripción mensual; PayPal/Revolut/Coinbase retirados) |
| Email | Resend |
| Analítica | Cloudflare Web Analytics (sin cookies) + recuentos propios en `web_events` |
| Despliegue | Ubuntu 24.04 + PM2 + Nginx + **Cloudflare (edge)** |

```
nokfi/
├── backend/            # API REST — Express + SQLite
│   ├── server.js       # Punto de entrada: Helmet, CORS, rate limiters, raw webhook
│   ├── config/         # plans.js, openapi.js, stripe-version.js
│   ├── db/             # database.js + schema4.js y módulos por área (finance, webhooks…)
│   ├── middleware/     # requireLicense, requireApiKey, idempotency…
│   ├── routes/         # auth, payments, webhooks (Stripe), admin, profile, analyses,
│   │                   # ai, chat, finance, invoicing, account (keys, me, client-errors,
│   │                   # events), share, v1, mcp, dev
│   ├── services/       # ai/, invoicing/ (PDF, XML), verifactu/, einvoice, taxTools,
│   │                   # webhooks, jobs, reminders, monthlySummary, opsReport, webEvents
│   ├── utils/          # password (scrypt), mailer (Resend), aiBudget, fiscalCalendar, finance
│   └── test/           # e2e.test.js + session*.tests.js (520)
├── frontend/           # PWA — React + Vite + Tailwind
│   ├── scripts/        # prerender.mjs (SEO), check-i18n, check-seo, test-einvoice
│   └── src/
│       ├── pages/      # Landing, Pricing, Login, app (Home, finance/, excel/, dev/…),
│       │               # seo/ (herramientas y guías públicas)
│       ├── seo/        # routes.js (páginas públicas), useSeo, content/{es,en}.js
│       ├── components/ # calculators.jsx (app y web pública), PublicChrome…
│       ├── entry-server.jsx  # render en Node para el prerender
│       └── i18n/       # es, en, fr, it, de, pl
├── shared/             # einvoice.mjs (lector de facturas electrónicas, navegador y Node)
├── deploy/             # nginx-nokfi.conf + nginx-cloudflare-realip.conf
└── docs/               # esta documentación
```

> Ubicación real y operación del VPS: ver [`deploy.md`](deploy.md).

## 6. Esquema de base de datos

**Tablas (2026-10-02):** `licenses`, `sessions`, `reset_tokens`, `otp_codes`,
`auth_request_log`, `audit_log`, `payment_events`, `company_profiles`,
`analyses`, `action_items`, `ai_usage`, `ai_provider_usage`, `ledger_entries`,
`tax_reserves`, `leak_dismissals`, `reminders_sent`, `share_links`,
`client_errors`, `api_keys`, `api_calls`, `api_jobs`, `idempotency_keys`,
`webhook_endpoints`, `webhook_deliveries`, `event_marks`, `billing_profiles`,
`customers`, `invoice_series`, `invoices`, `invoice_lines`, `invoice_events`,
`verifactu_records`, `verifactu_flow` y `web_events` (sesión 12: día, evento,
ruta y recuento; sin datos personales). Las de la sesión 4 en adelante se crean
con `CREATE TABLE IF NOT EXISTS` al arrancar (`db/schema4.js` y módulos).

Variables de entorno: ver `backend/.env.example` (IA, Stripe, Resend, R2,
VERI*FACTU…). Detalle de las tablas originales:

SQLite (`better-sqlite3`), db relativa a `backend/` (`DB_PATH=./db/nokfi.db`).
Tablas:

### `licenses`
La licencia = la cuenta de pago. Columnas (a Fase 3):
`id`, `key` (UNIQUE), `email`, `plan` (`mini|pro|max`), `status`
(`active|suspended|revoked|expired`), `billing_model` (`subscription|legacy`),
`password_hash` (scrypt), `stripe_customer_id`, `stripe_subscription_id`,
`current_period_ends_at`, `cancel_at_period_end`, `trial_ends_at`,
`device_name` (etiqueta legible, no participa en auth), `notes`, `created_at`.

### `sessions`
Tokens de sesión Bearer.

### `payment_events`
Idempotencia de webhooks: claves (provider, event_id), flag `processed`
(1 = ya procesado; 0 = pendiente/sin licencia → Stripe reintenta).

### `analyses`
Historial de análisis (autocreada en boot): `license_id` (FK), `kind`, `title`,
`prompt_chars` (**no** el prompt — no se duplica datos financieros),
`result_html`, `created_at` (UTC `YYYY-MM-DD HH:MM:SS`). Scopada por licencia.

### `company_profiles`
Perfil de empresa del onboarding (1 fila/licencia, PK `license_id` UNIQUE, FK
CASCADE): `company_name`, `sector`, `size`, `main_expenses` (JSON), booleans de
onboarding.

### `reset_tokens` / `audit_log`
Resets de contraseña por email (1/año, expiración 30 min) y registro de
auditoría (eventos, IP real).

> **`CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut', NULL))`**
> se conserva a propósito como documentación histórica — no es deuda a limpiar.

## 7. Auth y seguridad

Email + clave + contraseña (scrypt), sesiones Bearer. Auditoría OWASP Top 10 +
ASVS completada con **14 hallazgos corregidos**. `npm audit` del backend:
**0 vulnerabilidades**. Devsu tramo: ver [`deploy.md`](deploy.md) §"Seguridad".

Cabeceras de seguridad servidas por Nginx (HSTS, CSP con `frame-ancestors 'none'`,
X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). En el edge,
Cloudflare aporta anti-DDoS + WAF (ver `deploy.md`).

**Auditoría de seguridad (2026-09) — endurecimientos aplicados:**
- **Tokens hasheados en reposo**: las sesiones y los reset-tokens se persisten en
  la BD SOLO como su **SHA-256** (64 hex minúsculas), nunca en texto plano. El
  token crudo (64 hex MAYÚSCULAS) viaja solo una vez en la respuesta y vive en
  memoria del cliente. Migración in-place de las filas preexistentes
  (`hashTokensAtRest`) — idempotente y NO destructiva: no revoca sesiones activas
  ni enlaces de reset pendientes.
- **scrypt endurecido a N=2^16** (~65536): el hash de la contraseña es el único
  secreto real (la clave es semi-pública, va en el email de bienvenida). Requiere
  `maxmem` a scryptSync (Node v24/OpenSSL 3 usa >64MB; 256MB de tope). Los hashes
  viejos (N=2^14) siguen verificando — `verifyPassword` lee N/r/p del propio hash.
- **Rate-limiter dedicado a `create-checkout`** (10/min por IP): defensa en
  profundidad sobre el limiter general, evita abusar creando Checkout Sessions de
  Stripe (coste/ruido) en un endpoint pre-pago sin `requireLicense`.

Detalle de cada endpoint y sus códigos de error: ver [`api.md`](api.md).

## 8. Endpoints agrupados

| Área | Ruta | Auth |
|------|------|------|
| Auth | `/api/auth/{activate,login,verify,logout,reveal-key,change-password,request-password-reset,confirm-password-reset}` | según ruta |
| IA | `POST /api/ai/analyze`, `/api/actions`, `POST /api/chat` (`/api/proxy/ai` responde 410) | Bearer |
| Finanzas | `/api/ledger`, `/api/finance/*`, `/api/dashboard`, `/api/invoicing/*` | Bearer |
| Cuenta | `/api/keys`, `/api/me`, `/api/share`, `/api/dev/*` | Bearer |
| Público | `/api/shared/:token`, `/api/client-errors`, `/api/events`, `/api/geo` | sin auth (con límite) |
| API v1 / MCP | `/api/v1/*`, `/api/mcp` | clave `nk_live_` / `nk_test_` |
| Historial | `/api/analyses`, `/api/analyses/:id` | Bearer (scoped por licencia) |
| Perfil | `GET/PUT /api/profile` | Bearer (scoped por licencia) |
| Pagos | `GET /api/payments/plans`, `POST .../stripe/create-checkout`, `POST .../create-portal-session`, `GET .../stripe/reveal` | según ruta |
| Webhooks | `POST /api/webhooks/stripe` | firma HMAC (solo Stripe) |
| Admin | `/api/admin/*` | `ADMIN_SECRET` |

## 9. UI / Dashboard

App PWA React. Áreas: Login / Activate / Reveal / ResetPassword (fuera de sesión);
Dashboard bajo `/app/*` (ProtectedRoute, solo licencia activa/trial) con:
Home, Cuestionario, ExcelHub (6 subapartados), Historial, Informes, Calculadoras,
Configuración. Sidebar + onboarding modal + welcome-card. i18n ES/EN, tema
claro/oscuro.

## 10. Formato del informe de IA

Desde la sesión 4 el backend arma el prompt y pide a la IA un **JSON
estructurado** (resumen, puntuación de salud, hallazgos con cifras, plan de
acción marcable en `action_items`) que el frontend pinta con sus componentes y
exporta a PDF, Excel, Word y PowerPoint. Los informes antiguos en HTML se siguen
mostrando con `sanitizeAiHtml`.

## 11. Idiomas

ES/EN (namespace de i18n `landing.*`, `auth.*`, etc.). Selector en la top bar.

## 12. Landing (9 secciones → implementadas)

Hero, Info empresa / qué es Nokfi, Planes y precios (desde `/api/payments/plans`),
CTA final, footer. `pages/Landing.jsx` en ruta `/` (era redirección a `/login`);
`components/PlanCards.jsx` + `hooks/usePlans.js` reutilizados por Landing y
Pricing. Gating intacto: la app sigue en `/app/*`.

## 13. Onboarding

Modal al primer login: nombre de empresa, sector, tamaño, gastos principales.
Persistido en `company_profiles` vía `GET/PUT /api/profile` (merge parcial,
debounced acumulando partials). `welcomeCardDismissed` controla la welcome-card.

## 14. Política de licencias (4 escenarios)

Para una suscripción Stripe (Fase 3), los estados se ligan al ciclo de vida de la
sub:

1. **Trial (mini)**: `status='active'` + `trial_ends_at` futuro. Al día 14 Stripe
   cobra; si falla, `past_due → suspended → expired`.
2. **Cobro recurrente OK**: `invoice.paid` renueva (limpia `trial_ends_at` si
   `amount_paid>0`).
3. **Cobro fallido persistente**: `invoice.payment_failed` → `status='suspended'`.
   Stripe reintenta; si sigue fallando y el usuario no actúa → `expired`.
4. **Cancelación (Portal)**: `cancel_at_period_end=true` → sigue activo hasta el
   fin del periodo; al expirar `customer.subscription.deleted` → `expired` y
   sesiones cerradas.

> **`trialing` no es un `status` aparte**: una licencia en trial sigue siendo
> `status='active'` con `trial_ends_at` futuro. Las métricas lo distinguen por
> campos, no por estado.

## 15. Métricas de negocio

`/api/admin/stats?period=30` devuelve `billing: { subscription, legacy, trialing,
paying_subscribers, mrr_eur }`.

**Discriminador de MRR**: `billing_model='subscription' AND status='active' AND
trial_ends_at IS NULL` — el trial queda EXCLUIDO del MRR (se cuenta al primer
cobro real).

## 16. Proveedores de pago — historial de retiradas

- **Stripe**: única pasarela actual.
- **PayPal / Coinbase Commerce / Revolut**: retirados (`bbf10cb`) → sus endpoints
  devuelven 404. El CHECK de la columna se conserva como documentación histórica.
- **Pago único lifetime (€150)** → sustituido por suscripción mensual (Fase 3,
  `2bb4b40`).

## 17. Frontend — estructura

Ver el árbol en §5. Fuentes puntuales:
- `middleware/api.js`: único cliente HTTP (base URL + header Authorization).
- `middleware/sanitize.js`: `sanitizeAiHtml` (HTML de IA) + `sanitizeFreeText`.
- `hooks/useCompanyProfile.js`: puente con `/api/profile`.

> Nota: las viejas "limitaciones conocidas" del frontend (perfil en `localStorage`,
> "sin historial" de análisis) quedaron **obsoletas** — ambas ya tienen endpoint
> real en el backend (`/api/profile`, `/api/analyses`). No reintroducirlas.

## 18. Submódulos Excel (6 subapartados)

Stock / Almacén, Ventas, Servicios, Entrada de productos, Caja, Profit total.
Cada uno: extracción (XLS/CSV/PDF en el cliente), análisis IA, gráficas, export
PDF/Excel. PDFs con sistema de 4 capas para extracción robusta. Estructura de
zonas 4 para identificar secciones de la hoja.

## 19. Identidad visual

- **Tipografía**: Plus Jakarta Sans.
- **Paleta**: definida en variables CSS de `frontend/src/index.css`.
- **Regla de contraste (clave)**: todo componente nuevo usa variables CSS
  (`var(--text-primary)`, `var(--surface-1)`, …), **nunca** colores hex fijos.
  Probar visualmente cada pantalla en ambos temas (oscuro y claro).
- Logo: `frontend/public/icons/`.

## 20. Estado y deudas (al 2026-08-16)

**Todo lo CRÍTICO está resuelto y verificado en producción:**

- ✅ **Producción HTTPS viva** — Nginx + Let's Encrypt (cert hasta 2026-11-01,
  autorenueva via `certbot.timer`), `https://nokfi.app/`.
- ✅ **Cloudflare (edge) Full strict EN PROD** — anti-DDoS/WAF/cache/canonical
  www→nokfi; real-IP chain verificado; Stripe webhook pasa; renewal HTTP-01 pasa.
  Detalle en `deploy.md`.
- ✅ **Cobros reales Stripe LIVE** — pago real verificado de punta a punta
  (licencia id=2, trial 14d → 0€ hoy, correo recibido, Portal abierto). Webhook
  LIVE con los 6 eventos, entrega OK a través de CF.
- ✅ **Deuda I** (validar plan antes de llamar a Stripe) — `400 invalid_plan`.
- ✅ **Deuda K** (1er `invoice.paid` del trial huérfano ya no queda `processed:false`).
- ✅ **Deuda B** (billing 3 Products con `price_id` + Portal proration=None).
- ✅ **Deuda H** (cuota IA ATOMICA anti-TOCTOU, 2026-08-17) — detalle en `deploy.md`.
- ✅ **Mailer Resend** — dominio `nokfi.app` verificado, `noreply@nokfi.app`
  funcionando (probe real `sent:true`).
- ✅ **Historial de análisis** (`/api/analyses`), **perfil de empresa**
  (`/api/profile`), e2e **107/107 PASS**.
- ✅ **Auditoría de seguridad (2026-09)** — 3 endurecimientos aplicados y
  verificados (107/107 PASS): tokens hasheados en reposo (sesión + reset),
  scrypt a N=2^16, y rate-limiter dedicado a `create-checkout`. Detalle en §7.
- ⏳ **Opcional / no bloqueante (cosmético)**: forwarding de
  `info@/help@/soporte@nokfi.app` vía Namecheap (gratis, CF no proxya MX/TXT).
  Deuda H (cuota IA TOCTOU bajo concurrencia) documentada en `deploy.md` §Deudas.

---

## 21. Últimos cambios realizados (handoff 2026-09-14)

**Trabajo en curso**: auditoría de seguridad del backend. Estado: **COMPLETADO y
verificado (107/107 e2e PASS)**. Todo lo de abajo está aplicado en el working tree
y validado con el suite completo; falta commit/deploy (decisión del usuario).

**Cambios (3 archivos backend):**

1. **`backend/db/database.js` — tokens hasheados en reposo (sesión + reset).**
   - `hashToken()`: SHA-256 del token → 64 hex minúsculas.
   - `createSession`, `createResetToken`: persisten `hashToken(token)`, devuelven
     el token crudo una sola vez.
   - `getSession`, `deleteSession`, `consumeResetToken`: hashean el token entrante
     antes del lookup (los clientes siguen enviando el token crudo).
   - Migración `hashTokensAtRest()` (idempotente, NO destructiva): hashea in-place
     las filas planas preexistentes. Discriminador plano vs hasheado: 64 hex
     MAYÚSCULAS = plano; minúsculas = ya hasheado (`GLOB '*[A-Z]*'`).
2. **`backend/utils/password.js` — scrypt endurecido a N=2^16 (65536).**
   - `SCRYPT_N = 16384 → 65536`. `hashPassword` y `verifyPassword` pasan
     `maxmem` a `scryptSync`.
   - ⚠️ **Gotcha de Node v24/OpenSSL 3**: `128*r*N` (64MB) NO basta → "memory
     limit exceeded". Usar 256MB de tope (`Math.max(256MB, 128*r*N)` en verify).
   - Hashes viejos siguen verificando (leen N/r/p del propio hash).
3. **`backend/routes/payments.js` — rate-limiter dedicado a `create-checkout`.**
   - `checkoutLimiter`: 10 req/min por IP, aplicado al POST de `create-checkout`
     (endpoint pre-pago sin `requireLicense`, abusable para crear Checkout
     Sessions de Stripe). Mensaje `rate_limited` en español, consistente con la API.

**Nota de entorno (no es cambio de código)**: hubo que `npm rebuild better-sqlite3`
en `backend/` porque el `better_sqlite3.node` estaba compilado para Node 22 (ABI
127) y el Node activo ahora es v24 (ABI 137) → la carga fallaba con
`ERR_DLOPEN_FAILED`. Tras el rebuild carga OK. Esto es un artefacto local de la
máquina de dev, no un cambio que haya que deployar.

**Cómo validar en la próxima sesión:**
```bash
cd backend && node test/e2e.test.js   # esperado: 107 OK / 0 FAIL
```

**Pendiente (decisión del usuario, no bloqueante):**
- Commit + push de los 3 archivos (+ este doc).
- Deploy al VPS (flujo estándar de `deploy.md` §8): `git pull` + `pm2 restart`.
  ⚠️ En producción, al reiniciar el backend correrá `hashTokensAtRest()` la
  primera vez → hasheará las sesiones/reset-tokens planos existentes (no revoca
  nada). El scrypt N=2^16 es ~0.3-0.6s por hash, aceptable en auth de bajo volumen.
## 22. Handoff 2026-09-19 — auditoría before-deploy (60 puntos)

**Trabajo en curso**: auditoría pre-deploy de 60 puntos (20 seguridad / 20
performance-APIs-robustez / 20 SEO-páginas). Estado: **COMPLETADO y verificado**
(backend e2e 107/107 PASS, `npm run build` frontend OK). Falta commit/deploy
(decisión del usuario). El informe completo punto a punto se entregó en la sesión;
aquí queda el resumen operativo.

**Cambios aplicados:**

1. **`backend/utils/http.js` (nuevo) — `fetchWithTimeout(url, opts, ms)`.**
   Wrapper de `fetch` con `AbortSignal.timeout`. Sin él, una llamada colgada a
   Gemini/Stripe/Resend podía retener el socket de Express y (en el caso de
   Gemini) un slot de cuota IA indefinidamente.
   - `routes/proxy.js`: Gemini → 60s (default; el timeout libera el slot de
     cuota reservado al abortar).
   - `routes/payments.js`: `checkout/sessions` y `billing_portal/sessions` → 30s.
   - `routes/webhooks.js`: `fetchStripeSubscription` → 30s.
   - `utils/mailer.js`: Resend → 15s.
2. **`backend/scripts/backup-db.sh` (nuevo, +x)** — backup consistente en caliente
   con `sqlite3 "$DB" ".backup ..."`, verificación `PRAGMA integrity_check`
   (borra la copia si falla), retención 14 días. Listo para cron:
   `30 3 * * * /home/deploy/nokfi/backend/scripts/backup-db.sh >> /home/deploy/nokfi/backend/db/backups/backup.log 2>&1`
3. **`.gitignore`** — ignorados `backend/db/*.db`, `*.db-wal/-shm/-journal` y
   `backend/db/backups/` (antes ni tracked ni ignorados → riesgo de commitear
   datos reales).
4. **`backend`: `npm audit fix`** → 0 vulnerabilidades (morgan ≥1.12, qs vía
   body-parser/express).
5. **SEO/páginas públicas (frontend):**
   - `src/hooks/usePageMeta.js` (nuevo): `document.title` + meta description por
     página. Aplicado en Landing, Pricing, Login, ResetPassword, Reveal.
   - `src/pages/NotFound.jsx` (nuevo): 404 real en vez de redirect a `/login`
     (soft-404). Ruta `*` en `App.jsx`.
   - `src/pages/Privacidad.jsx` (nuevo) + ruta `/privacidad`: política de
     privacidad con contenido **solo real** (datos que sí se guardan, parseo
     local de archivos, terceros Stripe/Gemini/Resend/Cloudflare, RGPD).
   - `Landing.jsx`: sección FAQ (5 Q&A reales, i18n) + enlace a privacidad en
     footer.
   - `index.html`: canonical + OG/Twitter card (`og-image.png` 1200×630 generado
     del favicon real, sin inventar imagen de marca).
   - `public/robots.txt`: permite `/`, `/pricing`, `/privacidad`; disallow
     `/app`, `/login`, `/reset-password`, `/reveal`, `/api/`.
   - i18n `es.js`/`en.js`: claves `meta.*`, `landing.faq*`, `privacy.*`,
     `notFound.*`.

**Regla respetada**: nada inventado (sin métricas, testimonios, equipo, fotos,
tiempos de respuesta ni datos de contacto que no existan).

**Cómo validar:**
```bash
cd backend && node test/e2e.test.js   # 107 OK / 0 FAIL
cd frontend && npm run build          # build OK; dist incluye robots.txt y og-image.png
```

**Pendiente tras este handoff (no bloqueante):**
- Commit + push (usuario) → VPS: `git pull --ff-only`, `pm2 restart nokfi-backend --update-env`,
  rebuild frontend, y opcional `npm audit fix` en el backend del VPS.
- Activar el cron de backup en el VPS (línea de arriba).
- Upgrades de majors del frontend (breaking, NO aplicados a propósito):
  react-router-dom 6→7.18, vite 5→8 + vite-plugin-pwa, jspdf 2→4 +
  jspdf-autotable 3→5. La DOMPurify vulnerable es la **nested de jspdf 2.5.2**
  (solo la usa `jspdf.html()`, que Nokfi no usa); la DOMPurify directa ya es
  3.4.15 (parcheada). xlsx sigue sin fix (riesgo aceptado, client-side only).
- Forwarding `info@nokfi.app` (la página de privacidad lo cita como contacto
  RGPD) — Namecheap gratis, ya en backlog.
- Monitor externo (UptimeRobot free) sobre `/health` — requiere cuenta del usuario.
- Redirect `www → apex` 301 en Nginx (anotado en `deploy/nginx-nokfi.conf`).

## 23. Handoff 2026-09-21 — Recuperación de acceso con OTP

**Trabajo en curso**: flujo de recuperación para usuarios que olvidan la clave
de licencia (y/o la contraseña). Estado: **COMPLETADO y verificado (120/120 e2e
PASS, build frontend OK)**. Falta commit/deploy (decisión del usuario).

**Motivación**: el reset de contraseña clásico exige la clave de licencia;
quien la olvida queda bloqueado sin vía de recuperación.

**Diseño** (aprobado por el usuario, decisiones 1-4):
- Un solo punto de entrada: `/recuperar` pide solo el **email**.
- Backend envía **OTP de 6 dígitos** (10 min, máx. 5 intentos, máx. 3
  solicitudes/hora por email, hasheado SHA-256 en reposo, un solo OTP vivo por
  email). Respuesta siempre genérica (anti-enumeración).
- Tras verificar: pantalla muestra **todas las claves activas del email** +
  botón "reenviar por email" + cambio de contraseña **opcional** en el mismo
  viaje (el OTP ya demuestra posesión del buzón). El email NUNCA lleva la clave.
- El flujo clásico (`/reset-password`, email+clave+enlace) queda **intacto**.

**Multi-licencia** (decisión 2026-09-21, opción 2 del usuario): un email puede
tener varias licencias activas. El `recovery_token` se ancla a la primera (FK
obligatoria en `reset_tokens`), pero `confirm-recovery` recibe `license_key` y
aplica la nueva contraseña SOLO a esa licencia (validando que pertenece al
email verificado). Si hay varias, la UI muestra un selector de clave.

**Cambios:**

1. **`backend/db/database.js`** (aditivo):
   - Tabla `otp_codes` (email, code_hash, attempts, used, expires_at) + índice.
   - Migración `runRecoveryPurposeMigration`: amplía el CHECK de
     `reset_tokens.purpose` con `'recovery'` (patrón RENAME/copy ya usado;
     copia TODAS las filas). En DBs frescas el CREATE ya lo incluye.
   - Helpers: `createOtp`, `verifyOtp` (reasons: no_code/burned/mismatch),
     `countRecentOtps`, `getActiveLicensesByEmail`, `peekResetToken`
     (validar sin consumir — para el reenvío de claves).
2. **`backend/utils/mailer.js`**: `sendRecoveryOtpEmail` (solo el código) y
   `sendRecoveredKeysEmail` (solo a petición tras verificar).
3. **`backend/routes/auth.js`**: 4 endpoints nuevos (`request-recovery`,
   `verify-recovery-otp`, `resend-recovered-keys`, `confirm-recovery`), todos
   bajo el `authLimiter` existente. Ningún endpoint existente tocado.
4. **`backend/test/e2e.test.js`**: 13 tests nuevos (anti-enumeración, intentos,
   quemado, hash en reposo, flujo completo, token de un solo uso, límite 3/hora,
   aislamiento por licencia y license_key ajena → 400).
   **107 → 123 tests, todos PASS.**
5. **Frontend**:
   - `src/pages/Recuperar.jsx` (nueva): 3 pasos (email → código → claves +
     cambio opcional de contraseña), estilo Shell de Login/Reveal.
   - `src/middleware/api.js`: 4 métodos nuevos en `authApi`.
   - `src/App.jsx`: ruta `/recuperar`. `Login.jsx`: enlace "¿Olvidaste tu clave
     o contraseña?". i18n `recovery.*` + `meta.recoveryTitle` + `login.forgotKey`
     en es/en. `robots.txt`: Disallow `/recuperar`.

**Cómo validar:**
```bash
cd backend && node test/e2e.test.js   # 123 OK / 0 FAIL
cd frontend && npm run build          # OK
```

**Nota de deploy**: al arrancar en el VPS, `runRecoveryPurposeMigration`
reconstruirá `reset_tokens` (copia íntegra de filas, no destructivo). Los
emails de OTP salen por Resend con el dominio ya verificado — sin config nueva.

---

## 24. Sesión 12 — SEO (2026-10-02)

- **Páginas públicas** en `frontend/src/seo/routes.js` (lista única): castellano
  en la raíz e inglés bajo `/en/…`, enlazadas con `hreflang`. fr/it/de/pl siguen
  en la app sin URL propia. En estas páginas manda el idioma de la URL
  (`effectiveLang`); en la landing y precios, si el visitante usa fr/it/de/pl,
  se le muestra su idioma.
- **Prerender**: `npm run build` = `vite build` + `vite build --ssr
  src/entry-server.jsx` + `scripts/prerender.mjs`, que renderiza cada ruta con
  React en Node y escribe `dist/<ruta>/index.html` con title, description,
  canonical, hreflang, Open Graph y JSON-LD, más `dist/sitemap.xml`. El navegador
  hidrata ese HTML (`main.jsx`). Nginx no cambia: `try_files $uri $uri/ /index.html`.
- **Contenido** en `src/seo/content/{es,en}.js` (herramientas, guías, FAQ).
  Cifras de cotización 2026 del BOE (Orden PJC/297/2026) en `utils/spainRates.js`:
  revisar cada año, igual que el calendario fiscal (dos copias comprobadas con
  `npm run check:seo`).
- **Medición**: Cloudflare Web Analytics (visitas, sin cookies; se activa en el
  panel de Cloudflare) y `POST /api/events` (clics en «Probar gratis», pagos
  empezados y usos de herramientas) en el informe diario.
- **Rendimiento**: React aparte de las librerías pesadas y fuente alojada en
  Nokfi; Lighthouse móvil: SEO, accesibilidad y buenas prácticas 100.

