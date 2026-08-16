# Nokfi — Contrato de API (Backend ↔ Frontend)

> Generado a partir del código real del backend. **Esta es la fuente de verdad**
> que se usa para construir el frontend en concordancia exacta. Cualquier cambio
> en las rutas del backend debe reflejarse aquí ANTES de tocar el frontend.
>
> Estado actual: **Fase 3** — modelo de **suscripción mensual** vía **Stripe**,
> **3 Products separados** (Nokfi Mini / Pro / Max) con un Price recurrente
> mensual EUR cada uno (Deuda B). Trial de 14 días en mini. Auth por
> **email + clave + contraseña** (el viejo modelo de device-fingerprint se
> eliminó en `f9385af`; el anti-sharing es la cuota diaria de IA por licencia).
> PayPal / Revolut / Coinbase retirados — **Stripe es la única pasarela**.

---

## Convenciones generales

- Base URL en producción: `https://nokfi.app/api` (Nginx proxyea `/api` → backend
  en `localhost:3001`; frontend y backend mismo origen; Cloudflare en el edge).
- Todas las rutas autenticadas usan `Authorization: Bearer <token>` (sesión de
  usuario) o `Authorization: Bearer <ADMIN_SECRET>` (panel admin).
- Todas las respuestas son JSON.
- Formato de error estándar: `{ "error": "código_snake_case", "message"?: "texto" }`.
  El campo `error` es estable y pensado para lógica del frontend (switch/if). El
  `message`, cuando existe, es texto en español para mostrar al usuario.
- Cualquier ruta puede devolver `500 { error: "internal_error" }` ante una
  excepción — el frontend lo trata como fallback genérico.

---

## 1. Autenticación (`/api/auth`) — email + clave + contraseña

Login de **3 factores**: `email` + `license_key` (`XXXX-XXXX-XXXX-XXXX`, hex,
insensible a mayúsculas) + `password` (scrypt, mínimo 8). **Ya no** se usa
`client_fingerprint` (la cuota diaria de IA hace el anti-sharing). El primer
acceso de una licencia nueva es `/activate` (eliges la contraseña); luego `/login`.
`device_name` (opcional) es solo etiqueta legible en Configuración, no autentica.

### `POST /api/auth/activate`
Primer acceso (licencia sin contraseña todavía).

**Body:** `{ email, license_key, password (8–256), device_name? (máx 120) }`

| Status | Body | Cuándo |
|--------|------|--------|
| 201 | `{ success: true, token, expires_at, license }` | Activación correcta |
| 409 | `{ error: "already_activated" }` | Ya tiene contraseña → `/login` |
| 403 | `{ error: "license_inactive" }` | Suspendida/revocada (mensaje distingue) |
| 404 | `{ error: "not_found" }` | email+clave no coinciden (anti-enumeración) |
| 400 | `{ error: "weak_password" \| "invalid_email" \| "invalid_key_format" }` | Validación |

### `POST /api/auth/login`
**Body:** `{ email, license_key, password }`

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, token, expires_at, license }` | Login correcto |
| 409 | `{ error: "not_activated" }` | No tiene contraseña → flujo `/activate` |
| 401 | `{ error: "invalid_credentials" }` | Credenciales incorrectas (mensaje SIEMPRE genérico) |
| 400 | `{ error: "invalid_input" }` | Formato inválido |

### `POST /api/auth/verify`
Comprobar token al cargar la app. **Headers:** `Authorization: Bearer`.

| Status | Body |
|--------|------|
| 200 | `{ valid: true, license }` |
| 401 | `{ valid: false, error: "no_token" \| "session_invalid" }` |
| 403 | `{ valid: false, error: "license_inactive" }` |

> **Única ruta que devuelve `valid`** en vez de `success`. No homogeneizar sin
> tocar el backend.

### `POST /api/auth/logout`
**Headers:** `Authorization: Bearer`. → `200 { success: true }` (idempotente) |
`400 { error: "no_token" }`.

### `POST /api/auth/reveal-key`  *(auth: Bearer)*
Revela la clave tras reintroducir la contraseña. **Body:** `{ password }`.

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ key }` | Contraseña correcta |
| 401 | `{ error: "invalid_credentials" }` | Contraseña errónea |
| 401 | `{ error: "auth_required" \| "session_invalid" }` | Sin sesión |
| 403 / 409 | como arriba | Inactiva / sin contraseña |

