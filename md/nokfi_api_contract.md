# Nokfi — Contrato de API (Backend ↔ Frontend)
> Generado a partir del código real del backend (no del documento de definición).
> Esta es la fuente de verdad que se usará para construir el frontend en concordancia exacta.
> Cualquier cambio futuro en las rutas del backend debe reflejarse aquí ANTES de tocar el frontend.

---

## Convenciones generales

- Base URL en producción: `https://app.nokfi.app/api` (vía proxy Nginx hacia el backend en `localhost:3001`)
- Todas las rutas autenticadas usan cabecera `Authorization: Bearer <token>`
- Todas las respuestas son JSON
- Formato de error estándar: `{ "error": "código_snake_case", "message"?: "texto legible" }` — `message` no siempre está presente, especialmente en errores genéricos
- El campo `error` es estable y pensado para lógica del frontend (switch/if). El campo `message`, cuando existe, es texto en español pensado para mostrar directamente al usuario

---

## 0. Código de error transversal: `internal_error`

Antes de entrar en cada endpoint: cualquier ruta del backend puede devolver, ante una excepción inesperada no contemplada explícitamente (catch genérico), una respuesta `500 { error: "internal_error" }`. Aparece en `admin.js`, `payments.js` y `proxy.js`. El frontend debe tratar este caso como un fallback genérico ("Ha ocurrido un error, inténtalo de nuevo") en cualquier llamada a la API, no solo en los endpoints donde se documenta explícitamente más abajo.

---

## 1. Autenticación (`/api/auth`)

### `POST /api/auth/activate`
Primera vinculación de un dispositivo a una licencia recién comprada.

**Request body:**
```json
{
  "email": "usuario@ejemplo.com",
  "license_key": "A3F2-9C1E-B847-D205",
  "client_fingerprint": "<sha256 hex de 64 caracteres, generado en el navegador>",
  "device_name": "Chrome en Windows"
}
```
- `email`: obligatorio, debe pasar regex de email válido
- `license_key`: obligatorio, formato exacto `XXXX-XXXX-XXXX-XXXX` (hex), insensible a mayúsculas
- `client_fingerprint`: obligatorio, debe ser un hash SHA-256 hexadecimal de exactamente 64 caracteres
- `device_name`: opcional, se trunca a 120 caracteres

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 201 | `{ success: true, token, expires_at, license: {...} }` | Activación correcta (primera vez) |
| 200 | `{ success: true, token, expires_at, license: {...} }` | Mismo dispositivo reintentando "activar" — se trata como login |
| 400 | `{ error: "invalid_email" \| "invalid_key_format" \| "invalid_fingerprint", message }` | Validación de input fallida |
| 403 | `{ error: "license_inactive", message }` | Licencia suspendida o revocada |
| 403 | `{ error: "device_already_bound", message }` | La licencia ya tiene OTRO dispositivo vinculado |
| 404 | `{ error: "not_found", message }` | Email+clave no coinciden con ninguna licencia (mensaje deliberadamente genérico) |

**Forma de `license` en la respuesta (objeto `publicLicenseView`):**
```json
{
  "key": "A3F2-9C1E-B847-D205",
  "email": "usuario@ejemplo.com",
  "plan": "basic",
  "status": "active",
  "device_name": "Chrome en Windows",
  "created_at": "2026-06-19 12:00:00"
}
```

---

### `POST /api/auth/login`
Login en un dispositivo ya vinculado previamente.

