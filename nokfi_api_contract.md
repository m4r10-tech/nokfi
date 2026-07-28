# Nokfi — Contrato de API (Backend ↔ Frontend)
> Generado a partir del código real del backend. **Esta es la fuente de verdad**
> que se usará para construir el frontend en concordancia exacta. Cualquier
> cambio futuro en las rutas del backend debe reflejarse aquí ANTES de tocar
> el frontend.
>
> Estado actual: **Fase 3** — modelo de **suscripción mensual** vía **Stripe**
> (3 tiers: mini / pro / max) con **trial de 14 días** en el plan mini. Auth
> por **email + clave + contraseña** (el viejo modelo de device-fingerprint se
> eliminó en `f9385af`; el anti-sharing se delega en la cuota diaria de IA por
> licencia). PayPal, Revolut y Coinbase Commerce se retiraron — **Stripe es la
> única pasarela**; sus antiguos endpoints devuelven `404 not_found` (ya no
> están montados).

---

## Convenciones generales

- Base URL en producción: `https://app.nokfi.app/api` (vía proxy Nginx hacia el backend en `localhost:3001`)
- Todas las rutas autenticadas usan cabecera `Authorization: Bearer <token>` (sesión de usuario) o `Authorization: Bearer <ADMIN_SECRET>` (panel admin)
- Todas las respuestas son JSON
- Formato de error estándar: `{ "error": "código_snake_case", "message"?: "texto legible" }` — `message` no siempre está presente, especialmente en errores genéricos
- El campo `error` es estable y pensado para lógica del frontend (switch/if). El campo `message`, cuando existe, es texto en español pensado para mostrar directamente al usuario
- Cualquier ruta puede devolver `500 { error: "internal_error" }` ante una excepción no contemplada — el frontend debe tratarlo como fallback genérico

---

## 1. Autenticación (`/api/auth`) — modelo email + clave + contraseña

El login usa **3 factores**: `email` + `license_key` (`XXXX-XXXX-XXXX-XXXX`, hex, insensible a mayúsculas) + `password` (scrypt, mínimo 8 caracteres). Ya **no** se usa el `client_fingerprint` del navegador (la cuota diaria de IA por licencia hace el trabajo anti-sharing). El primer acceso de una licencia nueva es `/activate` (eliges la contraseña); los siguientes son `/login`.

El campo `device_name` (opcional en activate y confirm-password-reset) sigue existiendo solo como etiqueta legible que el usuario puede ver en Configuración — **no** participa en la autenticación.

### `POST /api/auth/activate`
Primer acceso: la licencia aún no tiene contraseña. El usuario la elige aquí.

**Request body:**
```json
{
  "email": "usuario@ejemplo.com",
  "license_key": "A3F2-9C1E-B847-D205",
  "password": "mínimo 8 caracteres",
  "device_name": "Chrome en Windows"
}
```
- `email`: obligatorio, regex de email
- `license_key`: obligatorio, formato `XXXX-XXXX-XXXX-XXXX` (hex)
- `password`: obligatorio, 8–256 caracteres
- `device_name`: opcional, se trunca a 120 caracteres

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 201 | `{ success: true, token, expires_at, license: {...} }` | Activación correcta (primera vez) |
| 409 | `{ error: "already_activated", message }` | La licencia ya tiene contraseña → usar `/login` o `/request-password-reset` |
| 403 | `{ error: "license_inactive", message }` | Licencia suspendida o revocada (mensaje distingue `revoked` vs `suspended`) |
| 404 | `{ error: "not_found", message }` | email+clave no coinciden (genérico, anti-enumeración) |
| 400 | `{ error: "weak_password" \| "invalid_email" \| "invalid_key_format", message }` | Validación fallida |

### `POST /api/auth/login`
Login con la contraseña ya seteada.

