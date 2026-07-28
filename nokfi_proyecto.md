# Nokfi — Documento de Definición del Proyecto
> Estado: **Fase 3 desplegada en producción** (VPS `191.44.112.86`).
> Modelo de billing: **suscripción mensual** vía **Stripe** (mini / pro / max), con
> **trial de 14 días** en el plan mini. Auth por **email + clave + contraseña**
> (el device-fingerprint se eliminó en `f9385af`). Backend completo + desplegado
> y probado; **frontend construido y compilando** (no servido por VPS todavía —
> Nginx pendiente); landing en diseño. PayPal / Coinbase / Revolut retirados.
> Última actualización: julio 2026.

---

## 1. Visión general

Software SaaS de análisis financiero para autónomos y pymes españolas. Combina un cuestionario de diagnóstico interactivo con análisis de archivos Excel mediante IA, generando informes estilo consultoría con recomendaciones concretas para mejorar la salud financiera del negocio.

Desarrollado por un equipo de 3 personas con perfiles complementarios: programación, ciberseguridad y finanzas.

---

## 2. Modelo de negocio

### Distribución
- **Landing page pública** (`vuestrodominio.com`) donde se explica el producto, se elige plan y se realiza el pago
- **Web app protegida** (`app.vuestrodominio.com`) a la que solo se accede con clave válida
- Formato **PWA** (Progressive Web App): se puede añadir al escritorio o móvil como si fuera una app nativa, sin pasar por App Store ni Google Play, sin instalación real
- No hay versión de escritorio descargable — todo corre en el navegador y en vuestro VPS

### Por qué web app y no escritorio (Electron)
- Las actualizaciones se despliegan en el servidor y todos los usuarios las reciben automáticamente
- El anti-bypass se gestiona 100% en el servidor, donde vosotros tenéis el control
- Un ejecutable de escritorio se puede decompilar; una web app con lógica de validación en servidor no
- El software requiere conexión a internet de todas formas (llama a la IA), así que no hay ventaja en trabajar offline

### Planes de precio (suscripción mensual)
| Plan | Precio/mes | Cuota IA/día | Trial | Funciones |
|------|-----------|--------------|-------|-----------|
| **mini** | **5 €** | 10 análisis | **14 días gratis** (tarjeta obligatoria) | Cuestionario + análisis Excel/PDF + informe + calculadoras |
| **pro** | **20 €** | 50 análisis | — | Todo mini + más cuota |
| **max** | **50 €** | 130 análisis | — | Todo pro + más cuota |

- Los **precios (5/20/50 €)** son env-driven: se definen en `PLAN_PRICE_MINI_EUR` / `_PRO_EUR` / `_MAX_EUR` del `.env` del backend. Cambiarlos y reiniciar PM2 mueve a la vez lo que **cobra Stripe** y lo que **muestra la web** (vía `GET /api/payments/plans`) — anti-drift. Defaults 5/20/50.
- Las **cuotas de IA (10/50/130 análisis/día)** son decisión de producto, **no** env-driven — viven en `backend/config/plans.js` (`PLAN_QUOTAS`). Es el mecanismo anti-sharing: una sola clave compartida agota su cuota diaria entre todos los que la usen.
- **Una clave = una contraseña**, no un dispositivo fijo. El login es email + clave + contraseña (sección 5); el dispositivo ya no se fija.

---

## 3. Flujo completo de venta

```
Landing page pública  (nokfi.app, pendiente de servir en el VPS)
        ↓
[Comprar ahora] → selección de plan (mini / pro / max)
        ↓
POST /api/payments/stripe/create-checkout → Checkout Session de Stripe
        ↓
Stripe Checkout (suscripción mensual; mini pide tarjeta y muestra "14-day trial")
        ↓
Webhook checkout.session.completed → servidor genera clave + crea suscripción
        ↓
Página /reveal?session_id=... → muestra la clave recién comprada en la web
        ↓
Email automático de respaldo con la clave al email del comprador
        ↓
Usuario accede a app.nokfi.app
        ↓
Pantalla de login (Email + Clave + Contraseña)
        ↓
Servidor valida → sesión activa → Dashboard
```

> **Ya no hay "token de un solo uso de 15 minutos"** para la revelación de clave.
> El buyer vuelve de Stripe a la página `/reveal?session_id={CHECKOUT_SESSION_ID}`:
> el `session_id` es la URL-secreta que Stripe solo entrega al navegador del comprador
> (va en el `success_url`). El endpoint `GET /api/payments/stripe/reveal` la busca por
> `payment_ref` y, si el webhook ya llegó, devuelve `{ key, email, plan }`. No expone
> nada que el comprador no tenga ya en su bandeja de entrada.

### Qué es el email automático de respaldo
Cuando el usuario compra, introduce su email en el checkout. El servidor, sin
intervención manual de vuestro equipo, le envía automáticamente un correo con su
clave `XXXX-XXXX-XXXX-XXXX`. Sirve como seguro por si el usuario cierra la pestaña
de revelación antes de copiar la clave o le falla la conexión. Lo envía el servidor
vía **SendGrid** o **Resend** con vuestro dominio como remitente.

---

## 4. Pasarela de pago

### Único proveedor: Stripe (suscripción mensual)
El proyecto nació planteando 4 pasarelas (Stripe, PayPal, Revolut, Coinbase Commerce),
pero **solo Stripe se probó de extremo a extremo**. Al pasar al modelo de **suscripción
mensual** (Fase 3) se tomó la decisión de quedarse **solo con Stripe** y retirar las
otras tres: PayPal/Coinbase/Revolut no soportan cobro recurrente tan limpio como
Stripe, y mantener 4 proveedores solo para el viejo pago único era deuda sin contrapartida.

- **Stripe** — tarjeta de crédito/débito, Apple Pay, Google Pay. Comisión ~1.5% + 0.25€
  en tarjetas europeas. El dinero llega a vuestra cuenta bancaria automáticamente.
- **Modo suscripción** (`mode=subscription`), **intervalo mensual**, precio en céntimos
  derivado del `.env` (`unit_amount = Math.round(eur*100)`).
- **Trial de 14 días solo en mini** con tarjeta obligatoria (Stripe bloquea reusar la
  misma tarjeta para un 2º trial → anti-farmeo). Al día 14 cobra; si falla, los webhooks
  existentes gestionan `past_due→suspended→expired` sin scheduler.
- **Gestión de suscripción** (cancelar a fin de periodo, mejorar de plan con prorrata,
  actualizar tarjeta): se delega al **Stripe Customer Portal nativo**
  (`POST /api/payments/stripe/create-portal-session`), nunca a endpoints custom — el
  Portal ya resuelve prorratas, currencies y dunning. Mejorar de plan (mini→pro→max)
  usa un Stripe Price por plan (`STRIPE_PRICE_*`) para que el Portal infiera el plan
  tras un upgrade; si faltan, cae a `subscription.metadata.plan`.

### Proveedores retirados (PayPal / Coinbase / Revolut)
Los antiguos endpoints `POST /api/payments/paypal/create-order`,
`/coinbase/create-charge` y `/revolut/create-order` **fueron eliminados** al pasar a
Stripe-only. Ya no están montados → devuelven `404 { error: "not_found" }` al caer al
404 global del backend. Lo mismo con los webhooks `/api/webhooks/paypal`, `/coinbase` y
`/revolut`. `backend/utils/paypalAuth.js` se borró. **El frontend no debe tener botones
de PayPal/Coinbase/Revolut.**

> El `CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut',NULL))` de la
> tabla `licenses` se **conserva deliberadamente**: documenta el universo histórico de
> proveedores y no cuesta nada (0 licencias reales en el VPS). No es deuda a limpiar.

### Configurar Stripe (fuera del código)
- Abrir una cuenta **Stripe Business** (DNI + datos bancarios + descripción del
  negocio — el usuario está a la espera de la verificación de empresa para obtener
  las claves; mientras, `create-checkout` responde `stripe_not_configured`).
- **API version ≥ `2024-04-10`** en el dashboard — el backend la fija en
  `backend/config/stripe-version.js` (`Stripe-Version` header); el
  `trial_settings[end_behavior][type]=release` del trial de mini lo exige.
- API keys + webhook secret → pegar en `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
  del `.env` del backend. Endpoint del webhook: `https://app.nokfi.app/api/webhooks/stripe`
  (mientras no haya dominio, la IP del VPS).