### `POST /api/auth/change-password`  *(auth: Bearer)*
**Body:** `{ current_password, new_password (mín 8) }`.
`200 { success: true }` | `401 invalid_credentials` | `400 weak_password` |
`403/409` como reveal-key.

### `POST /api/auth/request-password-reset`
Sin sesión. **Body:** `{ email, license_key }`.

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, message }` | **Siempre** que el formato sea válido (anti-enumeración) — NO interpretar 200 como "existe" |
| 400 | `{ error: "invalid_input" }` | Formato inválido |
| 429 | `{ error: "reset_limit_reached" }` | Ya usó su reseteo anual (aquí sí se confirma la licencia) |

### `POST /api/auth/confirm-password-reset`
Desde el enlace del email. **Setea contraseña y crea sesión** (no hace falta login).

**Body:** `{ token, new_password, device_name? }`

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, token, expires_at, license }` | Reset confirmado — sesión activa |
| 400 | `{ error: "missing_token" \| "weak_password" \| "invalid_or_expired_token" }` | |
| 403 | `{ error: "license_inactive" }` | revocada/suspendida en el ínterin |

> El reset por email **no** revoca sesiones previas. El reset forzado por admin
> (ver §5) sí limpia sesiones.

### Shape del objeto `license` (`publicLicenseView`, común a activate/login/verify/confirm-password-reset)
```json
{
  "key": "A3F2-9C1E-B847-D205",
  "email": "usuario@ejemplo.com",
  "plan": "mini",
  "status": "active",
  "billing_model": "subscription",
  "has_subscription": true,
  "current_period_ends_at": "2026-08-19T00:00:00Z",
  "cancel_at_period_end": false,
  "trial_ends_at": "2026-08-10T00:00:00Z",
  "device_name": "Chrome en Windows",
  "created_at": "2026-06-19 12:00:00",
  "ai_quota": 10
}
```
- `billing_model`: `"subscription"` (la creó un webhook de Stripe) o `"legacy"`
  (la creó el admin a mano).
- `has_subscription`: `true` si hay `stripe_customer_id` (puede abrir el Portal).
- `trial_ends_at`: ISO futuro si está en trial, `null` si no.

---

## 2. Proxy de IA (`/api/proxy/ai`)  *(auth: Bearer)*

Único punto de acceso a la IA — requiere sesión (`requireLicense`).

**Body:** `{ prompt (≤50.000), max_tokens? (default 1500, rango [100,4000]), kind? ('excel'|'cuestionario'|libre, ≤40), title? (≤120) }`