**Request body:**
```json
{ "email": "...", "license_key": "A3F2-9C1E-B847-D205", "password": "..." }
```

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, token, expires_at, license: {...} }` | Login correcto |
| 409 | `{ error: "not_activated", message }` | La licencia existe pero no tiene contraseña → redirigir al flujo `/activate` |
| 401 | `{ error: "invalid_credentials", message }` | Credenciales incorrectas o licencia inactiva (mensaje **siempre** genérico: no revela si la cuenta existe) |
| 400 | `{ error: "invalid_input", message }` | Formato de email/clave/contraseña inválido |

### `POST /api/auth/verify`
Comprobar si un token sigue siendo válido. Llamar al cargar la app (verificar sesión persistida en memoria/sessionStorage).

**Headers:** `Authorization: Bearer <token>` · **Body:** ninguno

| Status | Body |
|--------|------|
| 200 | `{ valid: true, license: {...} }` |
| 401 | `{ valid: false, error: "no_token" \| "session_invalid" }` |
| 403 | `{ valid: false, error: "license_inactive" }` |

> **Única ruta que devuelve `valid`** en vez de `s`uccess`. No homogeneizar sin tocar el backend.

### `POST /api/auth/logout`
**Headers:** `Authorization: Bearer <token>` · **Body:** ninguno

| Status | Body |
|--------|------|
| 200 | `{ success: true }` (idempotente aunque el token ya no exista) |
| 400 | `{ error: "no_token" }` |

### `POST /api/auth/reveal-key`  *(auth: Bearer)*
Revela la clave de licencia tras re-introducir la contraseña (página de Configuración).

**Request body:** `{ "password": "..." }`

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ key: "A3F2-9C1E-B847-D205" }` | Contraseña correcta |
| 401 | `{ error: "invalid_credentials" }` | Contraseña errónea |
| 401 | `{ error: "auth_required" \| "session_invalid" }` | Sin sesión |
| 403 | `{ error: "license_inactive" }` | Licencia inactiva |
| 409 | `{ error: "not_activated" }` | Licencia sin contraseña todavía |

### `POST /api/auth/change-password`  *(auth: Bearer)*
**Request body:** `{ "current_password": "...", "new_password": "..." }` (la nueva, mínimo 8)

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true }` | Cambiada |
| 401 | `{ error: "invalid_credentials", message }` | La contraseña actual no coincide |
| 400 | `{ error: "weak_password", message }` | La nueva no cumple el mínimo |
| 403 / 409 | igual que reveal-key | Licencia inactiva / sin contraseña |

### `POST /api/auth/request-password-reset`
El usuario olvidó la contraseña. **No requiere sesión** (puede haberla perdido). Requiere email + clave.

**Request body:** `{ "email": "...", "license_key": "A3F2-..." }`

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, message: "Si los datos son correctos, recibirás un email..." }` | **Siempre** que el formato sea válido, exista o no la licencia (anti-enumeración) — el frontend NO debe interpretar 200 como "la licencia existe" |
| 400 | `{ error: "invalid_input", message }` | Email o clave con formato inválido |
| 429 | `{ error: "reset_limit_reached", message }` | Ya usó su reseteo anual — aquí sí se confirma que la licencia existe |

### `POST /api/auth/confirm-password-reset`
El usuario llega desde el enlace del email. **Setea la nueva contraseña y crea sesión inmediata** — no hace falta login adicional.

**Request body:**
```json
{ "token": "<token del email>", "new_password": "...", "device_name": "Nuevo portátil" }
```

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, token, expires_at, license: {...} }` | Reset confirmado — **sesión ya activa** |
| 400 | `{ error: "missing_token" }` | Falta el token |
| 400 | `{ error: "weak_password", message }` | La nueva no cumple el mínimo |
| 400 | `{ error: "invalid_or_expired_token", message }` | Token caducado (>30 min) o ya usado |
| 403 | `{ error: "license_inactive", message }` | Licencia revocada/suspendida entre la solicitud y la confirmación |

> **Nota:** el reset por email **no** revoca sesiones previas — quien resetea puede tener otra pestaña abierta legítimamente. El reset **forzado por admin** (ver §5) sí limpia sesiones.

### `license` — forma del objeto `publicLicenseView` (común a activate/login/verify/confirm-password-reset)
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
- `billing_model`: `"subscription"` (la creó un webhook de Stripe) o `"legacy"` (la creó el admin a mano, sin cobro recurrente)
- `has_subscription`: `true` si hay `stripe_customer_id` (puede abrir el Customer Portal)
- `trial_ends_at`: ISO futuro si la suscripción está en trial de 14 días, `null` si no aplica o ya terminó
- `ai_quota`: cuota diaria de análisis IA del plan (mini **10** / pro **50** / max **130**)