- Eventos a escuchar como mínimo: `checkout.session.completed`,
  `invoice.paid`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`, `charge.dispute.created`.

### Seguridad anti-bypass del pago
- La clave **nunca existe antes del pago confirmado** — se genera solo cuando el
  webhook de Stripe llega al servidor con firma HMAC-SHA256 válida (con prevención de
  replay: rechaza timestamps fuera de ±5 min).
- No hay ningún endpoint que devuelva una clave sin haber validado el pago previamente
  en el servidor. `/reveal` solo entrega la clave que **ya** existe porque el webhook
  la creó; el `session_id` que pide es el secreto que Stripe entrega solo al comprador.

---

## 5. Sistema de autenticación y seguridad

### Formato de clave
```
XXXX-XXXX-XXXX-XXXX
```
Ejemplo: `A3F2-9C1E-B847-D205` — generada con `crypto.randomBytes`, hex, unicidad
garantizada en base de datos. Insensible a mayúsculas.

### Login — 3 factores: email + clave + contraseña
Los tres deben coincidir con la base de datos:
1. **Email** — el introducido en el checkout
2. **Clave** `XXXX-XXXX-XXXX-XXXX`
3. **Contraseña** — elegida por el usuario al activar; almacenada como hash scrypt (mín. 8 caracteres)

Fallo en cualquiera de los tres = acceso denegado (`401 invalid_credentials`,
mensaje **siempre** genérico para no revelar si la cuenta existe — anti-enumeración).

> **Cambió el modelo de auth (commit `f9385af`):** el proyecto original usaba **device
> fingerprint del navegador** como tercer factor (la licencia se vinculaba a un
> dispositivo fijo). **Se eliminó.** Ahora el tercer factor es una **contraseña**.
> El anti-sharing delega en la **cuota diaria de IA por licencia** (mini 10 / pro 50 /
> max 130): una clave compartida se agota entre todos los que la usan. El campo
> `device_name` sigue existiendo solo como etiqueta legible que el usuario ve en
> Configuración — **no** participa en la autenticación.

### Dos puertas de entrada a la contraseña
- **`/activate`** (primer acceso) — la licencia nueva de Stripe aún no tiene contraseña;
  el usuario la elige aquí. `201` devuelve sesión activa directamente.
- **`/login`** (siguientes accesos) — ya con contraseña. Si la licencia existe pero no
  tiene contraseña → `409 not_activated` (el frontend redirige al flujo `/activate`).

### Olvido de contraseña — reset por email
`/request-password-reset` recibe `{ email, license_key }`: si la licencia existe y no
ha agotado su reseteo anual, genera un token de 30 min y lo envía por email. Responde
**siempre** 200 con mensaje genérico (existen o no los datos) salvo si se pasó el
límite anual (`429 reset_limit_reached`). `/confirm-password-reset` recibe el token del
email + la nueva contraseña: la setea y **crea sesión inmediata** (no hace falta login).
El reset por email **no** revoca sesiones previas (el usuario puede tener otra pestaña).

### Capas de seguridad anti-bypass del login

**Capa 1 — Frontend sin rutas accesibles**
La app arranca siempre en login. El dashboard solo se monta en memoria si existe una
sesión válida verificada por el servidor.

**Capa 2 — Validación en cada petición**
Cada llamada al backend (análisis IA, Customer Portal…) requiere un token de sesión
válido (`requireLicense`). Sin token → `401`, la app no muestra nada.

**Capa 3 — Contraseña con hash scrypt**
La contraseña nunca viaja al frontend ni se guarda en claro. Scrypt (salada) resiste
fuerza bruta offline si la DB se filtra. `reveal-key` y `change-password` exigen
re-introducir la contraseña actual.

**Capa 4 — Tokens de sesión con expiración**
Los tokens de sesión expiran (se limpian los expirados cada hora) y van en la cabecera
`Authorization: Bearer`, no en cookies — por eso CSRF no aplica (ver `server.js`).

**Capa 5 — Rate limiting agresivo**
Máximo ~5 intentos fallidos de login por IP en 15 min → bloqueo temporal
(`authLimiter`, 10/15min incluyendo éxitos; en desarrollo se relaja). Previene fuerza
bruta.

**Capa 6 — Revelación de clave limitada**
La clave sale completa **una sola vez**: en `/reveal` tras el checkout, y a pedido en
`/reveal-key` (Configuración, re-introduciendo contraseña). Fuera de ahí, enmascarada
`••••-••••-••••-AB3F`.

### Pantalla de revelación de clave (`/reveal`)
- Aparece tras volver de Stripe Checkout (`?session_id={CHECKOUT_SESSION_ID}`)
- Polling a `GET /api/payments/stripe/reveal` hasta que el webhook crea la licencia (200)
- Toggle para mostrar/ocultar la clave completa, botón de copiar
- Aviso: esta es la única vez que se muestra completa en la web (el email de respaldo la lleva también)

---

## 6. Arquitectura técnica

### Stack
- **Frontend** — React (Vite) · PWA · Tailwind CSS
- **Backend** — Node.js 22 + Express
- **Base de datos** — SQLite (con better-sqlite3) en el VPS (`./db/nokfi.db`)
- **Servidor** — VPS Ubuntu 24.04, PM2 (fork mode), `191.44.112.86`
- **Email transaccional** — SendGrid o Resend (el operador elige uno)
- **Pasarela de pago** — **Stripe** (suscripción mensual); PayPal/Revolut/Coinbase **retirados**
- **IA** — Google Gemini (`gemini-flash-latest` / `gemini-2.5-flash`), free tier

### Estructura real del proyecto

> Estado real verificado en el repo. `backend/` está completo, testeado (e2e 61/61) y
> desplegado en el VPS. `frontend/` está construido y compila con `npm run build`
> (no servido por el VPS todavía). `landing/` no existe todavía. La carpeta `config/`
> se añadió en Fase 3 como **fuente única de planes** (antes había 4 copias de
> precios/cuotas dispersas → drift).

```
/
├── backend/                          ✅ IMPLEMENTADO + DESPLEGADO (VPS)
│   ├── server.js                     ← Express: helmets, CORS, raw webhook, rate limiters, rutas
│   ├── package.json                  ← express, better-sqlite3, cors, helmet, express-rate-limit, morgan, dotenv
│   ├── .env.example                  ← plantilla documentada (Stripe-only; PAYPAL/REVOLUT/COINBASE fuera)
│   │
│   ├── config/                       ← Fase 3: fuente única
│   │   ├── plans.js                  ← PLANS (precios env-driven via PLAN_PRICE_*_EUR, cuotas 10/50/130, trial)
│   │   └── stripe-version.js         ← '2024-04-10' fijada para todos los fetch a Stripe (antidrift del trial)
│   │
│   ├── db/
│   │   └── database.js                ← esquema + migraciones + acceso a datos (licencias, sesiones, webhooks, stats)
│   │
│   ├── middleware/
│   │   └── requireLicense.js          ← valida sesión + licencia activa (sin fingerprint, ya no existe)
│   │
│   ├── routes/
│   │   ├── auth.js                   ← activate, login, verify, logout, reveal-key, change-password, request/confirm-password-reset
│   │   ├── proxy.js                  ← proxy a Gemini + cuota diaria por licencia (requireLicense)
│   │   ├── payments.js                ← /plans, /stripe/create-checkout, /stripe/create-portal-session, /stripe/reveal (solo Stripe)
│   │   ├── webhooks.js               ← webhook Stripe (HMAC + anti-replay) → alta/renovación/cancel/chargeback
│   │   └── admin.js                  ← CRUD licencias, stats (con bloque billing), audit log (ADMIN_SECRET)
│   │
│   ├── utils/
│   │   ├── password.js               ← hash scrypt (salt) + verificación + reset coherente (reemplaza a fingerprint.js)
│   │   └── mailer.js                 ← SendGrid/Resend: clave, reset, revocación
│   │
│   └── test/
│       └── e2e.test.js               ← 61/61 PASS (incluye /plans, cuotas 10/50/130, MRR, trial)
│
├── frontend/                         ✅ CONSTRUIDO (compila) · ⏳ no servido por VPS todavía
│   └── src/
│       ├── pages/                    ← Login, Reveal, ResetPassword, Pricing, Home, Cuestionario,
│       │   │                            ExcelHub, excel/ (6 subapartados), Historial, Calculadoras,
│       │   │                            Informes, Configuracion
│       ├── middleware/api.js         ← cliente HTTP centralizado (Bearer, manejo de error codes)
│       ├── middleware/exportUtils.{js,...}  ← PDF/Excel + neutralización de formula/CSV injection
│       ├── middleware/sanitize.js    ← DOMPurify contra XSS del HTML de la IA
│       ├── context/                  ← Auth, Theme, Lang (Context API, sin Redux)
│       ├── hooks/  components/  layouts/  i18n/
│
├── *.md  (nokfi_proyecto.md, nokfi_api_contract.md, nokfi_contexto_claude_code.md, handoff.md)
│          ↑ ahora en la raíz del repo (antes en md/)
│
└── (landing no existe todavía — diseño definido en sección 13)
```

### Mapa de endpoints del backend implementado

> Fuente de verdad detallada (shapes de request/response, códigos de error): `nokfi_api_contract.md`.

| Método | Ruta | Protección | Función |
|--------|------|------------|---------|
| POST | `/api/auth/activate` | Pública | Primer acceso: elegir contraseña y activar la licencia |
| POST | `/api/auth/login` | Pública | Login con email + clave + contraseña |
| POST | `/api/auth/verify` | Bearer | Comprobar validez de sesión (devuelve `valid`, no `success`) |
| POST | `/api/auth/logout` | Bearer | Cerrar sesión actual |
| POST | `/api/auth/reveal-key` | Bearer | Revelar la clave re-introduciendo la contraseña (Configuración) |
| POST | `/api/auth/change-password` | Bearer | Cambiar contraseña (requiere la actual) |
| POST | `/api/auth/request-password-reset` | Pública | Solicitar email de reseteo de contraseña (anti-enumeración) |
| POST | `/api/auth/confirm-password-reset` | Token del email | Confirmar + setear nueva contraseña (crea sesión inmediata) |
| POST | `/api/proxy/ai` | Bearer (requireLicense) | Proxy a Gemini + cuota diaria por licencia |
| GET | `/api/payments/plans` | Pública | Catálogo público de planes (anti-drift, lo fetchea Pricing.jsx) |
| POST | `/api/payments/stripe/create-checkout` | Pública | Checkout Session de suscripción mensual (mini con trial 14 días) |
| POST | `/api/payments/stripe/create-portal-session` | Bearer (requireLicense) | Stripe Customer Portal (cancelar / mejorar plan / actualizar tarjeta) |
| GET | `/api/payments/stripe/reveal` | Pública (`?session_id=`) | Página /reveal: muestra la clave recién comprada |
| POST | `/api/webhooks/stripe` | Firma HMAC-SHA256 + anti-replay (raw body) | Alta/renovación/cambio/cancelación/chargeback de suscripción |
| GET | `/api/admin/stats` | ADMIN_SECRET | Métricas de negocio + bloque `billing` (sección 16) |
| GET | `/api/admin/licenses` | ADMIN_SECRET | Listar todas las licencias |
| GET | `/api/admin/licenses/:id` | ADMIN_SECRET | Detalle de una licencia |
| POST | `/api/admin/licenses` | ADMIN_SECRET | Crear licencia manualmente (`billing_model='legacy'`) |
| PUT | `/api/admin/licenses/:id` | ADMIN_SECRET | Editar estado/plan/notas/email (revocar → cierra sesiones + email) |
| DELETE | `/api/admin/licenses/:id` | ADMIN_SECRET | Eliminar licencia permanentemente |
| POST | `/api/admin/licenses/:id/reset-password` | ADMIN_SECRET | Reseteo forzado (limpia pass + sesiones, sin límite anual) |
| POST | `/api/admin/licenses/:id/set-password` | ADMIN_SECRET | Asignar contraseña a una legacy sin contraseña |
| GET | `/api/admin/audit-log` | ADMIN_SECRET | Últimos eventos de auditoría |
| GET | `/health` | Pública | Health check |

**Rutas retiradas (ya no montadas → `404 not_found`):** `/api/payments/paypal/create-order`,
`/api/payments/coinbase/create-charge`, `/api/payments/revolut/create-order`,
`/api/webhooks/paypal`, `/api/webhooks/coinbase`, `/api/webhooks/revolut`.
**Renombradas:** `/request-device-reset` + `/confirm-device-reset` → `/request-password-reset` +
`/confirm-password-reset`; `/admin/licenses/:id/reset-device` → `/reset-password`.

### Variables de entorno del servidor (.env)

> Lista extraída directamente del código. Plantilla documentada disponible en `backend/.env.example` (mismos textos explicativos, ahí están los pasos para conseguir cada clave). Los bloques PayPal/Revolut/Coinbase **ya no existen** en `.env.example`.

```bash
# Servidor
PORT=3001
NODE_ENV=production