**Request body:**
```json
{
  "email": "usuario@ejemplo.com",
  "license_key": "A3F2-9C1E-B847-D205",
  "client_fingerprint": "<sha256 hex>"
}
```
(`device_name` no se usa en login, solo en activate)

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, token, expires_at, license: {...} }` | Login correcto |
| 400 | `{ error: "invalid_email" \| "invalid_key_format" \| "invalid_fingerprint" }` | Validación fallida |
| 401 | `{ error: "device_mismatch", message }` | El fingerprint no coincide con el dispositivo vinculado — **el frontend debe ofrecer aquí el flujo de "solicitar reseteo de dispositivo"** |
| 403 | `{ error: "license_inactive", message }` | Suspendida o revocada |
| 404 | `{ error: "not_found", message }` | Email+clave incorrectos |
| 409 | `{ error: "not_activated", message }` | La licencia existe pero nunca se activó — **el frontend debe redirigir al flujo de `/activate`** |

---

### `POST /api/auth/verify`
Comprobar si un token de sesión sigue siendo válido. Pensado para llamarse al cargar la app (verificación de sesión persistida en memoria).

**Headers:** `Authorization: Bearer <token>`
**Request body:** ninguno

**Respuestas:**

| Status | Body |
|--------|------|
| 200 | `{ valid: true, license: {...} }` |
| 401 | `{ valid: false, error: "no_token" \| "session_invalid" \| "device_mismatch" }` |
| 403 | `{ valid: false, error: "license_inactive" }` |

> **Importante para el frontend:** esta es la única ruta que devuelve `valid` en vez de `success`. No homogeneizar sin tocar también el backend.

---

### `POST /api/auth/logout`
**Headers:** `Authorization: Bearer <token>`
**Request body:** ninguno

**Respuestas:**

| Status | Body |
|--------|------|
| 200 | `{ success: true }` (incluso si el token ya no era válido — logout es idempotente) |
| 400 | `{ error: "no_token" }` |

---

### `POST /api/auth/request-device-reset`
Solicita el email con el enlace de reseteo. No requiere sesión activa (el usuario puede haber perdido el dispositivo).

**Request body:**
```json
{ "email": "usuario@ejemplo.com", "license_key": "A3F2-9C1E-B847-D205" }
```

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, message: "Si los datos son correctos, recibirás un email..." }` | **Siempre**, exista o no la licencia (anti-enumeración) — el frontend NO debe interpretar 200 como "la licencia existe" |
| 400 | `{ error: "invalid_input", message }` | Email o clave con formato inválido |
| 429 | `{ error: "reset_limit_reached", message }` | Ya usó su reseteo anual — aquí sí se confirma que la licencia existe, porque ya pasó la validación |

---

### `POST /api/auth/confirm-device-reset`
El usuario llega desde el enlace del email.

**Request body:**
```json
{
  "token": "<token recibido por email>",
  "client_fingerprint": "<sha256 hex>",
  "device_name": "Nuevo portátil"
}
```

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, token, expires_at, license: {...} }` | Reseteo confirmado — **devuelve sesión ya activa, no requiere login adicional** |
| 400 | `{ error: "missing_token" }` | Falta el token en el body |
| 400 | `{ error: "invalid_fingerprint", message }` | Fingerprint del nuevo dispositivo inválido |
| 400 | `{ error: "invalid_or_expired_token", message }` | Token caducado (>30 min) o ya usado |
| 403 | `{ error: "license_inactive", message }` | La licencia fue revocada/suspendida entre la solicitud y la confirmación |

---

## 2. Proxy de IA (`/api/proxy`)

### `POST /api/proxy/ai`
Único punto de acceso a la IA — requiere sesión válida (`requireLicense`).

**Headers:** `Authorization: Bearer <token>`

**Request body:**
```json
{
  "prompt": "texto del análisis a generar...",
  "max_tokens": 1500
}
```
- `prompt`: obligatorio, string no vacío, máximo 50.000 caracteres
- `max_tokens`: opcional, default 1500, se fuerza entre 100 y 4000 aunque se pida más

**Respuestas:**

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ text: "respuesta generada por la IA" }` | Éxito |
| 400 | `{ error: "invalid_prompt", message }` | Prompt vacío o ausente |
| 400 | `{ error: "prompt_too_long", message }` | Supera 50.000 caracteres |
| 401 / 403 | *(ver tabla de `requireLicense` más abajo)* | Sesión inválida o licencia inactiva |
| 500 | `{ error: "ai_not_configured" }` | El servidor no tiene `GEMINI_API_KEY` configurada |
| 502 | `{ error: "ai_provider_error" }` | Gemini devolvió un error distinto a cuota agotada |
| 503 | `{ error: "ai_quota_exceeded", message }` | Se agotó la cuota diaria del free tier de Gemini (~1.500 peticiones/día para todo el proyecto) — **el frontend debe mostrar un mensaje claro de "inténtalo más tarde", no un error genérico**, porque es un caso esperado mientras se use el plan gratuito |
| 429 | `{ error: "license_daily_limit_reached", message }` | *(Añadido en auditoría de seguridad)* Esta licencia concreta superó su límite diario de 50 análisis — protege la cuota compartida de Gemini de que un solo cliente la agote para el resto |
| 502 | `{ error: "ai_empty_response" }` | Gemini respondió sin contenido de texto (puede deberse a sus filtros de seguridad bloqueando el contenido) |