---

## 2. Proxy de IA (`/api/proxy/ai`)  *(auth: Bearer)*

Único punto de acceso a la IA — requiere sesión válida (`requireLicense`).

**Request body:**
```json
{ "prompt": "texto a analizar...", "max_tokens": 1500 }
```
- `prompt`: obligatorio, string no vacío, máximo 50.000 caracteres
- `max_tokens`: opcional, default 1500, se fuerza al rango `[100, 4000]`

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ text: "respuesta generada por Gemini" }` | Éxito |
| 400 | `{ error: "invalid_prompt" \| "prompt_too_long", message }` | Prompt vacío o >50.000 |
| 429 | `{ error: "license_daily_limit_reached", message }` | **Esta licencia** superó su cuota diaria (mini 10 / pro 50 / max 130). El frontend debe mostrar "mejora tu plan" o "inténtalo mañana" — es un caso esperado y distinguible |
| 500 | `{ error: "ai_not_configured" }` | Falta `GEMINI_API_KEY` en el servidor |
| 502 | `{ error: "ai_provider_error" }` | Gemini devolvió un error distinto a cuota |
| 502 | `{ error: "ai_empty_response" }` | Gemini respondió sin texto (lo bloquearon sus filtros de seguridad) |
| 503 | `{ error: "ai_quota_exceeded", message }` | **Cuota del free tier de Gemini** (~1.500/día para todo el proyecto) agotada — distinto del 429 anterior, que es por licencia. Mostrar "inténtalo más tarde" |
| 401/403 | *(ver tabla de `requireLicense` en §6)* | Sesión inválida o licencia inactiva |

---

## 3. Pagos — checkout (`/api/payments`)

### `GET /api/payments/plans`  *(público, sin auth)*
Catálogo público de planes — **única fuente de precios del frontend** (anti-drift: evita que la web enseñe un precio y Stripe cobre otro). `Pricing.jsx` lo fetcha al montar.

**Respuesta 200:**
```json
{
  "plans": [
    { "id": "mini", "name": "Mini", "price_eur": 5, "quota": 10, "trial": true },
    { "id": "pro",  "name": "Pro",  "price_eur": 20, "quota": 50, "trial": false },
    { "id": "max",  "name": "Max",  "price_eur": 50, "quota": 130, "trial": false }
  ]
}
```
Los precios (`price_eur`) se leen de `PLAN_PRICE_MINI_EUR` / `_PRO_` / `_MAX_` en el `.env` (defaults 5/20/50). Cambiar el `.env` y reiniciar mueve a la vez este catálogo **y** lo que cobra Stripe. La `quota` (10/50/130) es decisión de producto, **no** env-driven.

### `POST /api/payments/stripe/create-checkout`  *(público)*
Crea una Checkout Session en modo **suscripción** mensual.

**Request body:** `{ "email": "...", "plan": "mini" | "pro" | "max" }`
(`plan` inválido se coacciona a `mini` — no da 400.)

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ checkout_url: "https://checkout.stripe.com/..." }` | El frontend redirige (`window.location.href`) a esta URL |
| 400 | `{ error: "invalid_email" }` | Email no válido |
| 500 | `{ error: "stripe_not_configured" }` | Falta `STRIPE_SECRET_KEY` en el servidor |
| 502 | `{ error: "stripe_error" }` | Stripe devolvió error |
| 500 | `{ error: "internal_error" }` | Excepción |

El checkout del plan **mini** incluye `trial_period_days=14` con tarjeta obligatoria (no cobra al instante; cobra a los 14 días; `end_behavior=release` deja que la suscripción pase a `active` y se cobre). pro/max no llevan trial.