**Efecto lateral (200):** además de `{ text }`, persiste el análisis en la tabla
`analyses` (best-effort; un fallo de escritura nunca bloquea la respuesta). Solo
guarda `kind`, `title`, `result_html`, `prompt_chars` (el conteo, **no** el prompt).

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ text }` | Éxito (+ persistencia best-effort) |
| 400 | `{ error: "invalid_prompt" \| "prompt_too_long" }` | Vacío o >50.000 |
| 429 | `{ error: "license_daily_limit_reached" }` | **Esta licencia** superó su cuota (mini 10 / pro 50 / max 130) |
| 500 | `{ error: "ai_not_configured" }` | Falta `GEMINI_API_KEY` |
| 502 | `{ error: "ai_provider_error" \| "ai_empty_response" }` | Gemini error / respuesta vacía |
| 503 | `{ error: "ai_quota_exceeded" }` | Cuota free-tier global de Gemini (~1.500/día) — distinto del 429 |

---

## 2.5. Historial de análisis (`/api/analyses`)  *(auth: Bearer, scoped por licencia)*

Todo se scopea por `req.license.id` (de la sesión); el frontend **no envía**
`license_id`. `Historial`/`Informes` comparten `components/HistoryBrowser.jsx`.

### `GET /api/analyses`
Lista **ligera** (sin `result_html`), más recientes primero.
**200:** `{ analyses: [ { id, kind, title, prompt_chars, created_at }, ... ] }`.
`created_at`: UTC `YYYY-MM-DD HH:MM:SS`.

### `GET /api/analyses/:id`
Análisis completo.
**200:** `{ id, kind, title, result_html, prompt_chars, created_at }`.

| Status | Body | Cuándo |
|--------|------|--------|
| 400 | `{ error: "invalid_id" }` | `:id` no es entero |
| 404 | `{ error: "not_found" }` | No existe, O existe pero es de otra licencia (sin leakage) |

> **Seguridad frontend:** renderizar `result_html` SIEMPRE con `sanitizeAiHtml`
> (`middleware/sanitize.js`), nunca `dangerouslySetInnerHTML` directo.

---

## 2.6. Perfil de empresa (`/api/profile`)  *(auth: Bearer, scoped por licencia)*

1 fila por licencia; scoped por sesión. **Shape camelCase** (el del hook):
`companyName`, `sector`, `size`, `mainExpenses` (array), `onboardingCompleted`,
`welcomeCardDismissed`. El backend mapea snake_case internamente.

### `GET /api/profile`
Perfil; si no existe → **vacío con 200** (no 404).
**200:** `{ profile: { companyName:"", sector:"", size:"", mainExpenses:[], onboardingCompleted:false, welcomeCardDismissed:false } }`

### `PUT /api/profile`
Upsert con **merge parcial**: un campo omitido no se vacía; solo se sobreescribe
con un valor **válido**. **Body (partial):** `{ companyName?, sector?, size?,
mainExpenses?, onboardingCompleted?, welcomeCardDismissed? }`.

**Validación server-side:** `companyName` → texto saneado (`sanitizeFreeText`,
máx 120). `sector` → enum de `OnboardingModal` (Comercio/Hostelería/Salud/Legal/
Construcción/Tecnología/Consultoría/Diseño/Educación/Otro; fuera → omitido).
`size` → `solo/2-5/6-20/20+`. `mainExpenses` → filtrados por enum (Alquiler/
Personal/Proveedores/Marketing/Suministros/Tecnología/Transporte/Otro, máx 8).
Booleanos → booleans.

**200:** el perfil persistido (mismo shape). `400 invalid_body` / `400 empty_profile`.

> **Frontend:** `load` al montar (`loading` hasta que cae); `updateProfile(partial)`
> hace PUT **debounced 600 ms acumulando partials** (un PUT por ventana, no por
> tecla; campos distintos de la misma ventana van juntos). `loading` evita el
> flash del `OnboardingModal` en usuarios ya registrados.

---

## 3. Pagos (`/api/payments`)

### `GET /api/payments/plans`  *(público, sin auth)*
Catálogo público de planes — **única fuente de precios del frontend** (anti-drift).
`Pricing.jsx` lo fetcha al montar.

**200:**
```json
{
  "plans": [
    { "id": "mini", "name": "Mini", "price_eur": 5, "quota": 10, "trial": true },
    { "id": "pro",  "name": "Pro",  "price_eur": 20, "quota": 50, "trial": false },
    { "id": "max",  "name": "Max",  "price_eur": 50, "quota": 130, "trial": false }
  ]
}
```
`price_eur` sale de `PLAN_PRICE_{MINI,PRO,MAX}_EUR` (defaults 5/20/50). La `quota`
(10/50/130) es decisión de producto, no env-driven.

### `POST /api/payments/stripe/create-checkout`  *(público)*
Crea una Checkout Session en modo **suscripción** mensual.

**Body:** `{ email, plan: "mini" | "pro" | "max" }`

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ checkout_url: "https://checkout.stripe.com/..." }` | El frontend hace `window.location.href` |
| 400 | `{ error: "invalid_email" }` | Email no válido |
| 400 | `{ error: "invalid_plan" }` | `plan` no está en `VALID_PLANS` (**Deuda I** — antes se coaccionaba a mini; ahora 400 ANTES de tocar Stripe) |
| 500 | `{ error: "stripe_not_configured" }` | Falta `STRIPE_SECRET_KEY` |
| 500 | `{ error: "stripe_price_not_configured" }` | Falta `STRIPE_PRICE_<PLAN>` (**Deuda B** — price_id no configurado) |
| 502 | `{ error: "stripe_error" }` | Stripe devolvió error |
| 500 | `{ error: "internal_error" }` | Excepción |

El plan **mini** lleva `subscription_data[trial_period_days]=14` (tarjeta
obligatoria, no cobra al instante; cobra el día 14). pro/max sin trial. El
`line_items[0][price]` referencia el **price_id estable** de Stripe
(`STRIPE_PRICE_*`) — no `price_data` efímero.