# Base de datos (RELATIVA — el proceso debe arrancar con cwd = backend/)
DB_PATH=./db/nokfi.db

# Seguridad
ADMIN_SECRET=                          # ≥32 chars, crypto.randomBytes(32).toString('hex'); en prod el backend se niega a arrancar si es más corta
ALLOWED_ORIGINS=https://app.nokfi.app,https://nokfi.app   # nunca "*" en prod (el backend aborta el arranque)

# URLs públicas (se usan en emails y en las redirecciones de pago)
APP_PUBLIC_URL=https://app.nokfi.app
LANDING_PUBLIC_URL=https://nokfi.app

# Precios de planes (suscripción mensual, EUR) — lo que cobra Stripe Y lo que muestra /plans
PLAN_PRICE_MINI_EUR=5
PLAN_PRICE_PRO_EUR=20
PLAN_PRICE_MAX_EUR=50

# IA — nunca expuesta al frontend (ver justificación abajo)
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash          # fallback a gemini-flash-latest; gemini-2.5-flash retirado por Google 07/2026

# Email transaccional — elegir un proveedor
EMAIL_PROVIDER=sendgrid                # 'sendgrid' o 'resend'
EMAIL_FROM=no-reply@nokfi.app
EMAIL_FROM_NAME=Nokfi
SENDGRID_API_KEY=SG....
RESEND_API_KEY=

# Stripe (única pasarela)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Opcionales (mejora de plan por Customer Portal — ver sección 4):
STRIPE_PRICE_MINI=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_MAX=price_...
```

> ⚠️ **`DB_PATH` es relativa** (`./db/nokfi.db`): el proceso de PM2 arranca con cwd = dir del
> backend, y `dotenv.config()` (sin path) carga `process.cwd()/.env`. Nunca arrancar el backend
> desde otro directorio o la DB y el `.env` no se resolverían. Ver `handoff.md` (topología VPS).

### Por qué la API key de la IA está en el servidor
La clave de Google Gemini nunca sale del servidor. El frontend manda los datos al proxy del backend (`POST /api/proxy/ai`, protegido por `requireLicense`), el backend llama a la IA, y devuelve la respuesta. Si la API key estuviera en el frontend cualquier usuario podría inspeccionarla con las herramientas del navegador y usarla por su cuenta.

### Decisión de proveedor de IA: Google Gemini (free tier)

> Decisión tomada tras evaluar Anthropic Claude como alternativa. Documentada aquí con sus implicaciones para que quede constancia explícita.

Se eligió **Google Gemini** (modelo `gemini-2.5-flash`) en su **plan gratuito** en vez de Anthropic Claude, principalmente por coste cero mientras el volumen de uso se mantenga bajo. Esta decisión tiene dos implicaciones que el equipo asume conscientemente:

1. **Privacidad:** en el free tier de Gemini, Google puede usar los prompts enviados (es decir, los datos financieros de los clientes de Nokfi — facturas, gastos, ingresos) para entrenar sus modelos. Esto no ocurre en el tier de pago de Gemini ni en Anthropic. Si en el futuro esto se considera un riesgo inaceptable (por ejemplo, al crecer la base de clientes o por exigencias contractuales de algún cliente grande), la solución es activar facturación en el proyecto de Google Cloud, lo que elimina el free tier y el uso de los prompts para entrenamiento, pero convierte a Gemini en un servicio de pago.
2. **Límite de cuota:** el free tier limita a aproximadamente 1.500 peticiones al día **por proyecto completo**, no por cliente individual. Si Nokfi alcanza un volumen de uso que se acerque a ese límite, los análisis empezarán a fallar con un error de cuota agotada (`ai_quota_exceeded`) hasta el día siguiente, salvo que se active facturación.

El backend ya contempla este segundo caso de forma explícita: cuando Gemini devuelve un 429 (cuota agotada), el proxy responde con `503 { error: "ai_quota_exceeded" }` en vez de un error genérico, para que el frontend pueda mostrar un mensaje claro al usuario en vez de un fallo confuso.

### Estado de verificación del backend

El backend está **desplegado en producción** (VPS `191.44.112.86`, PM2) con funcionalidad
verificada: `node --check` limpio en todos los `.js`, **61/61 tests e2e pasando**
(`backend/test/e2e.test.js`), todos los endpoints evaluados con curl real en el VPS
(health, login, proxy/ai con Gemini real, webhook de Stripe sandbox completo E2E,
CORS y headers de Helmet verificados con curl, administración de licencias completa).

Lo pendiente **no es código** — son claves de producción:
- [ ] Pegar `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` reales en el `.env` del VPS
  (el usuario está bloqueado a la espera de la verificación de empresa en Stripe; mientras,
  `create-checkout` responde `stripe_not_configured`)
- [ ] Verificar API version ≥ `2024-04-10` en el dashboard de Stripe (el backend la fija en `config/stripe-version.js`)
- [ ] Comprar dominio y desplegar Nginx + HTTPS (SSL con Certbot) + cabeceras de seguridad (documentada en sección 17)
- [x] Corrección de CSP (IP del VPS actualizada en `frontend/index.html` tras el cambio de VPS)



---

## 7. Base de datos — esquema real implementado

> Columnas actualizadas tras Fase 3 (suscripción + contraseña). El viejo modelo de
> device-fingerprint se eliminó: columnas `device_fingerprint`, `device_registered_at`
> y `last_device_reset` fuero DROPeadas en la migración de contraseña, y
> `sessions.fingerprint` también se eliminó. La migración de suscripción (Fase 3)
> añadió los campos de Stripe + `billing_model`; la migración de trial añadió
> `trial_ends_at`.

| Tabla | Propósito | Columnas clave |
|-------|-----------|-----------------|
| `licenses` | Clave, email, contraseña (scrypt), plan, estado, datos de suscripción de Stripe | `key`, `email`, `password_hash`, `status`, `plan`, `billing_model`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_ends_at`, `cancel_at_period_end`, `trial_ends_at`, `payment_provider`, `payment_ref`, `amount_eur` |
| `sessions` | Tokens de sesión activos | `token`, `license_id`, `expires_at` |
| `payment_events` | Idempotencia de webhooks — evita procesar el mismo evento dos veces | `provider`, `event_id` (único por proveedor), `amount_eur`, `processed` |
| `reset_tokens` | Tokens de un solo uso (reset de contraseña) | `token`, `purpose`, `license_id`, `used`, `expires_at` |
| `audit_log` | Registro de todos los eventos de seguridad | `event`, `license_id`, `ip`, `ts` |

Campos relevantes de `licenses` (detalle):
- `billing_model`: `'subscription'` (creada por webhook de Stripe) o `'legacy'` (creada a mano por admin)
- `stripe_customer_id` / `stripe_subscription_id`: IDs de Stripe; `customer_id` habilita el Customer Portal
- `current_period_ends_at` / `cancel_at_period_end`: fecha fin de periodo actual y flag de cancelación programada
- `trial_ends_at`: ISO si está en trial de 14 días (mini), `NULL` si no aplica o el trial ya terminó
- `payment_provider`: `'stripe'` (único activo; el CHECK admite también paypal/coinbase/revolut como documentación histórica)
- `amount_eur`: importe exacto de Stripe para métricas (no hardcodeado al precio del plan — renovaciones pueden tener prorrata)
- `password_hash`: scrypt salteado; `NULL` = licencia sin activar (recién creada por webhook)
- `device_name`: solo etiqueta legible; **no** participa en la autenticación

---

## 8. Panel de administración interno

Accesible solo con `ADMIN_SECRET` (comparación en tiempo constante para evitar timing attacks). Implementado en `routes/admin.js`. Funciones reales:

- Ver todas las licencias (`GET /api/admin/licenses`) y el detalle de una concreta (`GET /api/admin/licenses/:id`)
- Crear licencia manualmente (`POST /api/admin/licenses`) — `billing_model='legacy'`, sin suscripción de Stripe. Con flag opcional `notify: true` para enviar el email de la clave. Opcional `password` para setear contraseña inicial (sin `activate`)
- Editar licencia (`PUT /api/admin/licenses/:id`) — cambiar `status`, `plan`, `notes` o `email`. Si se cambia a `revoked`, se limpian automáticamente las sesiones activas y se envía el email de revocación
- Eliminar licencia permanentemente (`DELETE /api/admin/licenses/:id`)
- Forzar reseteo de contraseña (`POST /api/admin/licenses/:id/reset-password`) — limpia contraseña + sesiones, sin el límite de 1/año que aplica al reseteo por email
- Asignar contraseña (`POST /api/admin/licenses/:id/set-password`) — para licencias legacy migradas sin contraseña, sin tocar sesiones
- Ver métricas globales (`GET /api/admin/stats?period=30`) — activaciones, ingresos, estado de licencias + **bloque `billing`** (sección 16)
- Ver registro de auditoría (`GET /api/admin/audit-log?limit=50`)