### `POST /api/payments/stripe/create-portal-session`  *(auth: Bearer, requireLicense)*
Crea una sesión del **Stripe Customer Portal** para que el usuario gestione su suscripción: cancelar (a fin de periodo), mejorar de plan (mini→pro→max con prorrata automática) o actualizar el método de pago. Se prefirió el Portal nativo sobre endpoints custom.

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ url: "https://billing.stripe.com/..." }` | El frontend redirige a esa URL |
| 400 | `{ error: "not_stripe_customer", message }` | La licencia no tiene `stripe_customer_id` (legacy, sin suscripción real) — no hay nada que gestionar |
| 500 | `{ error: "stripe_not_configured" }` | Falta la key |
| 502 | `{ error: "stripe_error" }` | Error de Stripe |
| 401/403 | ver §6 | Sin sesión / inactiva |

### `GET /api/payments/stripe/reveal?session_id=...`  *(público, sin auth)*
Página `/reveal` al volver de Checkout: muestra la clave recién comprada en la web (además del email que ya mandó el webhook). El `session_id` es la URL-secreta que Stripe solo entrega al navegador del comprador (va en el `success_url`).

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ key, email, plan }` | El webhook ya llegó y creó la licencia (`status=active`) |
| 400 | `{ error: "missing_session_id" }` | Falta el parámetro |
| 404 | `{ error: "not_found" }` | El webhook aún no ha llegado, o el `session_id` no existe |

### Rutas retiradas (PayPal / Coinbase / Revolut)
`POST /api/payments/paypal/create-order`, `POST /api/payments/coinbase/create-charge` y `POST /api/payments/revolut/create-order` **ya no existen** (se eliminaron al pasar a Stripe-only). Devuelven `404 { error: "not_found" }` al caer al 404 global del backend. El frontend **no debe** tener botones de PayPal/Coinbase/Revolut.

---

## 4. Webhooks (`/api/webhooks`) — el frontend NUNCA llama a estas rutas

`POST /api/webhooks/stripe` — llamada exclusivamente por Stripe. Requiere body RAW (sin parsear) para verificar la firma HMAC-SHA256 (`verifyStripeSignature` con prevención de replay: rechaza timestamps fuera de ±5 min). Procesa estos eventos:
- `checkout.session.completed` → alta de suscripción, crea la licencia
- `invoice.paid` → renovación (o primer cobro real tras el trial); limpia `trial_ends_at` solo si `amount_paid > 0`
- `customer.subscription.updated` → cambio de plan / cancelación programada / transición `trialing→active`
- `customer.subscription.deleted` → suscripción finiquitada → `status='expired'`, sesiones cerradas
- `invoice.payment_failed` → cobro fallido tras reintentos → `status='suspended'`
- `charge.dispute.created` → chargeback → revocación

Los antiguos webhooks `POST /api/webhooks/paypal`, `/coinbase` y `/revolut` se retiraron y devuelven `404`. El frontend nunca los necesita.

---

## 5. Panel admin (`/api/admin`) — separado del frontend de usuario

Todas requieren `Authorization: Bearer <ADMIN_SECRET>`. Si se construye un frontend de administración, es una app separada: nunca compartir el mismo bundle ni el mismo flujo de auth que el login de licencia.

**Errores transversales de auth admin** (antes de cualquier endpoint):
- `500 { error: "admin_not_configured" }` — falta `ADMIN_SECRET` en `.env`. Además, en `NODE_ENV=production` el backend **se niega a arrancar** si `ADMIN_SECRET` tiene menos de 32 caracteres
- `401 { error: "auth_required" }` — falta el header Authorization
- `401 { error: "invalid_credentials" }` — el secret no coincide (comparación en tiempo constante)

