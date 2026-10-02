# Nokfi — Contrato de API (Backend ↔ Frontend)

> Generado a partir del código real del backend. **Esta es la fuente de verdad**
> que se usa para construir el frontend en concordancia exacta. Cualquier cambio
> en las rutas del backend debe reflejarse aquí ANTES de tocar el frontend.
>
> Estado actual (**2026-10-02, sesión 12**): suscripción mensual con **Stripe**
> (3 Products: Mini / Pro / Max; trial de 14 días en Mini; precios desde el
> `.env`, catálogo en `GET /api/payments/plans`). Auth por **email + clave +
> contraseña**. IA con **Groq → Cloudflare Workers AI → Cerebras** (Cerebras
> caduca el 2026-10-29; topes en `utils/aiBudget.js`). Emisión de facturas con
> **VERI*FACTU** (envío a la AEAT apagado: `VERIFACTU_ENV=off`), API pública
> **v1**, servidor **MCP 1.2.0** y nodo **n8n 0.3.0**. e2e: **520**.
>
> §1-§6 son el contrato de la web; §8-§14 (al final) recogen lo añadido de la
> sesión 4 a la 12. El detalle de la API pública está en
> `GET /api/v1/openapi.json` y en la página pública `/api-docs`.

---

## Convenciones generales

- Base URL en producción: `https://nokfi.app/api` (Nginx proxyea `/api` → backend
  en `localhost:3001`; frontend y backend mismo origen; Cloudflare en el edge).
- Todas las rutas autenticadas usan `Authorization: Bearer <token>` (sesión de
  usuario) o `Authorization: Bearer <ADMIN_SECRET>` (panel admin).
- **Seguridad de tokens (auditoría 2026-09)**: la sesión (`sessions.token`) y los
  reset-tokens (`reset_tokens.token`) se guardan en la BD **hasheados con SHA-256**
  (64 hex minúsculas), nunca en texto plano. El token crudo viaja una sola vez en
  la respuesta de creación. La API es transparente a esto: el cliente siempre
  envía el token crudo en el header `Authorization: Bearer`.
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

### Recuperación de acceso con OTP (olvido de clave y/o contraseña)

Flujo de 3 pasos para quien **no recuerda su clave** (el reset clásico la exige).
Prueba de identidad: posesión del buzón de email (OTP de 6 dígitos, 10 min,
máx. 5 intentos, máx. 3 solicitudes/hora por email). El email NUNCA lleva la
clave; esta solo se muestra en pantalla tras verificar el OTP. Todos bajo el
`authLimiter` global de `/api/auth/*`.

**Multi-licencia:** un email puede tener varias licencias activas. El
`recovery_token` se ancla a la primera (FK obligatoria), pero
`confirm-recovery` recibe `license_key` y aplica la nueva contraseña SOLO a
esa licencia (validando que pertenece al email verificado).

#### `POST /api/auth/request-recovery`
**Body:** `{ email }`

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, message }` | **Siempre** que el formato sea válido (anti-enumeración) |
| 400 | `{ error: "invalid_input" }` | Email mal formado |
| 429 | `{ error: "otp_limit_reached" }` | >3 OTP en la última hora para ese email |

#### `POST /api/auth/verify-recovery-otp`
**Body:** `{ email, code }` (code = 6 dígitos)

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success, recovery_token, keys: [{key, plan}] }` | OTP correcto; `recovery_token` vive 15 min |
| 400 | `{ error: "invalid_code" }` | Código incorrecto, inexistente o expirado (misma respuesta) |
| 429 | `{ error: "code_burned" }` | 5 intentos fallidos → código inutilizado, hay que pedir otro |

#### `POST /api/auth/resend-recovered-keys`
Reenvía las claves por email SIN consumir el token (acción repetible mientras viva).

**Body:** `{ recovery_token }` → `200 { success, message }` | `400 invalid_or_expired_token` | `403 license_inactive`

#### `POST /api/auth/confirm-recovery`
Cambia la contraseña SOLO de la licencia indicada (del email verificado) y
**crea sesión** en ella.

**Body:** `{ recovery_token, license_key, new_password, device_name? }`

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | `{ success: true, token, expires_at, license }` | Contraseña cambiada, sesión activa |
| 400 | `{ error: "missing_token" \| "invalid_input" \| "weak_password" \| "invalid_or_expired_token" \| "license_key_mismatch" }` | `license_key_mismatch`: la clave no pertenece al email verificado |
| 403 | `{ error: "license_inactive" }` | revocada/suspendida en el ínterin |

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

## 2. Análisis con IA (`/api/ai/analyze`)  *(auth: Bearer)*

> **`POST /api/proxy/ai` está retirado** (sesión 4, F2): responde
> `410 { error: "client_outdated" }` para que una pestaña con el bundle viejo pida
> recargar. El navegador ya no construye prompts.