> **Nota:** la creación de licencias en lote (bulk) no se implementó en esta versión. Si en el futuro se necesita generar licencias en lote (p. ej. para una campaña de partners), se puede añadir como extensión sin tocar el resto del sistema.

---

## 9. UI / Dashboard — estructura y secciones

### Estética visual
Dos temas globales seleccionables en configuración:
- **Oscuro** — grafito oscuro + verde esmeralda
- **Claro** — blanco + azul marino + acentos verdes

### Menú lateral persistente — secciones
1. **Home** — pantalla principal al entrar
2. **Cuestionario** — diagnóstico por preguntas
3. **Análisis Excel** — subida y análisis de archivos
4. **Historial** — análisis anteriores y comparativas
5. **Calculadoras** — herramientas financieras
6. **Informes** — exportación de resultados
7. **Configuración** — preferencias y perfil

---

### Sección 1 — Home
Métricas combinadas visibles nada más entrar:
- Puntuación de salud financiera (del último cuestionario)
- KPIs clave del último Excel subido (ventas, pedidos, productos top)
- Alertas activas detectadas por la IA
- Accesos rápidos a las secciones principales

---

### Sección 2 — Cuestionario de diagnóstico
5 bloques temáticos con 6 ítems cada uno. Para cada ítem el usuario pulsa "Sí lo tengo" o "No lo tengo":

| Bloque | Contenido |
|--------|-----------|
| Ingresos y ventas | Facturación, control de cobros, previsiones, descuentos, clientes recurrentes, margen por producto |
| Gastos y costes | Gastos fijos, variables, presupuesto mensual, tickets digitales, gastos de personal, revisión de proveedores |
| Pedidos y stock | Gestión de pedidos, control de inventario, productos top, productos poco rentables, punto de pedido, devoluciones |
| Tesorería y finanzas | Conciliación bancaria, cash flow, fondo de reserva, financiación, planificación fiscal, análisis de rentabilidad |
| Reporting e informes | Dashboard, informe mensual, comparativa de periodos, alertas automáticas, KPIs de ventas, asesor externo |

---

### Sección 3 — Análisis Excel
- Subida con drag & drop o selector de archivos
- Formatos soportados: `.xlsx`, `.xls`, `.csv`
- Chips de tipo de datos para etiquetar cada archivo: Pedidos / Gastos / Ventas / General
- Preview de tabla con las primeras filas de cada hoja
- Tabs para navegar entre hojas del mismo archivo
- Análisis IA con hasta 60 filas de muestra por hoja
- El diagnóstico incluye sección específica de **reducción de gastos** con pasos concretos

---

### Sección 4 — Historial
- Lista de todos los análisis realizados (cuestionario + Excel) con fecha y puntuación
- Vista detallada de cualquier análisis anterior
- Comparativa entre dos análisis: qué ha mejorado, qué ha empeorado
- Evolución temporal de la puntuación de salud financiera

---

### Sección 5 — Calculadoras financieras
Tres pestañas:

**Punto de equilibrio**
Calcula cuánto hay que vender para cubrir todos los costes. Inputs: costes fijos, precio de venta unitario, coste variable unitario.

**Margen bruto / neto**
Calcula margen bruto y neto a partir de ingresos, coste de ventas y gastos operativos.

**ROI de inversiones**
Calcula el retorno sobre inversión. Inputs: inversión inicial, beneficio obtenido, periodo de tiempo.

---

### Sección 6 — Informes
El usuario elige el formato antes de exportar:
- **PDF** — con logo, gráficos, resumen ejecutivo estilo consultoría, tabla de recomendaciones
- **Excel** — datos estructurados, diagnóstico, KPIs y plan de acción en hojas separadas
- Ambos formatos disponibles simultáneamente, el usuario elige el que prefiera

---

### Sección 7 — Configuración
- **Tema** — toggle Oscuro / Claro
- **Idioma** — Español / English (selector)
- **Perfil de empresa** — nombre, sector, tamaño (para personalizar los análisis de la IA)
- **Sesión** — ver dispositivo activo, cerrar sesión

---

## 10. Diagnóstico IA — formato de informe estilo consultoría

Cuando se completa el cuestionario o se sube un Excel, la IA genera un informe completo con:

### Componentes visuales
- **Radar chart** por área (Ingresos, Gastos, Stock, Tesorería, Reporting) — muestra el nivel de gestión en cada dimensión
- **Tarjetas visuales** con puntuación numérica y semáforo (rojo / amarillo / verde) por área
- **Barras de progreso** por categoría dentro de cada área

### Secciones del informe de texto
1. **Estado general** — párrafo ejecutivo de 2-3 frases
2. **Puntos fuertes** — qué está haciendo bien el negocio
3. **Áreas críticas** — las 3-5 carencias más importantes con explicación del impacto y acciones concretas
4. **Reducción de gastos** *(sección nueva y diferenciadora)* — análisis específico de dónde y cómo recortar costes sin dañar el negocio
5. **Plan de acción — próximos 30 días** — 3 acciones prioritarias e inmediatas
6. **Automatizaciones recomendadas** — qué procesos se podrían automatizar para ahorrar tiempo y reducir errores

---

## 11. Idiomas

- **Español** (idioma principal)
- **English** (disponible desde el inicio)
- Selector en la sección de Configuración
- Todos los textos de la interfaz, mensajes de error, emails automáticos y contenido de la IA se adaptan al idioma seleccionado

---

## 12. Próximos apartados por definir

- [x] Landing page pública — estructura, copy y diseño ✓
- [x] Flujo de onboarding del usuario tras el primer login ✓
- [x] Política de renovación de licencias y gestión de impagos ✓
- [x] Estrategia de soporte al cliente — Tawk.to (chat en vivo) ✓
- [x] Métricas de negocio a monitorizar (activaciones, ingresos, estado licencias) ✓
- [x] Hoja de reparto de beneficios entre los 3 socios — ver documento aparte `nokfi_reparto_beneficios.md` ✓
- [x] Configuración del VPS (PM2, resurrect — dominio, SSL y Nginx pendientes)
- [~] Crypto como método de pago (RETIRADO — Fase 3, Stripe-only)

---

## 13. Landing page pública — Nokfi

### Nombre y marca
**Nokfi** — corto, memorable, funciona en español e inglés, fácil de pronunciar en ambos idiomas.
- Subtítulo ES: *"Tu negocio, bajo control."*
- Subtítulo EN: *"Your business, under control."*
- Dominio objetivo: `nokfi.app` o `getnokfi.com`

### Idiomas
Bilingüe ES / EN desde el lanzamiento. Selector de idioma visible en el navbar. La elección se guarda en localStorage del visitante.

### Modelo de precio en landing
Suscripción mensual de 3 tiers (mini 5 € / pro 20 € / max 50 €). Sin permanencia:
se puede cancelar a fin de periodo. Tres tarjetas de plan con sus cuotas de IA y el
badge "14 días gratis" en mini. Los precios se obtienen dinámicamente vía
`GET /api/payments/plans` — **nunca hardcodearlos** en la landing ni en el frontend
(anti-drift: la web y Stripe deben cobrar lo mismo). El badge de trial depende del
campo `trial` del catálogo (hoy solo mini), no de un `id` hardcoded.

### Soporte / chat
Widget de **Tawk.to** (gratuito) flotante en esquina inferior derecha, activo en toda la página.

### Captura de emails
No. Directo al pago sin fricción extra. Sin formularios de newsletter ni listas de espera.

### Social proof
Ninguno en el lanzamiento. La sección de testimonios se añade cuando haya clientes reales con métricas verificables (horas ahorradas, errores eliminados).

---

### Estructura de secciones — orden y contenido

**1. Navbar**
- Logo Nokfi a la izquierda
- Navegación central: Funciones · Cómo funciona · Precio · FAQ
- Derecha: selector ES/EN + toggle oscuro/claro + botón "Empezar ahora" destacado
- Se queda fija al hacer scroll con fondo semitransparente

**2. Hero**
- Titular directo al dolor: *"¿Sabes realmente a dónde va el dinero de tu negocio?"*
- Subtítulo explicativo en 2 líneas: qué hace Nokfi y para quién
- Botón CTA principal: "Empezar ahora"
- Texto secundario bajo el botón: "Prueba gratis 14 días · Sin permanencia · Cancela cuando quieras"
- Visual a la derecha: mock o screenshot del dashboard
- Sin testimonios, sin logos de clientes, sin distracciones

**3. Problema**
- 3 tarjetas con los dolores reales del target:
  - Horas perdidas clasificando gastos en Excel
  - No saber qué cortar cuando los números no cuadran
  - Informes financieros que nunca están listos cuando los necesitas
- Tono directo, sin tecnicismos, sin jerga corporativa

**4. Solución / Funciones**
- 6 bloques con icono + título + descripción corta (2 líneas máximo):
  1. Cuestionario de diagnóstico financiero
  2. Análisis de Excel con IA
  3. Informe estilo consultoría con recomendaciones concretas
  4. Calculadoras financieras (punto de equilibrio, margen, ROI)
  5. Historial y comparativa de análisis
  6. Exportación en PDF y Excel

**5. Cómo funciona**
- 3 pasos numerados, muy visual y limpio:
  1. **Suscríbete** — eliges plan (mini/pro/max), pagas con Stripe. El mini lleva 14 días de prueba gratis
  2. **Activa tu clave** — introduce tu email y clave en la app, queda vinculada a tu dispositivo
  3. **Analiza tu negocio** — sube tus datos o responde el cuestionario, la IA hace el resto
