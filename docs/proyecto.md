# Nokfi — Documento maestro del producto

> Última actualización: **2026-08-16**. Estado: **producción en vivo bajo HTTPS con
> Cloudflare (Full strict) y cobros reales Stripe**.
>
> Este es el documento de referencia del producto Nokfi. Para el contrato técnico
> Backend↔Frontend ver [`api.md`](api.md); para el despliegue y operación del VPS
> ver [`deploy.md`](deploy.md).

---

## 1. Qué es Nokfi

SaaS de **diagnóstico financiero** para autónomos y pymes. Combina un **cuestionario
interactivo** (5 bloques × 6 preguntas Sí/No) con el **análisis de archivos
Excel/PDF** mediante IA (Google Gemini), generando **informes estilo consultoría**
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
| Backend | Node.js 22 + Express + SQLite (`better-sqlite3`) |
| IA | Google Gemini (`gemini-flash-latest`) |
| Frontend | React + Vite + Tailwind CSS + PWA |
| Gráficas | Recharts |
| Excel/PDF | `xlsx` (SheetJS), `jspdf`, `pdfjs-dist` |
| Pagos | **Stripe** (suscripción mensual; PayPal/Revolut/Coinbase retirados) |
| Email | Resend (provider único; SendGrid retirado) |
| Despliegue | Ubuntu 24.04 + PM2 + Nginx + **Cloudflare (edge)** |

```
nokfi/
├── backend/            # API REST — Express + SQLite + Gemini
│   ├── server.js       # Punto de entrada: Helmet, CORS, rate limiters, raw webhook
│   ├── config/         # plans.js (precios/cuotas/trial) + stripe-version.js
│   ├── db/             # database.js (esquema, migraciones, acceso a datos)
│   ├── middleware/     # requireLicense.js
│   ├── routes/         # auth.js, proxy.js, payments.js, webhooks.js, admin.js, profile.js, analyses
│   ├── utils/          # password.js (scrypt), mailer.js (Resend), sanitize.js
│   └── test/           # e2e.test.js (94/94 PASS)
├── frontend/           # PWA — React + Vite + Tailwind
│   └── src/
│       ├── pages/      # Landing, Login, Reveal, ResetPassword, Pricing, Home,
│       │               # Cuestionario, ExcelHub + excel/ (6 subapartados), Historial,
│       │               # Calculadoras, Informes, Configuracion
│       ├── middleware/ # api.js (cliente HTTP), sanitize.js, exportUtils.js, pdfExtract.js
│       ├── context/    # AuthContext, ThemeContext, LangContext
│       └── hooks/      # useApi, useCompanyProfile...
├── deploy/             # nginx-nokfi.conf (site) + nginx-cloudflare-realip.conf (real-IP)
└── docs/               # esta documentación
```

> Ubicación real y operación del VPS: ver [`deploy.md`](deploy.md).

## 6. Esquema de base de datos

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

Detalle de cada endpoint y sus códigos de error: ver [`api.md`](api.md).

## 8. Endpoints agrupados

| Área | Ruta | Auth |
|------|------|------|
| Auth | `/api/auth/{activate,login,verify,logout,reveal-key,change-password,request-password-reset,confirm-password-reset}` | según ruta |
| IA | `/api/proxy/ai` | Bearer |
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

El backend pide a Gemini un **HTML seguro** marcado con el tipo de subapartado,
que el frontend renderiza con `sanitizeAiHtml` (nunca `dangerouslySetInnerHTML`
directo — datos generados de usuario, no se confían). El informe incluye cifras,
gráficas (Recharts) y recomendaciones concretas.

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
  (`/api/profile`), e2e **94/94 PASS**.
- ⏳ **Opcional / no bloqueante (cosmético)**: forwarding de
  `info@/help@/soporte@nokfi.app` vía Namecheap (gratis, CF no proxya MX/TXT).
  Deuda H (cuota IA TOCTOU bajo concurrencia) documentada en `deploy.md` §Deudas.