# Nokfi — Despliegue y operación en el VPS

> Última actualización: **2026-08-16**. Estado: **producción viva en HTTPS con
> Cloudflare Full strict y Stripe LIVE cobrando**.
>
> Documento operativo: topología, estado de despliegue, infraestructura (Nginx +
> Cloudflare), deudas abiertas y cómo continuar. Para el contrato Backend↔Frontend
> ver [`api.md`](api.md); para la visión de producto ver [`proyecto.md`](proyecto.md).

---

## 0. TL;DR (estado actual)

- **Producción HTTPS viva**: `https://nokfi.app/` (Nginx + Let's Encrypt, cert
  hasta **2026-11-01** autorenova via `certbot.timer`).
- **Cloudflare (edge) EN PROD — Full strict (2026-08-08/10), completo y
  verificado**: CF es el edge de `nokfi.app` (origen `191.44.112.86` oculto tras
  anycast `104.21.6.208`/`172.67.135.69`). real-IP chain, Bot Fight OFF, WAF skip
  webhook, 3 Cache Rules, Redirect www→nokfi 301, renewal HTTP-01 a través de CF.
  Detalle en §3.
- **Stripe LIVE cobrando de verdad**: pago real verificado de punta a punta
  (licencia `id=2`, mini trial 14d → 0€ hoy, correo recibido, Portal abierto).
  Webhook LIVE con los **6 eventos** y entrega OK a través de CF. La cadena
  bloqueada desde el deploy del trial quedó validada.
- **Mailer Resend 100%**: dominio `nokfi.app` verificado en Resend,
  `EMAIL_FROM=noreply@nokfi.app`; probe real `{sent:true}`.
- **Modelo billing (Deuda B)**: 3 Products separados + un Price recurrente mensual
  EUR cada uno; Portal con proration `None`. Migrado y desplegado.
- **Deuda H (cuota IA TOCTOU)**: **resuelta** — cuota atómica por slots en
  `ai_usage` (ver `api.md` §2).
- **Backend**: 107/107 e2e PASS, PM2 `nokfi-backend` `:3001`.

**Pendiente (no bloqueante, cosmético):** forwarding `info@/help@/soporte@nokfi.app`
vía Namecheap (gratis; CF no proxya MX/TXT).

---

## 1. Topología y convenciones (VPS `191.44.112.86`)

Cadena de tráfico: **Cliente → TLS → Cloudflare (edge, valida LE) → TLS → Nginx
(real-IP) → Express `:3001`**.

- **Paths**: app en `/home/deploy/nokfi-fase3/`. Backend (PM2 fork, cwd
  `.../backend`, `:3001`), frontend build en `.../frontend/dist` (servido por
  Nginx). `/etc/nginx/sites-available/nokfi.app` (sitio) +
  `/etc/nginx/conf.d/cloudflare.conf` (real-IP). DB en `.../backend/db/nokfi.db`.
- **Resurrect**: systemd `pm2-deploy.service` arranca PM2 al boot (no hay
  arranque manual tras reboot).
- **`DB_PATH` y `dotenv` son RELATIVOS al cwd** — PM2 arranca con cwd
  `backend/`. Redeployar en un directorio nuevo rompe DB/env si no se respeta
  (gotcha histórico).
- **SSH**: deploy autónomo por llave (sin credenciales en chat). El usuario hace
  `git push` fuera de Claude Code; Claude hace `git pull --ff-only` al VPS suele
  ir + `pm2 restart --update-env`.
- **`.env` (con secretos) NUNCA se commitea** (gitignored, mode 600). Backups
  con timestamp (`cp .env .env.bak.$(date…)`). Reiniciar con `pm2 restart
  --update-env` tras tocar env.
- **Secretos**: nunca pegar claves/tokens en el chat. Stripe/otras keys las coloca
  el usuario en el `.env` por su SSH; Claude solo reinicia y verifica (prefijos,
  longitud, nunca valores completos).
- **No sudo desde Claude Code** (sin TTY) — los pasos `sudo` los corre el usuario.

## 2. Estado de despliegue (back-end SERVICES)

Backend PM2 `nokfi-backend` `:3001`. Smoke esperado: `/health` 200 (la raíz, SIN
`/api` — `/api/health` NO existe, ojo), `/api/payments/plans` 200 (5/20/50),
`/api/profile` 401 sin auth, `/api/analyses` 401 sin auth.

## 3. Cloudflare (edge) — Full strict

Edge live verificado (curl `--resolve` a la anycast de CF): apex `HTTP/2 200 /
server: cloudflare / cf-cache-status: DYNAMIC / cf-ray …`. www `301` (Redirect
Rule).