- Mensaje de cierre: "Sin instalaciones. Sin cuotas. Sin complicaciones."

**6. Precio**
- Tres tarjetas (mini / pro / max) con los precios y cuotas del catálogo `/plans`
- Badge superior en mini: "14 días gratis"
- Cada tarjeta: precio grande, lista de todo lo incluido con checkmarks, botón "Suscribirme"
- Texto de confianza bajo: "Pago seguro con Stripe · Sin permanencia · Cancela en tu cuenta"

**7. FAQ**
- Acordeón expandible con 7 preguntas:
  1. ¿Funciona para cualquier tipo de negocio?
  2. ¿Es seguro subir mis datos financieros?
  3. ¿Necesito instalar algo?
  4. ¿Qué pasa si cambio de ordenador?
  5. ¿Qué incluye exactamente el acceso?
  6. ¿Hay soporte si tengo problemas?
  7. ¿Puedo usarlo en móvil?

**8. CTA final**
- Sección corta de cierre con titular de remate
- Botón de compra repetido
- Fondo con acento de color (verde esmeralda en modo oscuro, azul marino en modo claro) para destacar visualmente del resto de la página

**9. Footer**
- Logo Nokfi
- Links legales: Política de privacidad · Términos y condiciones · RGPD
- Email de contacto
- Selector de idioma ES/EN
- Sin redes sociales por ahora

---

### Tema visual

**Modo oscuro (por defecto)**
- Fondo: `#0F0F0F`
- Acento principal: `#10B981` (verde esmeralda)
- Texto: `#F5F5F5`

**Modo claro**
- Fondo: `#FFFFFF`
- Acento principal: `#1E3A5F` (azul marino)
- Texto: `#111111`

El toggle oscuro/claro está en el navbar. La preferencia se guarda en localStorage del visitante.

### Tipografía
`Inter` para toda la landing. Limpio, profesional, alta legibilidad en pantalla en ambos temas.

### Tono del copy
- Directo, sin tecnicismos ni jerga corporativa
- Habla de "tu negocio", no de "soluciones empresariales"
- Orientado al ahorro de tiempo y dinero concretos
- Evitar palabras como: innovador, disruptivo, revolucionario, ecosistema, sinergia
- Target: autónomos, freelancers, CEOs de pymes, profesionales liberales (abogados, fisioterapeutas, diseñadores, consultores)

---

## 14. Flujo de onboarding — primer login

### Principio de diseño
El usuario llega al dashboard de inmediato, sin fricción. No hay wizard obligatorio ni pantallas intermedias. El onboarding se integra dentro del propio dashboard de forma no intrusiva: una card de bienvenida + modal de configuración inicial + estado vacío orientativo en cada sección.

---

### Paso 1 — Modal de configuración inicial (aparece automáticamente solo la primera vez)

Nada más hacer login por primera vez, aparece un modal centrado sobre el dashboard. Es el único momento en que se solicitan datos antes de poder usar la app. Tiene 4 campos obligatorios y un botón para completar:

| Campo | Tipo | Ejemplos / opciones |
|-------|------|---------------------|
| Nombre de la empresa | Texto libre | "Taller García", "Clínica Ruiz"... |
| Sector | Desplegable | Comercio · Hostelería · Salud · Legal · Construcción · Tecnología · Consultoría · Diseño · Educación · Otro |
| Tamaño | Selector de opciones | Solo (autónomo) · 2–5 personas · 6–20 personas · +20 personas |
| Principales gastos del negocio | Multi-selección | Alquiler · Personal · Proveedores · Marketing · Suministros · Tecnología · Transporte · Otro |

- El modal **no se puede cerrar sin rellenar** los 4 campos — son necesarios para que la IA personalice los análisis
- Botón de acción: "Empezar a usar Nokfi"
- Estos datos se guardan en el perfil del usuario y son editables en cualquier momento desde Configuración

---

### Paso 2 — Home con card de bienvenida

Tras cerrar el modal, el usuario aterriza en el Home. En la parte superior aparece una **card de bienvenida** que ocupa el ancho completo y desaparece para siempre en cuanto el usuario la cierra manualmente o completa su primer análisis:

**Contenido de la card:**
- Saludo personalizado: *"Bienvenido a Nokfi, [Nombre empresa]"*
- Mensaje corto: *"Tu panel está listo. Empieza cuando quieras — no hay un orden obligatorio."*
- 2 accesos rápidos en botones dentro de la propia card:
  - "Hacer el diagnóstico" → lleva al Cuestionario
  - "Subir mis datos" → lleva al Análisis Excel
- Botón de cierre (X) en la esquina — si la cierra sin hacer nada, no vuelve a aparecer

---

### Paso 3 — Estados vacíos orientativos por sección

Las primeras veces que el usuario entra a cada sección del menú lateral y aún no tiene datos, en lugar de mostrar una pantalla en blanco aparece un **estado vacío** con instrucción clara y un CTA:

| Sección | Mensaje de estado vacío | CTA |
|---------|------------------------|-----|
| Home | *(card de bienvenida activa)* | Ver arriba |
| Cuestionario | "Aún no has hecho tu primer diagnóstico. Tarda menos de 5 minutos." | "Empezar diagnóstico" |
| Análisis Excel | "Sube tu primer archivo para que la IA analice tus datos reales." | "Subir archivo" |
| Historial | "Aquí aparecerán todos tus análisis anteriores una vez que hagas el primero." | "Ir al cuestionario" |
| Calculadoras | *(siempre disponibles, no tienen estado vacío)* | — |
| Informes | "Genera tu primer análisis para poder exportar un informe." | "Ir al cuestionario" |

---

### Comportamiento técnico del onboarding

- El modal de configuración inicial se activa comprobando un flag `onboarding_completed` en el perfil del usuario almacenado en el servidor
- Una vez guardados los datos del modal, el flag se marca como `true` y el modal nunca vuelve a aparecer
- La card de bienvenida se controla con un flag `welcome_card_dismissed` guardado también en servidor (no en localStorage, para que funcione aunque el usuario cambie de navegador)
- Los estados vacíos se renderizan condicionalmente comprobando si el usuario tiene análisis previos en base de datos

---

### Lo que NO hace el onboarding de Nokfi

- No hay tour con tooltips superpuestos — interrumpen y la gente los cierra sin leer
- No hay vídeo de bienvenida — añade fricción y alarga el tiempo hasta el primer valor
- No hay email de "primeros pasos" post-registro — ya recibió el email de la clave, no queremos saturar
- No hay checklist gamificada de "completa tu perfil" — innecesaria para un tool B2B de este tipo

---

## 15. Política de licencias y gestión de incidencias de pago

### Modelo de licencia (suscripción mensual)
**Suscripción mensual** (mini 5 € / pro 20 € / max 50 €). El acceso se mantiene
mientras la suscripción de Stripe esté activa y se cobre correctamente cada mes. La
gestión de la suscripción (cancelar a fin de periodo, mejorar de plan, actualizar
tarjeta) queda en manos del **Stripe Customer Portal**, al que el usuario accede desde
Configuración — Nokfi no implementa cancelaciones custom.

El anti-sharing no se basa en fijar un dispositivo, sino en la **cuota diaria de IA por
licencia** (mini 10 / pro 50 / max 130 análisis/día): una clave compartida se agota
entre todos los usuarios que la estén usando ese día.

---

### Escenario 1 — Chargeback (reclamación del pago al banco)

**Qué es:** el usuario contacta con su banco y reclama la devolución del cargo alegando que no autorizó el pago o que el producto no fue entregado.

**Comportamiento del sistema:**
- Stripe notifica al servidor vía webhook (`charge.dispute.created`) al abrirse la disputa
- El servidor revoca la licencia **automáticamente** al recibir el webhook: `status='revoked'`
- Se cierran todas las sesiones activas de esa licencia (`deleteSessionsForLicense`)
- Se registra el evento en el `audit_log` con todos los detalles (fecha, IP, motivo)
- Se envía un email automático al email vinculado a la licencia informando de la revocación y el motivo

**Por qué automático y sin periodo de gracia:** el chargeback implica que el pago ha sido revertido, por lo que el acceso al software ya no está respaldado por ningún pago válido. La revocación inmediata es la única respuesta técnicamente coherente.

**Resolución:** si el usuario considera que fue un error, puede contactar con soporte. Si retira la disputa y el pago se confirma de nuevo, la licencia se reactiva manualmente desde el panel admin.

---

### Escenario 2 — Olvido de contraseña (reseteo por email)

**Qué es:** el usuario pierde u olvida su contraseña. Como el login es email + clave + contraseña, sin la contraseña no puede entrar. Ya **no existe** el reseteo de "device fingerprint": cambiar de ordenador ahora solo significa iniciar sesión normal desde el nuevo dispositivo — no hay nada que resetear.

**Comportamiento del sistema:**
- El usuario solicita el reseteo desde la pantalla de login (`POST /api/auth/request-password-reset` con `{ email, license_key }`)
- Si la licencia existe y no ha agotado su reseteo anual, el servidor genera un `reset_token` de 30 minutos y lo envía por email. La respuesta es **siempre** genérica (anti-enumeración: 200 exista o no la licencia), salvo `429 reset_limit_reached` si ya usó su reseteo anual
- El usuario confirma desde el enlace del email (`POST /api/auth/confirm-password-reset` con `{ token, new_password, device_name? }`): setea la nueva contraseña y **crea sesión inmediata** — no hace falta login adicional
- El reseteo por email **no** revoca sesiones previas (el usuario puede tener otra pestaña abierta legítimamente)

**Reseteo forzado por admin:** `POST /api/admin/licenses/:id/reset-password` limpia contraseña + sesiones, sin el límite anual, para los casos gestionados por soporte o por seguridad.