**`POST /api/ai/analyze`** — `{ task, input, lang?, title?, job? }`; `task` = `cuestionario`, `excel`, `compare`, `folder` (informes), `folder_map` (notas de una carpeta) o `invoices` (leer facturas con IA).
El backend arma el prompt (`services/ai/prompts.js`), llama a los proveedores en
orden (`AI_PROVIDERS`, hoy `groq,cloudflare,cerebras`; si uno falla pasa al
siguiente) y guarda el informe estructurado en `analyses` con su plan de acción
(`action_items`, `GET/PATCH /api/actions`).

**Cuota diaria por licencia (atómica):** `reserveAiSlot` reserva un hueco en
`ai_usage` (PK `license_id+day+slot`) **antes** de llamar a la IA; si el análisis
falla, `releaseAiSlot` lo libera (un fallo no gasta cuota). Mini 10, Pro 50,
Max 130 al día; la API v1 comparte la misma cuota.

| Status | Body | Cuándo |
|--------|------|--------|
| 200 | informe (`{ analysis_id, kind, title, report, health, actions, … }`), `{ notes }` (folder_map) o `{ invoices }` | Éxito |
| 400 | `{ error: "invalid_input", message }` | Tipo o datos no válidos |
| 429 | `{ error: "license_daily_limit_reached", message }` | Cuota del día agotada |
| 500 | `{ error: "ai_not_configured", message }` | Ningún proveedor configurado |
| 502 | `{ error: "ai_provider_error" \| "ai_empty_response", message }` | Fallaron todos los proveedores (no gasta cuota) |
| 503 | `{ error: "ai_quota_exceeded", message }` | Tope global de gasto de IA del día (`utils/aiBudget.js`) |

El asistente (`POST /api/chat`) usa `CHAT_PROVIDERS` y su propio límite por minuto (`CHAT_PER_MINUTE`).

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
| 429 | `{ error: "rate_limited" }` | **Rate-limit propio** (10 req/min por IP) — defensa en profundidad sobre el limiter general (**auditoría 2026-09**) |

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

## 8. Libro, impuestos y panel  *(auth: Bearer)*

| Ruta | Qué hace |
|---|---|
| `GET/POST /api/ledger`, `PATCH/DELETE /api/ledger/:id` | Libro de facturas recibidas y emitidas (base, IVA, IRPF, total, cobro) |
| `GET /api/finance/taxes` · `PUT /api/finance/reserve` | 303 y 130 del trimestre desde el libro; lo apartado para Hacienda |
| `GET /api/finance/receivables` · `POST /api/finance/collection-email` | Cobros pendientes y email de reclamación (amable, firme, formal) |
| `GET /api/finance/leaks` · `POST/DELETE /api/finance/leaks/dismiss` | Fugas de dinero (suscripciones, subidas de proveedores…) |
| `GET /api/finance/forecast` · `GET /api/finance/benchmark` | Previsión de caja y comparación con el sector |
| `GET /api/finance/calendar?year=` | Calendario fiscal (`utils/fiscalCalendar.js`; la web pública usa una copia en `frontend/src/utils/fiscalCalendar.js`, comprobada con `npm run check:seo`) |
| `GET /api/dashboard` | Resumen del panel de inicio |

## 9. Emisión de facturas (`/api/invoicing`, sesión 11)  *(auth: Bearer)*

Misma lógica para la app, la API v1 y el MCP (`services/invoicing`).

| Ruta | Qué hace |
|---|---|
| `GET/PUT /settings` | Datos de facturación del emisor, series y numeración |
| `GET/POST /customers`, `PATCH/DELETE /customers/:id` | Clientes |
| `GET/POST /invoices`, `GET /invoices/:id` | Listar, emitir (con rectificativas) y ver con eventos y registro VERI*FACTU |
| `POST /invoices/:id/cancel` · `POST /invoices/:id/status` | Anular (registro de anulación) · estado `rejected|accepted|paid|unpaid` |
| `GET /invoices/:id/pdf` · `GET /invoices/:id/xml?format=ubl|facturae|facturx|cii` | PDF con QR y factura electrónica |
| `POST /invoices/:id/send` | Enviar por email al cliente |
| `GET /verifactu`, `GET /verifactu/chain`, `POST /verifactu/retry`, `POST /verifactu/records/:id/resubmit` | Panel VERI*FACTU: registros encadenados (SHA-256), comprobación de la cadena y reintentos |

VERI*FACTU: `VERIFACTU_ENV=off|test|prod` (prod, además, `VERIFACTU_PROD_ENABLED=1`),
`VERIFACTU_LICENSES` (licencias con envío), certificado `VERIFACTU_CERT_PATH` +
`VERIFACTU_CERT_PASSWORD`, productor `VERIFACTU_PRODUCER_NAME` / `_NIF`. En producción
está **apagado**: los registros se generan y quedan pendientes, no se envían.