### Dashboard CF `nokfi.app` (Free): config esencial
- **SSL/TLS → Full (strict)** (no Flexible). Always-HTTPS ON.
- **DNS**: A `@`+`www` → `191.44.112.86` **Proxied 🟠**. MX/TXT de Resend quedan
  **DNS-only 🔘** (mailer no se toca). Nameservers → Custom DNS =
  `terry.ns.cloudflare.com` + `tina.ns.cloudflare.com`.
- **🔴 Bot Fight Mode OFF** — el UA `Stripe/1.0` del webhook DEBE pasar
  (crear licencia). ON mataría los cobros reales.
- **WAF Custom rule** `Skip WAF — Stripe webhook` sobre `uri.path eq
  "/api/webhooks/stripe"` → skip (defensa futura; el `webhookLimiter` Express +
  firma HMAC siguen vigentes).
- **3 Cache Rules** (orden 1>2>3): (1) Bypass `/api/*`; (2) Cache `/assets/*`
  Apply-origin-TTL (respeta `expires 1y` de Nginx, assets con hash = inmutables);
  (3) Bypass SPA shell `not /api/ and not /assets/` (cubre `/`, `/login` `/app/*`,
  `sw.js`). Razón del bypass del shell: si CF cachea `index.html`, un deploy nuevo
  no se ve hasta pasar el TTL del edge.
- **Redirect Rule** `Canonicalize www → nokfi` 301: expression
  `(http.host eq "www.nokfi.app" and not starts_with(uri.path,
  "/.well-known/acme-challenge/"))` → Dynamic `concat("https://nokfi.app",
  uri.path)` + Preserve query + 301. **La exclusión acme es VITAL**: sin ella el
  redirect agarraría el reto HTTP-01 de www → el SAN www dejaría de renovar → el
  cert caducaría (2026-11-01).

### Nginx real-IP (`deploy/nginx-cloudflare-realip.conf` → `/etc/nginx/conf.d/cloudflare.conf`)
`ngx_http_realip_module`: `set_real_ip_from` (rango de CF: 15 v4 + 7 v6) +
`real_ip_header CF-Connecting-IP` + `real_ip_recursive on`. **Solo** reescribe si
la conexión entrante proviene de un rango CF → **anti-spoof**: un atacante que
conecte directo al VPS con su IP real no pasa el rewrite y `req.ip` es su IP
verdadera. Con `trust proxy:1` (`server.js:39`) el único proxy que Express ve es
Nginx → `req.ip` correcto, los 5 rate-limiters auditan por visitante real. Fuente
de rangos: `https://www.cloudflare.com/ips/` (revisar en cada cambio).

### Cert LE
Cert Let's Encrypt (SAN `nokfi.app` + `www`) en `/etc/letsencrypt/live/nokfi.app/`,
caduca 2026-11-01. `certbot.timer` autorenueva por CF (reto HTTP-01 pasa por la
exclusión acme + Cache Rule bypass shell). Dry-run verificado (`Congratulations,
all simulated renewals succeeded`).

## 4. Stripe LIVE

- **Modelo**: 3 Products separados (Nokfi Mini/Pro/Max) con 1 Price recurrente
  mensual EUR cada uno. Portal con proration `None` (cambios a fin de periodo,
  €0 hoy, downgrade sin abono; trial mini puede subir → aplica al fin del trial).
- **Wireup**: `STRIPE_SECRET_KEY` (`sk_live_`) + `STRIPE_WEBHOOK_SECRET`
  (`whsec_`) + `STRIPE_PRICE_{MINI,PRO,MAX}` en el `.env` del VPS. Precios que se
  cobran = `STRIPE_PRICE_*`; precios que se muestran = `PLAN_PRICE_*_EUR`
  (mantenerlos sincronizados a mano — drift caveat).