---

### Escenario 3 — Política de reembolsos (suscripción)

**Trial del plan mini:** los 14 días de prueba gratis con tarjeta permiten cancelar antes
del cobro sin coste — no hay nada que reembolsar en ese periodo.

**Reembolsos tras cobro (mensualidades y planes pro/max sin trial):** política a definir
por el negocio. Cualquier devolución se tramita desde el **dashboard de Stripe** (no
desde el backend), y los eventos de reembolso / chargeback sincronizan el estado de la
licencia automáticamente vía webhook (`charge.dispute.created`).

> Esta decisión concreta (reembolso sí / no / prorrata) debe fijarse en los T&C antes del
> lanzamiento. La base legal para "sin reembolso" amparable es la excepción de contenido
> digital de la directiva europea (artículo 103.a) del RDL 1/2007). Es una decisión
> legal/comercial, no de código.

---

### Escenario 4 — Licencia revocada por abuso o fraude

Si desde el panel admin se detecta uso fraudulento (cuota diaria agotada sistemáticamente por múltiples IPs, intentos de bypass documentados, uso comercial no autorizado):
- Revocación manual desde el panel admin (`PUT` a `status='revoked'`)
- Se limpian sesiones y se envía el email de revocación automáticamente
- El evento queda en `audit_log`
- Cancelar la suscripción de Stripe desde el dashboard para que no se siga cobrando

---

### Resumen de estados posibles de una licencia

| Estado | Descripción | Acceso a la app |
|--------|-------------|-----------------|
| `active` | Suscripción activa (en trial si `trial_ends_at` no es nulo) | Completo |
| `suspended` | Cobro fallido tras reintentos o suspensión manual del admin | Bloqueado con mensaje |
| `revoked` | Revocada por chargeback o abuso | Bloqueado con mensaje |
| `expired` | Suscripción cancelada definitivamente (`subscription.deleted`) | Bloqueado con mensaje |

> `trialing` no es un `status` aparte: una licencia en trial sigue siendo `status='active'`
> con `trial_ends_at` futuro. La distinción se hace por campos, no por `status`. Es el caso
> que el filtro de MRR excluye de los ingresos (sección 16).

---

### Implementación técnica

> Implementación real en `routes/webhooks.js`, `routes/auth.js`, `routes/admin.js` y `db/database.js`. El webhook de Stripe verifica la firma HMAC-SHA256 y rechaza replays (timestamps fuera de ±5 min). Eventos gestionados:

- `checkout.session.completed` → crea la licencia (`status='active'`, `billing_model='subscription'`, guarda `stripe_customer_id`/`stripe_subscription_id`, `trial_ends_at` si aplica)
- `invoice.paid` → renovación o primer cobro real; limpia `trial_ends_at` **solo si `invoice.amount_paid > 0`** (el invoice de 0 € al aperturar el trial no debe apagar el banner de "14 días")
- `customer.subscription.updated` → cambio de plan / cancelación programada (`cancel_at_period_end`) / transición `trialing→active` (limpia `trial_ends_at`)
- `customer.subscription.deleted` → `status='expired'`, sesiones cerradas
- `invoice.payment_failed` → cobro fallido tras reintentos → `status='suspended'`
- `charge.dispute.created` → chargeback → revocación vía `handleChargebackByPaymentRef` (`status='revoked'` + `deleteSessionsForLicense` + email)

- El reseteo de contraseña por email usa **dos** endpoints:
  - `POST /api/auth/request-password-reset` — `{ email, license_key }`, verifica el límite anual, genera `reset_token` de 30 min, envío por email. Respuesta genérica anti-enumeración
  - `POST /api/auth/confirm-password-reset` — `{ token, new_password, device_name? }`, consume el token (un solo uso), setea la contraseña y crea sesión inmediata
- El panel admin fuerza reseteo sin límite vía `POST /api/admin/licenses/:id/reset-password` (limpia pass + sesiones)
- Todos los eventos quedan en `audit_log` con timestamp, IP y motivo

---

## 16. Métricas de negocio — panel de monitorización

### Dónde se ven
Panel dedicado dentro del **admin interno**, accesible solo con `ADMIN_SECRET`. No hay reportes automáticos por email — toda la información se consulta en tiempo real desde el panel cuando el equipo lo necesite.

La landing tendrá **Plausible Analytics** (privado, sin cookies, compatible con RGPD) para métricas de tráfico web. Las métricas de negocio viven exclusivamente en el panel admin del servidor.

---

### Métricas prioritarias — visibles nada más entrar al panel

**Bloque 1 — Activaciones**
- Activaciones hoy / esta semana / este mes
- Gráfico de línea: activaciones diarias en los últimos 30 días
- Gráfico de barras: activaciones por semana en los últimos 3 meses

**Bloque 2 — Ingresos**
- Ingresos totales acumulados (desde el lanzamiento)
- Ingresos este mes
- Ingresos esta semana
- Ingreso medio por suscripción activa (MRR / suscripciones activas)
- Gráfico de línea: ingresos diarios en los últimos 30 días

**Bloque 3 — Estado de licencias**
- Total licencias emitidas
- Licencias activas (número + % sobre el total)
- Licencias revocadas (número + % — incluye chargebacks y abusos)
- Licencias suspendidas (número + %)
- Tasa de revocación = revocadas / total emitidas × 100

---

### Métricas secundarias — visibles en secciones del panel

**Seguridad y uso**
- Intentos de login fallidos por día (últimos 7 días)
- Chargebacks recibidos (total histórico + últimos 30 días)
- Reseteos de contraseña solicitados (total + últimos 30 días)
- Sesiones activas en este momento
- IPs con más intentos fallidos (top 5) — para detectar ataques

**Retención y actividad**
- Usuarios que han hecho al menos 1 análisis (cuestionario o Excel)
- Usuarios que llevan más de 30 días sin hacer login (licencias inactivas)
- Análisis realizados en total (cuestionario + Excel separados)
- Exportaciones generadas (PDF vs Excel)

---

### Diseño del panel de métricas

- Tarjetas de KPI en la parte superior con número grande + comparativa respecto al período anterior (flecha arriba/abajo + porcentaje de cambio)
- Gráficos usando la misma librería que el frontend de la app (Recharts)
- Selector de período: últimos 7 días / 30 días / 90 días / desde el inicio
- Tabla de últimas activaciones con columnas: fecha, email (parcialmente enmascarado), plan, IP, estado
- Tabla de últimos eventos de auditoría (chargebacks, revocaciones, reseteos)
- Todo en tiempo real — los datos se leen directamente de SQLite al cargar la página, sin caché

---

### Implementación técnica

- Endpoint real implementado: `GET /api/admin/stats?period=30` — devuelve los agregados en un solo objeto JSON: `licenses`, `activations`, `revenue`, `daily_series`, `recent_events` **y un bloque `billing`** (Fase 3)
- Las agregaciones se hacen con queries SQLite directas (COUNT, SUM, GROUP BY fecha) — eficientes para los volúmenes esperados
- **Bloque `billing` (Fase 3):** `subscription` (nº de suscripciones activas), `legacy` (creadas por admin, sin Stripe), `trialing` (activas en trial de 14 días), `paying_subscribers` (suscripción activa y **no** en trial) y `mrr_eur` (ingresos recurrentes mensuales estimados)
- **Discriminador de MRR:** `billing_model='subscription' AND status='active' AND trial_ends_at IS NULL`. Las licencias en trial (`trialing`) **no** suman al MRR — todavía no se les ha cobrado; el primer `invoice.paid` real las saca del trial y pasan a sumar. Las `legacy` del admin no son recurrentes y no suman al MRR
- Los ingresos reales provienen de `licenses.amount_eur` (importe exacto de cada webhook de Stripe; renovaciones y prorratas incluidas), no de un precio hardcoded — ya no existe `LICENSE_PRICE_EUR` (era del modelo lifetime, hoy los precios viven en `PLAN_PRICE_*_EUR` solo para fijar lo que cobra Stripe)

---

## 17. Configuración del VPS

### Elección del sistema operativo
**Ubuntu 24.04 LTS** (10 Gbps si está disponible sin coste extra, si no 1 Gbps es más que suficiente para el volumen esperado).

**Por qué Ubuntu 24.04 y no las alternativas:**
- LTS (Long Term Support) — soporte oficial hasta 2029, no hay que migrar el sistema en mitad del negocio
- Mejor compatibilidad y documentación con Node.js, Nginx, PM2 y Certbot que CentOS Stream o FreeBSD
- CentOS Stream no es recomendable para producción seria — es la rama de pruebas de Red Hat, con menor estabilidad que una LTS de Ubuntu/Debian
- FreeBSD es excelente para otros casos de uso pero tiene mucha menos documentación para este stack concreto y complica la vida a un equipo que no tiene experiencia previa con él
- Debian 12 sería la alternativa más cercana, pero Ubuntu LTS tiene el ecosistema de paquetes y guías ligeramente más amplio para Node.js

---

### Dominio — qué hacer primero

Antes de tocar el VPS, hay que comprar el dominio. Recomendación: `nokfi.app` o `getnokfi.com` en **Namecheap**, **Cloudflare Registrar** (precio de coste, sin margen) o **OVH**. Una vez comprado:

1. Apuntar los DNS del dominio al **Cloudflare** (gratis) para tener proxy, protección DDoS básica y SSL gestionado de forma más sencilla
2. Crear 2 registros tipo A apuntando a la IP del VPS:
   - `nokfi.app` → landing pública
   - `app.nokfi.app` → web app protegida (subdominio)
3. Opcional pero recomendado: `admin.nokfi.app` → panel de administración interno, con acceso restringido por IP además del `ADMIN_SECRET`

---

### Estructura de despliegue en el VPS (estado real)