## 10. Cuenta, desarrolladores y telemetría

| Ruta | Auth | Qué hace |
|---|---|---|
| `GET/POST /api/keys`, `GET /api/keys/summary`, `PATCH/DELETE /api/keys/:id` | Bearer | Claves de API: `nk_live_` (Pro y Max) y `nk_test_` (todos los planes) |
| `GET /api/me/export` · `DELETE /api/me` | Bearer | Descargar todos mis datos · borrar la cuenta (RGPD) |
| `GET/POST /api/share`, `DELETE /api/share/:id` · `GET /api/shared/:token` | Bearer · público | Enlaces de solo lectura para la gestoría (la página `/compartido/:token` lleva `noindex`) |
| `/api/dev/*` (webhooks, deliveries, calls, clients, jobs, playground) | Bearer | Panel de Desarrolladores de la app |
| `POST /api/client-errors` | público, 20/min | Errores técnicos del frontend (`client_errors`) |
| `POST /api/events` | público, 30/min | **Sesión 12**: `{ name: 'cta_trial'|'checkout_start'|'tool_use', path }` → recuento por día, evento y ruta en `web_events` (sin IP, sin user-agent, sin cookies). Sale en el informe diario. 204 / 400 |
| `GET /api/geo` | público | País de la conexión (cabecera de Cloudflare) para el idioma inicial; no se guarda |

## 11. API pública v1 (`/api/v1`)  *(auth: `Bearer nk_live_…` o `nk_test_…`)*

Para n8n, Make, Zapier o código propio. Límite `API_RATE_PER_MINUTE` (30/min por
defecto) y la cuota diaria de IA de la licencia. `Idempotency-Key` en todos los
POST (obligatoria al emitir y rectificar). `?async=true` o `Prefer: respond-async`
en `analyze` e `invoices/extract` → `202` + job (`GET /api/v1/jobs/:id`, 24 h).
Con `nk_test_` todo funciona sin gastar cuota: datos de ejemplo y facturas `TEST-…`
que no entran al libro ni van a la AEAT.

| Grupo | Rutas |
|---|---|
| Especificación | `GET /openapi.json` (pública) |
| Cuota | `GET /usage` |
| Análisis | `POST /analyze`, `GET /analyses`, `GET /analyses/:id` |
| Facturas recibidas | `POST /invoices/extract` (PDF, imagen o texto con IA; XML UBL/Facturae/CII y Factur-X sin IA ni cuota) |
| Emisión | `POST/GET /invoices`, `GET /invoices/:id`, `POST /invoices/:id/rectify`, `/cancel`, `/status`, `GET /invoices/:id/pdf`, `/xml?format=` · `GET/POST /customers` |
| Herramientas sin IA | `GET/POST /tax/nif`, `POST /tax/vat`, `/tax/withholding`, `/tax/model-130`, `GET /tax/quarter`, `/tax/calendar` |
| Jobs y webhooks | `GET /jobs[/:id]` · `GET/POST /webhooks`, `GET/PATCH/DELETE /webhooks/:id`, `POST /webhooks/:id/test` |

## 12. Webhooks salientes

Firmados con HMAC (secreto por endpoint, rotable), reintentos con espera
creciente (1 min → 12 h) y reenvío manual desde el panel. Eventos:

`analysis.completed` · `job.completed` · `job.failed` · `quota.threshold` (80 % y 100 %) ·
`fiscal.deadline` (7 y 1 días antes) · `invoice.issued` · `invoice.cancelled` ·
`invoice.rejected` · `invoice.accepted` · `invoice.paid` · `invoice.unpaid` ·
`verifactu.accepted` · `verifactu.rejected`.

(No confundir con `POST /api/webhooks/stripe`, el webhook **entrante** de Stripe de §4.)

## 13. Servidor MCP (`/api/mcp`, versión 1.2.0)

MCP por HTTP (`POST /api/mcp`, JSON-RPC) con la misma clave de API. Herramientas:
`extract_invoices`, `analyze`, `validate_tax_id`, `calculate_vat`,
`calculate_withholding`, `estimate_model_130`, `fiscal_calendar`, `get_usage`,
`issue_invoice`, `list_invoices`, `get_invoice`, `cancel_invoice`,
`set_invoice_status`, `list_analyses`, `get_analysis`.

## 14. Nodo de n8n (`n8n-nodes-nokfi` 0.3.0)

Paquete npm en el repositorio hermano `../n8n-nodes-nokfi`: nodo de acciones
(análisis, facturas recibidas, emisión, herramientas fiscales) y Trigger por
webhooks (crea y borra su endpoint con `/api/v1/webhooks`). Publicado en npm
el 2026-10-02.

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