| Endpoint | Método | Body / Query | Respuesta éxito | Errores específicos adicionales |
|----------|--------|---------------|------------------|----------------------------------|
| `/api/admin/stats` | GET | `?period=30` (días) | `{ licenses, activations, revenue, daily_series, recent_events, billing: {...} }` | `500 internal_error` |
| `/api/admin/licenses` | GET | — | `[ {licencia}, ... ]` | `500 internal_error` |
| `/api/admin/licenses/:id` | GET | — | `{licencia}` | `404 not_found` |
| `/api/admin/licenses` | POST | `{ email, plan?, notes?, notify?, password? }` | `201 {licencia}` | `400 invalid_email`, `400 weak_password`, `500 internal_error` |
| `/api/admin/licenses/:id` | PUT | `{ status?, plan?, notes?, email? }` | `200 {licencia}` | `404 not_found`, `400 invalid_status`, `400 invalid_plan`, `400 invalid_email`, `500 internal_error` |
| `/api/admin/licenses/:id` | DELETE | — | `{ success: true }` | `404 not_found`, `500 internal_error` |
| `/api/admin/licenses/:id/reset-password` | POST | — | `{licencia con pass+sesiones limpiadas}` | `404 not_found`, `500 internal_error` |
| `/api/admin/licenses/:id/set-password` | POST | `{ password }` | `{licencia}` | `404 not_found`, `400 weak_password`, `500 internal_error` |
| `/api/admin/audit-log` | GET | `?limit=50` (máx 200) | `[ {evento}, ... ]` | `500 internal_error` |

Notas del panel admin:
- `status` admite `active | suspended | revoked | expired`
- `plan` admite `mini | pro | max` (la convención histórica `basic` no se acepta en escritura — solo está migrada como dato)
- Una licencia creada por el admin se marca `billing_model='legacy'` (no hay suscripción real de Stripe detrás)
- `PUT` a `status='revoked'` limpia sesiones activas y envía email de revocación automáticamente
- `reset-password` (forzado por soporte) **limpia contraseña + sesiones** y no tiene el límite de 1/año que aplica al reset por email. `set-password` solo asigna contraseña inicial a una licencia migrada sin contraseña, sin tocar sesiones
- `stats` devuelve un bloque extra `billing: { subscription, legacy, trialing, paying_subscribers, mrr_eur }` desde Fase 3 (ver `nokfi_proyecto.md` §16)

---

## 6. Comportamiento común de `requireLicense` (middleware)

Cualquier ruta protegida con este middleware (actualmente `/api/proxy/ai` y `/api/payments/stripe/create-portal-session`) puede devolver:

| Status | Body | Significado para el frontend |
|--------|------|-------------------------------|
| 401 | `{ error: "auth_required", message }` | No se envió token — forzar logout |
| 401 | `{ error: "session_invalid", message }` | Token expirado o no existe — forzar logout |
| 401 | `{ error: "license_not_found", message }` | Caso raro/inconsistente — forzar logout |
| 403 | `{ error: "license_inactive", message }` | Suspendida, revocada o expired — pantalla específica, NO login normal |

> Ya **no** existe el caso `device_mismatch` (ese era del modelo fingerprint, eliminado).

**Recomendación de implementación:** centralizar esta lógica en un interceptor único del cliente HTTP (wrapper de fetch / interceptor de axios) que, ante cualquiera de estos `error` codes, limpie la sesión en memoria y redirija a la pantalla correspondiente — no repetir el manejo en cada componente.

---

## 7. Checklist de concordancia frontend ↔ backend

- [ ] El cliente HTTP centraliza la base URL y el header `Authorization` en un único módulo (`middleware/api.js`)
- [ ] Existe un único punto que interpreta los `error` codes de §6 y reacciona con consistencia
- [ ] La pantalla de login distingue `not_activated` (409 → flujo activate) y `invalid_credentials` (401 → "datos incorrectos"); ya no hay `device_mismatch`
- [ ] `/reveal` es la página de destino del `success_url` de Stripe (muestra la clave tras el checkout, polling `GET /api/payments/stripe/reveal?session_id=` hasta 200)
- [ ] `Pricing.jsx` fetchea `GET /api/payments/plans` al montar — **no** hardcodea precios; si el catálogo no carga, deshabilita los botones de suscribir
- [ ] El badge de trial (14 días) se muestra en la card del plan que tenga `trial===true` en el catálogo (hoy solo `mini`), no hardcoded a un `id`
- [ ] Configuración — sección Suscripción: si `license.has_subscription` → botón a `create-portal-session`; si `license.trial_ends_at` futuro → Row "Período de prueba — quedan X días"
- [ ] Ninguna pantalla intenta llamar a `/api/webhooks/*`
- [ ] Ninguna pantalla tiene botones de PayPal / Coinbase / Revolut (retirados → 404)
- [ ] Panel de administración (si se construye) en bundle/ruta completamente separado del login de usuario