```
/home/deploy/
├── nokfi-fase3/                  ← clone de git, HEAD == origin/main
│   ├── backend/                  ← código del servidor (Node.js + Express)
│   │   ├── server.js
│   │   ├── .env                  ← el ÚNICO .env; permisos 600; nunca en git
│   │   ├── db/
│   │   │   └── nokfi.db          ← base de datos SQLite
│   │   └── node_modules/
│   ├── frontend/                 ← (en el repo; AÚN NO se sirve en el VPS)
│   └── *.md                      ← docs en la raíz del repo
└── (no hay /var/www/ — el backend se sirve vía PM2 en :3001, proxy Nginx pendiente)
```

> El backend no está bajo `/var/www/`, sino en `/home/deploy/nokfi-fase3/backend`
> y se ejecuta con **PM2** (`pm2 start server.js --name nokfi-backend`, fork mode,
> cwd = el dir del backend — crítico porque `DB_PATH=./db/nokfi.db` y `dotenv.config()`
> son relativos al cwd). No existe un duplicado `/home/deploy/.env` (se borró para
> evitar drift). El frontend y la landing aún no se sirven desde el VPS — falta
> desplegar Nginx (SSL + cabeceras de seguridad).

---

### Pasos de instalación (orden recomendado)

**1. Acceso inicial y hardening básico**
```bash
# Conectar por SSH como root la primera vez
ssh root@IP_DEL_VPS

# Crear usuario no-root con permisos sudo
adduser deploy
usermod -aG sudo deploy

# Configurar firewall básico
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Deshabilitar login root por SSH (solo usuario deploy)
# Editar /etc/ssh/sshd_config → PermitRootLogin no
systemctl restart sshd
```

**2. Instalar Node.js (LTS)**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # verificar versión 22.x
```

**3. Instalar PM2 (gestor de procesos)**
```bash
sudo npm install -g pm2
pm2 startup    # configura arranque automático al reiniciar el VPS
```

**4. Instalar Nginx (proxy reverso)**
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

**5. Instalar Certbot (SSL gratuito de Let's Encrypt)**
```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

### Configuración de Nginx — proxy reverso

Nginx recibe todo el tráfico en los puertos 80/443 y redirige cada subdominio a su destino correspondiente:

> **⚠️ Auditoría de seguridad:** la configuración original no incluía cabeceras
> de seguridad HTTP para el frontend estático. Helmet (en el backend) solo
> protege las respuestas de la API — los archivos que sirve Nginx directamente
> para `app.nokfi.app` no llevaban ninguna cabecera propia. Esto dejaba la
> app expuesta a **clickjacking** (se podía embeber en un `<iframe>` de un
> sitio malicioso) porque la directiva `frame-ancestors` de la CSP **no
> funciona en absoluto** puesta como `<meta>` tag en el HTML — los navegadores
> la ignoran ahí, solo es efectiva como cabecera HTTP real. Se añaden abajo
> las cabeceras que cierran ese hueco.

> **Plantilla PENDIENTE — no desplegada todavía.** Nginx aún no está en el VPS; el
> backend hoy se sirve solo en `localhost:3001` (sin proxy ni SSL). Cuando el equipo
> compre el dominio y despliegue Nginx, los builds estáticos de `landing/` y
> `frontend/` se colocarán en `/var/www/` y esta config los servirá + proxyará `/api/`.

```nginx
# /etc/nginx/sites-available/nokfi

# Landing pública — archivos estáticos
server {
    listen 80;
    server_name nokfi.app www.nokfi.app;
    root /var/www/landing;   # build estático de la landing (cuando exista)
    index index.html;

    # Cabeceras de seguridad — ver nota de auditoría arriba
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Web app — proxy al frontend servido + backend API
server {
    listen 80;
    server_name app.nokfi.app;

    # Cabeceras de seguridad para el frontend estático (ver nota de auditoría arriba).
    # frame-ancestors 'none' es la protección REAL contra clickjacking — la que
    # va en el <meta> de index.html es solo defensa complementaria, no suficiente.
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.nokfi.app https://generativelanguage.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;

    location / {
        root /var/www/app;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activar la configuración y obtener certificados SSL:
```bash
sudo ln -s /etc/nginx/sites-available/nokfi /etc/nginx/sites-enabled/
sudo nginx -t                              # verificar sintaxis
sudo systemctl reload nginx
sudo certbot --nginx -d nokfi.app -d www.nokfi.app -d app.nokfi.app
```

Certbot configura HTTPS automáticamente y renueva los certificados cada 90 días sin intervención manual. Una vez activo el certificado, Certbot añade además la redirección automática HTTP→HTTPS, que junto al HSTS ya configurado en Helmet (backend) y en las cabeceras de arriba (frontend), fuerza tráfico cifrado en todo el sistema.

---


### Arrancar el backend con PM2

```bash
cd /home/deploy/nokfi-fase3/backend
npm install --production
pm2 start server.js --name nokfi-backend
pm2 save                    # persiste el proceso en ~/.pm2/dump.pm2 (lleva el cwd)
pm2 logs nokfi-backend      # ver logs en tiempo real
```

**Resurrect tras reinicio del VPS:** systemd `pm2-deploy.service` (enabled) ejecuta
`pm2 resurrect` en el boot → lee el dump → reinicia `nokfi-backend` desde el cwd
guardado (`nokfi-fase3/backend`). Verificado que el dump apunta a la ruta actual.

**Comandos útiles de PM2:**
- `pm2 restart nokfi-backend --update-env` — reiniciar y recargar el `.env` (tras cambiar precios/claves)
- `pm2 status` — ver si el proceso está corriendo
- `pm2 logs nokfi-backend --lines 100` — ver últimas 100 líneas de logs
- `pm2 monit` — monitor de CPU/memoria en tiempo real

---

### Seguridad adicional del VPS

- **Fail2ban** instalado para bloquear IPs con intentos de fuerza bruta por SSH
- **Backups automáticos** de la base de datos SQLite con un cron diario que copia `nokfi.db` a almacenamiento externo
- El archivo `.env` con las claves API nunca se sube a git — se genera/edita directamente en el servidor (no hay `/home/deploy/.env` maestro; copiar del `.env` del backend vivo si se redepliega en un dir nuevo)
- Permisos del `.env` restringidos: `chmod 600 .env` para que solo el usuario `deploy` pueda leerlo

```bash
# Cron diario de backup (ejemplo, a las 3 AM)
0 3 * * * cp /home/deploy/nokfi-fase3/backend/db/nokfi.db /var/backups/nokfi_$(date +\%Y\%m\%d).db
```

---

### Checklist de despliegue inicial

- [ ] Comprar dominio y apuntar DNS a Cloudflare
- [ ] Crear VPS con Ubuntu 24.04 LTS
- [ ] Hardening inicial: usuario no-root, firewall, SSH sin root
- [ ] Instalar Node.js 22 LTS, PM2, Nginx, Certbot
- [ ] Subir código de backend al VPS (y, cuando exista, frontend + landing)
- [ ] Configurar `.env` del backend con todas las claves (ADMIN_SECRET ≥32 chars, Gemini, Stripe, SendGrid/Resend, `PLAN_PRICE_*_EUR`)
- [ ] Configurar Nginx con los subdominios (`nokfi.app`, `app.nokfi.app`) + cabeceras de seguridad + SSL con Certbot
- [ ] Arrancar backend con PM2 y verificar `pm2 status`; `pm2 save` + systemd `pm2-deploy.service` para survive-reboot
- [ ] Pegar claves reales de Stripe + verificar API version ≥ `2024-04-10` en el dashboard (sin esto, `create-checkout` responde `stripe_not_configured`)
- [ ] Configurar Fail2ban
- [ ] Configurar cron de backups diarios de la base de datos
- [ ] Probar el flujo completo de principio a fin en producción antes de anunciar el lanzamiento

---

## 18. Crypto como método de pago — RETIRADO

Coinbase Commerce estaba previsto como fase 2 para aceptar pagos en BTC/ETH/USDC,
pero **se retiró** al pasar el proyecto a **Stripe-only** (Fase 3, suscripción mensual).
El código del webhook y el endpoint de checkout se eliminaron; las variables
`COINBASE_COMMERCE_*` ya no existen en `.env.example`. Si en el futuro el proyecto
quisiera aceptar crypto, sería más sencillo hacerlo a través del propio **Stripe
Crypto Payout** (Stripe ya acepta USDC vía su producto de payouts para negocios en
EE. UU., y está expandiéndolo — sin el sobrecoste fiscal de mantener Coinbase aparte).

---

## 19. Frontend — Estructura y diseño

### Stack técnico
- **React + Vite** — framework principal
- **Tailwind CSS** — estilos
- **PWA** — instalable desde el navegador sin App Store
- **Recharts** — gráficas interactivas
- **SheetJS (xlsx)** — importación y exportación de Excel
- **pdfjs-dist** — extracción de texto de PDFs en el cliente
- **jsPDF** — generación de PDFs de exportación
- **i18next** — internacionalización ES/EN

---

### Rutas de la aplicación

```
/login                          → activación + login
/reveal                         → revelación de clave tras checkout (desde Stripe)
/reset-password                 → confirmación reseteo de contraseña (desde email)
/pricing                        → página de selección de plan (precompra)

/app/home                       → dashboard principal
/app/cuestionario               → diagnóstico por preguntas
/app/excel                      → hub de análisis Excel (índice de subapartados)
  /app/excel/excel-stock-almacen
  /app/excel/excel-salida-ventas
  /app/excel/excel-salida-servicios
  /app/excel/excel-entrada-productos
  /app/excel/excel-caja
  /app/excel/excel-total