---

## 3. Pagos — checkout (`/api/payments`)

### `POST /api/payments/stripe/create-checkout`
**Request body:** `{ "email": "...", "plan": "basic" | "pro" }`
**Respuesta 200:** `{ "checkout_url": "https://checkout.stripe.com/..." }` — el frontend debe redirigir (`window.location.href`) a esta URL
**Errores:** `400 invalid_email`, `500 stripe_not_configured`, `502 stripe_error`, `500 internal_error`

### `POST /api/payments/paypal/create-order`
**Request body:** `{ "email": "...", "plan": "basic" | "pro" }`
**Respuesta 200:** `{ "order_id": "..." }` — el frontend usa este id con el SDK de botones de PayPal, NO es una URL de redirect
**Errores:** `400 invalid_email`, `500 paypal_not_configured`, `502 paypal_error`, `500 internal_error`

### `POST /api/payments/coinbase/create-charge`
**Request body:** `{ "email": "...", "plan": "basic" | "pro" }`
**Respuesta 200:** `{ "checkout_url": "https://commerce.coinbase.com/charges/..." }` — redirigir igual que Stripe
**Errores:** `400 invalid_email`, `500 coinbase_not_configured`, `502 coinbase_error`, `500 internal_error`

### `POST /api/payments/revolut/create-order`
**Request body:** `{ "email": "...", "plan": "basic" | "pro" }`
**Respuesta 200:** `{ "checkout_url": "https://checkout.revolut.com/..." }` — redirigir igual que Stripe/Coinbase
**Errores:** `400 invalid_email`, `500 revolut_not_configured`, `502 revolut_error`, `500 internal_error`

> **Nota de diseño para el frontend:** Stripe, Coinbase y Revolut devuelven `checkout_url` (redirect directo). PayPal devuelve `order_id` (requiere el SDK JS de PayPal renderizando un botón). Estos dos patrones de integración son distintos y el frontend debe manejarlos de forma diferente, no asumir que los 4 botones de pago funcionan igual.

---

## 4. Webhooks (`/api/webhooks`) — el frontend NUNCA llama a estas rutas

`POST /api/webhooks/stripe`, `POST /api/webhooks/paypal`, `POST /api/webhooks/coinbase`, `POST /api/webhooks/revolut` — llamadas exclusivamente por los proveedores de pago. Documentadas aquí solo para que quede constancia de que existen y de que el frontend no debe ni necesita interactuar con ellas directamente.

Códigos de error que devuelven (relevantes solo para depuración de la integración con el proveedor, nunca para el frontend): `400 missing_signature`, `400 invalid_signature`, `400 missing_transmission_id`, `400 verification_failed`, `500 processing_failed`.

> **Nota técnica:** el webhook de Revolut responde `204` (sin cuerpo) en caso de éxito, a diferencia de Stripe/PayPal/Coinbase que responden `200 { received: true }`. Es el comportamiento recomendado por la documentación oficial de Revolut y no afecta al frontend, que nunca llama a esta ruta.

---

## 5. Panel admin (`/api/admin`) — separado del frontend de usuario

Todas requieren `Authorization: Bearer <ADMIN_SECRET>`. Si se construye un frontend de administración (fuera del scope de la app de usuario), debe tratarse como una aplicación separada, nunca compartir el mismo bundle ni el mismo flujo de auth que el login normal de licencia.

**Errores transversales de autenticación admin** (antes de llegar a cualquier endpoint):
- `500 { error: "admin_not_configured" }` — el servidor no tiene `ADMIN_SECRET` en su `.env` (fallo de despliegue, no del cliente)
- `401 { error: "auth_required" }` — falta el header Authorization
- `401 { error: "invalid_credentials" }` — el secret no coincide