- **Webhook LIVE** registrado en `https://nokfi.app/api/webhooks/stripe` con **6
  eventos**: `checkout.session.completed`, `invoice.paid`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`, `charge.dispute.created`. Entrega OK a través de CF.
- **Verificado end-to-end**: pago real mini (trial 14d → 0€) creó la licencia
  `id=2` (`trial_ends_at = día+14`), reveal 200, login, Portal. API version fija
  `2024-04-10` (`config/stripe-version.js`).
- Tarjeta de test Stripe: `4242 4242 4242 4242` (OK), `4000 0000 0000 0341`
  (fallo de cobro al día 14).

## 5. Mailer (Resend, provider único)

`EMAIL_FROM=noreply@nokfi.app` (dominio `nokfi.app` verificado en Resend: DNS
records MX/TXT SPF/DKIM/DMARC en Namecheap). SendGrid retirado (rama + switch
`EMAIL_PROVIDER` eliminados; 0 menciones en la repo). Probe real
`sendLicenseKeyEmail → usuario` devolvió `{sent:true}`.

## 6. Seguridad

- Auditoría OWASP top 10 + ASVS: **14 hallazgos corregidos**. `npm audit` backend
  **0 vulnerabilidades**.
- Cabeceras servidas por Nginx (plantilla `deploy/nginx-nokfi.conf`): HSTS,
  CSP con `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy. `trust proxy:1` correcto con el chain
  CF→Nginx→Express.
- Edge: Cloudflare anti-DDoS + WAF (skip se limita al webhook de Stripe).
- `xlsx` (SheetJS): vulnerabilidad upstream high, sin parche; corre solo en el
  **navegador del usuario** (el backend nunca procesa Excel) → riesgo aceptado.
  Detalle en `frontend/README.md`.

## 7. Deudas abiertas (al 2026-08-16)

Todo lo crítico está resuelto. Restos **no bloqueantes / opcionales**:

| # | Deuda | Bloquea | Estado / acción |
|---|-------|---------|-----------------|
| A | Stripe LIVE — webhook + cobros reales | — | ✅ **RESUELTO** (pago real verificado end-to-end, 6 eventos, entrega por CF). |
| B | `STRIPE_PRICE_{MINI,PRO,MAX}` + 3 Products + Portal proration=None | — | ✅ **RESUELTO / DESPLEGADO** (Deuda B). |
| C | Dominio + Nginx + SSL | — | ✅ **RESUELTO** (HTTPS vivo, cert LE, Cloudflare Full strict). |
| H | Cuota diaria de IA vulnerable a overshoot por concurrencia (**TOCTOU**) | — | ✅ **RESUELTO (2026-08-17)** — cuota atómica vía tabla `ai_usage` (PK `license_id+day+slot`). `reserveAiSlot` inserta el slot ANTES del `await` a Gemini (INSERT atómico de mejor-sqlite3 → sin ventana TOCTOU); si la IA falla, `releaseAiSlot` lo libera y el fallo NO consume cuota. El `429` responde con mensaje específico. Detalle en `api.md` §2. |
| I | `create-checkout` validaba plan tarde (coerción a mini) | — | ✅ **RESUELTO** (`400 invalid_plan` antes de tocar Stripe). |
| K | 1er `invoice.paid` del trial huérfano (`processed:false`) | — | ✅ **RESUELTO** (no-op reconocido `INVOICE_PAID_TRIAL_OPEN_NOOP`). |
| ⟶ | Forwarding `info@/help@/soporte@nokfi.app` | — | ⏳ Cosmético, Namecheap forwarding gratis; el backend no lo usa. |
| ⟶ | ufw lock a IPs de CF | — | ⏳ Diferido (riesgo: CF cambia rangos; el rewrite anti-spoof ya cubre lo crítico). |

## 8. Cómo operar

### Deploy de código (flujo estándar)
1. Usuario commitea + `git push` (fuera de Claude Code).
2. Claude: `git pull --ff-only` en el VPS.
3. Si cambió el backend: `pm2 restart --update-env` (env del `.env` vivo).
4. Si cambió el frontend: rebuild local del bundle (Nginx sirve `frontend/dist`;
   el build en el VPS puede dar OOM → compilar en dev y rsync es el patrón usado).
5. Smoke: `/health` 200, `/api/payments/plans` 200.

> El éxito del webhook y los cobros dependen de NO romper: Bot Fight Mode OFF,
> WAF skip del webhook, real-IP conf, y los 6 eventos. No tocar eso sin riesgo.

## 9. Convenciones a recordar

- El backend es la **fuente de verdad** de la API — [`api.md`](api.md) antes de
  tocar el frontend.
- **Anti-drift de precios**: el frontend SIEMPRE pasa por `GET /api/payments/plans`.
- **Regla de contraste** (`proyecto.md` §19): variables CSS, no hex fijos.
- **No pegar secretos en el chat** (VPS_PASS, tokens, claves). El usuario los
  gestiona fuera de Claude Code.
- **`trialing` no es un `status` aparte**: una licencia en trial sigue siendo
  `active` con `trial_ends_at` futuro. El MRR la excluye por campos.
- El `CHECK(payment_provider IN (...))` se conserva como documentación histórica,
  no es deuda a limpiar.