/app/historial                  → análisis anteriores y comparativas
/app/calculadoras               → calculadoras financieras (3 pestañas)
/app/informes                   → exportación PDF/Excel
/app/configuracion              → tema, idioma, perfil, suscripción, sesión
```

---

### Capa de comunicación con el backend — middleware/api.js

Módulo central que gestiona TODAS las llamadas al servidor. Ningún componente llama al backend directamente. Este módulo maneja automáticamente:
- Token de sesión en cada petición (`Authorization: Bearer`)
- Errores `401/403` → limpia sesión y redirige al login
- Error `ai_quota_exceeded` → mensaje claro "inténtalo más tarde"
- Error `ai_quota_exceeded` (503) → mensaje claro "inténtalo más tarde" (cuota de Gemini agotada a nivel proyecto)
- Error `license_daily_limit_reached` (429) → "mejora tu plan o inténtalo mañana" (cuota diaria por licencia agotada)
- Error `internal_error` → mensaje genérico de fallback

> Ya no existe `device_mismatch` — ese error era del viejo modelo de fingerprint, eliminado.

---

### Pantalla de login — flujos según respuesta del backend

| Respuesta backend | Acción del frontend |
|---|---|
| `201 success` (activate) | Primera activación completada → onboarding |
| `200 success` (login) | Login correcto → dashboard |
| `409 not_activated` | Redirigir al flujo de activación (la licencia no tiene contraseña todavía) |
| `401 invalid_credentials` | "Datos incorrectos" — mensaje genérico (NO revela si existe la cuenta) |
| `403 license_inactive` | Pantalla específica de licencia revocada/suspendida/expired |
| `400 invalid_input` | "Formato de email o clave inválido" |

> Ya **no existe** el caso `device_mismatch` ni `404 not_found` con mensaje — el 401
> ahora devuelve siempre `invalid_credentials` (genérico), sin dar pistas de si la
> licencia existe. El `404 not_found` solo aplica a rutas inexistentes (ej. los viejos
> endpoints de PayPal/Coinbase/Revolut).

---

### Onboarding — primer login

Modal obligatorio antes de entrar al dashboard (no se puede saltar):
- Nombre de la empresa
- Sector (desplegable)
- Tamaño (autónomo / 2-5 / 6-20 / +20)
- Principales gastos del negocio (multi-selección)

Estos datos se guardan en el servidor y personalizan los prompts de Gemini en cada análisis.

---

### Temas visuales

Dos temas globales guardados en el servidor (no en localStorage):
- **Oscuro** — fondo `#0F0F0F` + verde esmeralda `#10B981`
- **Claro** — blanco + azul marino `#1E3A5F`

---

### Idiomas

ES / EN desde el inicio con i18next. Todas las cadenas en un objeto de traducciones central, nunca hardcodeadas en componentes.

---

## 20. Subapartados de /app/excel

### Subapartados definidos

| Ruta | Descripción |
|------|-------------|
| `excel-stock-almacen` | Inventario actual del almacén |
| `excel-salida-ventas` | Parte del almacén destinada a ventas |
| `excel-salida-servicios` | Parte del almacén destinada a servicios |
| `excel-entrada-productos` | Pedidos / entradas de producto |
| `excel-caja` | Dinero en caja y cambio |
| `excel-total` | Profit total descontando impuestos y gastos |

---

### Estructura común de TODOS los subapartados

Cada subapartado tiene exactamente estas 4 zonas en el mismo orden:

**Zona 1 — Importar archivos**
- Drag & drop o selector de archivos
- Formatos: `.xlsx`, `.xls`, `.csv`, `.pdf`
- Límite: 5MB por archivo, máximo 3 archivos simultáneos
- Barra de texto: "Añade contexto para que la IA entienda este archivo..."
- Botón: "Analizar con IA"
- Historial de los últimos 5 archivos subidos en ese subapartado (con fecha, recargables)

**Zona 2 — Indicadores KPI + Gráfica interactiva**
- 3 tarjetas KPI encima de la gráfica: total del período, variación vs archivo anterior (ej. `+12% vs mes anterior`), alerta si algo está fuera de lo normal
- Gráfica interactiva (Recharts) que se actualiza con cada archivo subido
- El tipo de gráfica varía según el subapartado pero la zona es idéntica en todos
- Modo comparación: botón para subir 2 archivos y verlos en paralelo en la misma gráfica

**Zona 3 — Análisis de la IA**
- Respuesta de Gemini con: resumen ejecutivo, hallazgos clave, alertas, recomendaciones específicas del tipo de Excel
- Cada subapartado tiene un prompt base predefinido + el contexto que añadió el usuario
- Texto estructurado con secciones colapsables

**Zona 4 — Exportar resultado**
- El usuario elige: PDF o Excel
- PDF: incluye gráfica + KPIs + análisis completo de la IA
- Excel: datos procesados + recomendaciones en hojas separadas

---

### Tipos de gráfica por subapartado

| Subapartado | Gráfica principal | Qué muestra |
|-------------|-------------------|-------------|
| Stock/almacén | Barras horizontales | Cantidad por producto, mínimos de seguridad |
| Salida ventas | Barras + línea de tendencia | Unidades vendidas por producto/período |
| Salida servicios | Circular + barras | Distribución por tipo de servicio |
| Entrada productos | Barras agrupadas | Pedidos realizados vs recibidos |
| Caja | Línea temporal | Evolución del saldo de caja por día |
| Total (profit) | Barras apiladas | Ingresos vs gastos vs profit neto |

---

### Sistema de gestión de PDFs — 4 capas

**Capa 1 — Conversión automática PDF → datos (cliente)**
Cuando se sube un PDF, `pdfjs-dist` extrae el texto directamente en el navegador del usuario, sin coste de tokens. Lo que se manda a Gemini es texto plano — mismo coste que un Excel.

**Capa 2 — Detección de PDFs escaneados**
Si `pdfjs-dist` extrae menos de 100 caracteres (señal de imagen escaneada), se muestra aviso al usuario con dos opciones:
- "Convertir a Excel" → activa el conversor integrado
- "Continuar igualmente" → el usuario asume el coste extra de tokens

**Capa 3 — Conversor PDF → Excel integrado**
Módulo que estructura el texto extraído en columnas y filas descargables como `.xlsx`. Funciona bien con facturas, albaranes y extractos bancarios con estructura tabular. No funciona con PDFs escaneados.

**Capa 4 — Límites duros**
- Tamaño máximo por archivo: **5MB**
- Máximo **3 archivos simultáneos** por análisis
- Texto extraído truncado a **30.000 caracteres** máximo (protege el límite de 50.000 del backend)
- PDFs escaneados que el usuario insista en mandar: cuentan doble contra el rate limit de Gemini

---

## 21. Identidad visual — Sistema de diseño Nokfi

### Logo
Dos variantes oficiales, sin más versiones:
- **Variante header/dashboard:** texto "nok" en color de texto primario (blanco en oscuro, negro/grafito en claro) + "fi" en azul eléctrico `#3B82F6`. Fondo transparente, se adapta al tema activo.
- **Variante icono/favicon/PWA:** fondo sólido azul `#3B82F6` + texto "nokfi" completo en blanco. Usada para el icono de la PWA, favicon, y splash screen al instalar la app.

No se usan variantes con fondo blanco/negro sólido en el texto, ni colores alternativos del logo.

### Paleta de color

| Color | Hex | Uso |
|-------|-----|-----|
| Azul eléctrico (acento) | `#3B82F6` | Botones primarios, badges activos, links, KPIs destacados, "fi" del logo |
| Negro profundo (fondo oscuro) | `#0F0F0F` | Fondo del tema oscuro |
| Grafito (superficie oscura) | `#141414` | Cards y menú lateral en modo oscuro |
| Blanco (fondo claro) | `#FFFFFF` | Fondo del tema claro |
| Gris muy claro (superficie clara) | `#F8FAFC` | Cards y menú lateral en modo claro |
| Verde (positivo) | `#22C55E` | Variaciones positivas, estado ok, ganancias |
| Rojo (negativo/alerta) | `#EF4444` | Variaciones negativas, alertas, pérdidas, errores |
| Ámbar (advertencia) | `#F59E0B` | Advertencias, datos que requieren atención |

### Tipografía
**Plus Jakarta Sans** en todos los pesos (400 regular, 500 medium, 600 semibold). Elegida sobre Inter por tener más personalidad propia sin sacrificar legibilidad — encaja con el posicionamiento fintech/corporativo del azul eléctrico.

| Uso | Tamaño | Peso |
|-----|--------|------|
| Título principal | 24px | 600 |
| Heading de sección | 18px | 500 |
| Cuerpo de texto | 14px | 400 |
| Caption / texto secundario | 12px | 400 |
| Label / etiqueta | 11px | 500, uppercase, letter-spacing 0.06em |

### Iconografía
**Lucide Icons** — trazos finos y consistentes que complementan el azul eléctrico sin competir visualmente con los datos financieros, que son el verdadero protagonista de la interfaz.

---

### ⚠️ Regla obligatoria de contraste — aplica a TODOS los componentes

**El texto debe invertirse automáticamente según el tema activo. Nunca texto oscuro sobre fondo oscuro, nunca texto claro sobre fondo claro.**

Esto se garantiza estructuralmente usando siempre variables CSS de tema, nunca colores hardcodeados:

```css
/* CORRECTO — se adapta automáticamente */
color: var(--text-primary);
background: var(--surface-1);

/* INCORRECTO — texto negro fijo, ilegible en modo oscuro */
color: #000000;
background: var(--surface-1);
```

**Checklist de verificación para cada componente nuevo que se construya:**
- [ ] ¿El texto usa `var(--text-primary)` / `var(--text-secondary)` / `var(--text-muted)`, nunca un hex fijo?
- [ ] ¿Se ha probado visualmente el componente en AMBOS temas antes de darlo por terminado?
- [ ] ¿Los badges/pills con fondo de color (verde, rojo, ámbar, azul) usan el tono oscuro de esa misma familia de color para el texto, no negro genérico?
- [ ] ¿Los inputs y bordes usan `var(--border)` / `var(--border-strong)`, que también cambian entre temas?

Este checklist se aplica sin excepción a cada pantalla del frontend (login, dashboard, los 6 subapartados de Excel, calculadoras, etc.) antes de considerarla terminada.