### `POST /api/payments/stripe/create-portal-session`  *(auth: Bearer, requireLicense)*
Sesión del **Stripe Customer Portal** (cancelar, cambiar de plan, método de pago).

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ url: "https://billing.stripe.com/..." }` | El frontend redirige |
| 400 | `{ error: "not_stripe_customer", message }` | Sin `stripe_customer_id` (legacy) |
| 500 | `{ error: "stripe_not_configured" }` | Falta la key |
| 502 | `{ error: "stripe_error" }` | Error de Stripe |

> **Comportamiento del Portal (config desde Stripe dashboard, no código):** los
> cambios de plan aplican **proration = None** → elegir otro plan es **€0 hoy** y
> se aplica al **fin del periodo actual** (anclado a la propia fecha de pago).
> Downgrade sin abono. Un usuario en trial de mini puede subir a pro/max (aplica
> al fin del trial, cobrando €20/€50).

### `GET /api/payments/stripe/reveal?session_id=...`  *(público, sin auth)*
Página `/reveal` al volver de Checkout (el `session_id` es URL-secreta que Stripe
solo entrega al navegador del comprador).

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ key, email, plan }` | El webhook ya creó la licencia (`active`) |
| 400 | `{ error: "missing_session_id" }` | Falta el parámetro |
| 404 | `{ error: "not_found" }` | Webhook aún no llegó, o id inexistente |

### Rutas retiradas (PayPal / Coinbase / Revolut)
`/api/payments/{paypal,coinbase,revolut}/*` **ya no existen** → `404 not_found`.
El frontend **no debe** tener botones de PayPal/Coinbase/Revolut.

---

## 4. Webhooks (`/api/webhooks`) — el frontend NUNCA llama a estas rutas

`POST /api/webhooks/stripe` — llamada exclusivamente por Stripe. Requiere body
RAW para verificar la firma **HMAC-SHA256** (`verifyStripeSignature`, replay
±5 min). Procesa estos eventos (el endpoint LIVE tiene los 6 registrados):

- `checkout.session.completed` → alta de suscripción, crea la licencia
- `invoice.paid` → renovación (o primer cobro real tras el trial); limpia
  `trial_ends_at` solo si `amount_paid > 0`. El 1er `invoice.paid` del trial
  (`billing_reason='subscription_create'`, 0€, sin `invoice.subscription`) se
  trata como **no-op reconocido** (`processed:true`, audit `INVOICE_PAID_TRIAL_OPEN_NOOP`)
  — nunca crea/finiquita una licencia por error (Deuda K)
- `customer.subscription.updated` → cambio de plan / cancelación / `trialing→active`
- `customer.subscription.deleted` → suscripción finiquitada → `expired`, sesiones cerradas
- `invoice.payment_failed` → cobro fallido tras reintentos → `suspended`
- `charge.dispute.created` → chargeback → revocación

Los webhooks `paypal`/`coinbase`/`revolut` se retiraron → `404`.

> **Idempotencia:** `recordPaymentEvent` guarda (provider, event_id) con
> `processed`. Un evento con `processed=1` ya fue tratado (`duplicate`); los que
> quedan `processed=0` (pendientes/sin licencia) se **reintentan** por Stripe —
> por diseño. Que un test con sub_id inexistente quede `processed:false` y se
> reintente es correcto.

---

## 5. Panel admin (`/api/admin`) — app separada

Todas requieren `Authorization: Bearer <ADMIN_SECRET>`. Frontend de administración
= **app separada**, nunca el mismo bundle ni el flujo de auth de usuario.

**Errores transversales:** `500 admin_not_configured` (y en `NODE_ENV=production`
el backend **no arranca** si `ADMIN_SECRET` ≤ 32 chars) · `401 auth_required` ·
`401 invalid_credentials` (comparación en tiempo constante).