| Endpoint | Método | Body / Query | Respuesta éxito | Errores específicos adicionales |
|----------|--------|---------------|------------------|----------------------------------|
| `/api/admin/stats` | GET | `?period=30` (días, opcional) | `{ licenses: {...}, activations: {...}, revenue: {...}, daily_series: [...], recent_events: [...] }` | `500 internal_error` |
| `/api/admin/licenses` | GET | — | `[ {licencia}, ... ]` | `500 internal_error` |
| `/api/admin/licenses/:id` | GET | — | `{licencia}` | `404 not_found` |
| `/api/admin/licenses` | POST | `{ email, plan?, notes?, notify? }` | `201 {licencia creada}` | `400 invalid_email`, `500 internal_error` |
| `/api/admin/licenses/:id` | PUT | `{ status?, plan?, notes?, email? }` | `200 {licencia actualizada}` | `404 not_found`, `400 invalid_status`, `400 invalid_plan`, `400 invalid_email`, `500 internal_error` |
| `/api/admin/licenses/:id` | DELETE | — | `{ success: true }` | `404 not_found`, `500 internal_error` |
| `/api/admin/licenses/:id/reset-device` | POST | — | `{licencia con dispositivo reseteado}` | `404 not_found`, `500 internal_error` |
| `/api/admin/audit-log` | GET | `?limit=50` (máx 200) | `[ {evento}, ... ]` | `500 internal_error` |

---

## 6. Comportamiento común de `requireLicense` (middleware)

Cualquier ruta protegida con este middleware (actualmente solo `/api/proxy/ai`, pero se usará en futuras rutas del dashboard) puede devolver:

| Status | Body | Significado para el frontend |
|--------|------|-------------------------------|
| 401 | `{ error: "auth_required", message }` | No se envió token — forzar logout/redirect a login |
| 401 | `{ error: "session_invalid", message }` | Token expirado o no existe — forzar logout/redirect a login |
| 401 | `{ error: "license_not_found", message }` | Caso raro/inconsistente — forzar logout |
| 403 | `{ error: "license_inactive", message }` | Suspendida o revocada — mostrar pantalla específica, NO login normal |
| 401 | `{ error: "device_mismatch", message }` | El fingerprint cambió tras un reseteo — forzar logout y ofrecer reactivación |

**Recomendación de implementación en el frontend:** centralizar esta lógica en un interceptor único (ej. wrapper de `fetch` o interceptor de axios) que, ante cualquiera de estos `error` codes, limpie el estado de sesión en memoria y redirija a la pantalla correspondiente — no repetir este manejo en cada componente que llame a la API.

---

## 7. Formato del device fingerprint — contrato cliente→servidor

El frontend es responsable de generar `client_fingerprint` así:
1. Combinar: `navigator.userAgent`, resolución de pantalla, timezone, idioma, un canvas fingerprint, y `navigator.hardwareConcurrency`
2. Aplicar SHA-256 sobre la combinación (ej. con `crypto.subtle.digest`)
3. Convertir a hex string en minúsculas de exactamente 64 caracteres

El backend valida con la regex `^[a-f0-9]{64}$/i` (acepta mayúsculas o minúsculas) y luego deriva internamente un segundo hash combinando este valor con el User-Agent y el prefijo de IP vistos en la petición (`utils/fingerprint.js → deriveServerFingerprint`). **El frontend nunca ve ni necesita saber sobre esta segunda derivación** — solo debe generar y enviar el hash de 64 caracteres correctamente.

---

## 8. Checklist de concordancia para cuando se construya el frontend

- [ ] El cliente HTTP del frontend centraliza la base URL y el manejo de `Authorization` en un único módulo (ej. `middleware/api.js`, ya previsto en la estructura)
- [ ] Existe un único punto que interpreta los `error` codes de la tabla de la sección 6 y reacciona de forma consistente
- [ ] El flujo de fingerprint se genera una sola vez por sesión de navegador y se reutiliza, no se regenera en cada llamada
- [ ] La pantalla de login distingue explícitamente los casos `not_activated` (409) vs `device_mismatch` (401) vs `not_found` (404) — son tres problemas distintos con tres soluciones distintas para el usuario
- [ ] El botón de pago con PayPal usa el SDK de botones (no redirect), mientras que Stripe y Coinbase sí redirigen
- [ ] Ninguna pantalla del frontend intenta llamar directamente a `/api/webhooks/*`
- [ ] El panel de administración (si se construye) vive en un bundle/ruta completamente separado del login de usuario normal