| Endpoint | Método | Body / Query | Éxito | Errores específicos |
|----------|--------|--------------|-------|---------------------|
| `/api/admin/stats` | GET | `?period=30` | `{ licenses, activations, revenue, daily_series, recent_events, billing }` | `500 internal_error` |
| `/api/admin/licenses` | GET | — | `[ {licencia} ]` | `500 internal_error` |
| `/api/admin/licenses/:id` | GET | — | `{licencia}` | `404 not_found` |
| `/api/admin/licenses` | POST | `{ email, plan?, notes?, notify?, password? }` | `201 {licencia}` | `400 invalid_email`, `400 weak_password` |
| `/api/admin/licenses/:id` | PUT | `{ status?, plan?, notes?, email? }` | `200 {licencia}` | `404`, `400 invalid_status\|plan\|email` |
| `/api/admin/licenses/:id` | DELETE | — | `{ success: true }` | `404`, `500` |
| `/api/admin/licenses/:id/reset-password` | POST | — | `{licencia}` (limpia pass+sesiones) | `404`, `500` |
| `/api/admin/licenses/:id/set-password` | POST | `{ password }` | `{licencia}` | `404`, `400 weak_password` |
| `/api/admin/audit-log` | GET | `?limit=50` (máx 200) | `[ {evento} ]` | `500` |

Notas:
- `status`: `active | suspended | revoked | expired`.
- `plan`: `mini | pro | max` (`basic` histórico no se acepta en escritura).
- Licencia creada por admin → `billing_model='legacy'`.
- `PUT status='revoked'` limpia sesiones + email de revocación.
- `reset-password` (soporte) limpia contraseña+sesiones, sin límite 1/año.
  `set-password` asigna clave inicial a una migrada, sin tocar sesiones.
- `stats` incluye `billing: { subscription, legacy, trialing, paying_subscribers,
  mrr_eur }` desde Fase 3.

---

## 6. Comportamiento común de `requireLicense`

Aplica a `/api/proxy/ai`, `/api/analyses`, `/api/profile`,
`/api/payments/stripe/create-portal-session`.

| Status | Body | Significado |
|--------|------|-------------|
| 401 | `{ error: "auth_required" }` | No hay token → logout |
| 401 | `{ error: "session_invalid" }` | Token expirado/inexistente → logout |
| 401 | `{ error: "license_not_found" }` | Caso raro → logout |
| 403 | `{ error: "license_inactive" }` | Suspendida/revocada/expired → pantalla específica, NO login normal |

> Ya **no** existe `device_mismatch` (era del modelo fingerprint, eliminado).
> Centralizar este manejo en un interceptor único del cliente HTTP.

---

## 7. Checklist de concordancia frontend ↔ backend

- [ ] El cliente HTTP centraliza base URL + header `Authorization` en un único módulo (`middleware/api.js`)
- [ ] Solo un punto interpreta los `error` codes de §6 y reacciona con consistencia
- [ ] Login distingue `not_activated` (409 → activate) e `invalid_credentials` (401); ya no hay `device_mismatch`
- [ ] `/reveal` es el `success_url` de Stripe (muestra la clave tras checkout, polling `GET .../reveal?session_id=` hasta 200)
- [ ] `Pricing.jsx` fetchea `GET /api/payments/plans` al montar — no hardcodea precios; si el catálogo no carga, deshabilita los botones
- [ ] El badge de trial (14 días) usa `trial===true` del catálogo (hoy solo `mini`), no hardcoded a un id
- [ ] Configuración — Suscripción: si `license.has_subscription` → botón a `create-portal-session`; si `trial_ends_at` futuro → Row "Período de prueba — quedan X días"
- [ ] `aiApi.analyze(prompt, max_tokens, { kind, title })` — Excel pasa `{kind:'excel', title}`, Cuestionario `{kind:'cuestionario', title:'Diagnóstico de negocio'}`
- [ ] `Historial`/`Informes` comparten `HistoryBrowser`: listan `GET /api/analyses`, abren `GET /api/analyses/:id`; `result_html` SIEMPRE vía `sanitizeAiHtml`
- [ ] El frontend no envía `license_id` en `/api/analyses` ni `/api/profile` — el backend scopea por la sesión
- [ ] `useCompanyProfile.js` hace `GET/PUT /api/profile` (debounced acumulando partials, camelCase)
- [ ] `DashboardLayout` no muestra el `OnboardingModal` durante `loading`; `Home` deriva la welcome-card de `welcomeCardDismissed` tras `loading`
- [ ] Ninguna pantalla llama a `/api/webhooks/*` ni tiene botones PayPal/Coinbase/Revolut
- [ ] Panel de administración en bundle/ruta completamente separado del login de usuario