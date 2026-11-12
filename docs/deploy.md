# Nokfi — Despliegue y operación en el VPS

> Última actualización: **2026-08-16**. Estado: **producción viva en HTTPS con
> Cloudflare Full strict y Stripe LIVE cobrando**.
>
> Documento operativo: topología, estado de despliegue, infraestructura (Nginx +
> Cloudflare), deudas abiertas y cómo continuar. Para el contrato Backend↔Frontend
> ver [`api.md`](api.md); para la visión de producto ver [`proyecto.md`](proyecto.md).

---

> **2026-10-22/23 — VPS nuevo.** El VPS anterior se perdió por
> no renovarlo. Recuperado en **FreakHosting BVPS-5** (Frankfurt, Ubuntu 24.04,
> 5 vCPU, 8 GB RAM, 200 GB, 8,99 €/mes, renovación automática por PayPal):
> **`<IP_DEL_VPS>`**. BD restaurada desde R2 (copia del 16-10 03:30, íntegra,
> sin pérdida de datos). Node 24 + PM2 7 + Nginx 1.24, ufw (SSH; 80/443 solo desde Cloudflare desde la S15b),
> fail2ban, 2 GB de swap, SSH solo por clave (`nokfi-deploy`, root y deploy).
> Sitio en `/etc/nginx/sites-available/nokfi` y real-IP en
> `/etc/nginx/conf.d/cloudflare-realip.conf`. Certificado LE nuevo (emitido con
> la nube gris unos minutos; renovación por `certbot.timer`). Token R2 limitado a
> la IP nueva. Cerebras quitado de `AI_PROVIDERS` (caducaba el 29-10).
> **Al renovar el VPS: fecha de vencimiento en el panel de FreakHosting.**

## 0. TL;DR (estado actual)

- **Producción HTTPS viva**: `https://nokfi.app/` (Nginx + Let's Encrypt, cert
  hasta **2027-01-21** (renovado; comprobado 2026-11-08) autorenova via `certbot.timer`).
- **Cloudflare (edge) EN PROD — Full strict (2026-08-08/10), completo y
  verificado**: CF es el edge de `nokfi.app` (origen `<IP_DEL_VPS>` oculto tras
  anycast `104.21.6.208`/`172.67.135.69`). real-IP chain, Bot Fight OFF, WAF skip
  webhook, caché por defecto de CF (sin Cache Rules), www→nokfi 301 en Nginx, renewal
  HTTP-01 a través de CF.
  Detalle en §3.
- **Stripe LIVE cobrando de verdad**: pago real verificado de punta a punta
  (licencia `id=2`, mini trial 14d → 0€ hoy, correo recibido, Portal abierto).
  Webhook LIVE con los **7 eventos** (desde la S15b) y entrega OK a través de CF. La cadena
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

## 1. Topología y convenciones (VPS `<IP_DEL_VPS>`, desde 2026-10-22)

> La IP real del VPS no se publica (el origen va oculto tras Cloudflare): en este
> documento aparece como `<IP_DEL_VPS>`. Está en el panel del proveedor y en las notas locales.

Cadena de tráfico: **Cliente → TLS → Cloudflare (edge, valida LE) → TLS → Nginx
(real-IP) → Express `:3001`**.

- **Paths**: app en `/home/deploy/nokfi/`. Backend (PM2 fork, cwd
  `.../backend`, `:3001`), frontend build en `.../frontend/dist` (servido por
  Nginx). `/etc/nginx/sites-available/nokfi` (sitio) +
  `/etc/nginx/conf.d/cloudflare-realip.conf` (real-IP). DB en `.../backend/db/nokfi.db`.
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

Backend PM2 `nokfi-backend` `:3001`. Smoke esperado: `/health` 200 (la raíz) y `/api/health` 200, `/api/payments/plans` 200 (5/20/50),
`/api/profile` 401 sin auth, `/api/analyses` 401 sin auth.

## 3. Cloudflare (edge) — Full strict

Edge live verificado (curl `--resolve` a la anycast de CF): apex `HTTP/2 200 /
server: cloudflare / cf-cache-status: DYNAMIC / cf-ray …`. www `301` (Redirect
Rule).

### Dashboard CF `nokfi.app` (Free): config esencial
- **SSL/TLS → Full (strict)** (no Flexible). Always-HTTPS ON.
- **DNS**: A `@`+`www` → `<IP_DEL_VPS>` **Proxied 🟠**. MX/TXT de Resend quedan
  **DNS-only 🔘** (mailer no se toca). Nameservers → Custom DNS =
  `terry.ns.cloudflare.com` + `tina.ns.cloudflare.com`.
- **🔴 Bot Fight Mode OFF** — el UA `Stripe/1.0` del webhook DEBE pasar
  (crear licencia). ON mataría los cobros reales.
- **WAF Custom rule** `Skip WAF — Stripe webhook` sobre `uri.path eq
  "/api/webhooks/stripe"` → skip (defensa futura; el `webhookLimiter` Express +
  firma HMAC siguen vigentes).
- **Cache Rules y Redirect Rules: NINGUNA** (comprobado en el panel y con cabeceras el
  2026-11-08; las 3 Cache Rules y la Redirect Rule que se crearon en agosto ya no están).
  Funciona con la caché por defecto de CF: `/assets/*`, `/screens/*` y `/fonts/*` salen
  `HIT` con el TTL del origen (1 año y 30 días); `/`, `/login`, `/app/*` y `/api/*` salen
  `DYNAMIC` (CF no cachea HTML ni `/api`). **Browser Cache TTL = «Respect Existing
  Headers»** (Caching › Configuration, desde el 2026-11-08): CF no pisa las cabeceras de
  Nginx, así que `sw.js` y `manifest.webmanifest` llegan con `no-cache` (CF revalida
  con el origen, `REVALIDATED`). Antes estaba en «4 hours» y le ponía `max-age=14400` a
  `sw.js`. Si se cambia la caché de algo, se cambia en Nginx, no en CF.
- **www → nokfi.app 301 lo hace Nginx** (`if ($host = www.nokfi.app)` en el server de
  443, ver `deploy/nginx-nokfi.conf`), no Cloudflare. El reto HTTP-01 de www entra por
  el puerto 80 y la renovación funciona (`certbot renew --dry-run` OK el 2026-11-08).

### Nginx real-IP (`deploy/nginx-cloudflare-realip.conf` → `/etc/nginx/conf.d/cloudflare-realip.conf`)
`ngx_http_realip_module`: `set_real_ip_from` (rango de CF: 15 v4 + 7 v6) +
`real_ip_header CF-Connecting-IP` + `real_ip_recursive on`. **Solo** reescribe si
la conexión entrante proviene de un rango CF → **anti-spoof**: un atacante que
conecte directo al VPS con su IP real no pasa el rewrite y `req.ip` es su IP
verdadera. Con `trust proxy:1` (`server.js:39`) el único proxy que Express ve es
Nginx → `req.ip` correcto, todos los rate-limiters auditan por visitante real. Fuente
de rangos: `https://www.cloudflare.com/ips/` (revisar en cada cambio).

### Cert LE
Cert Let's Encrypt (SAN `nokfi.app` + `www`) en `/etc/letsencrypt/live/nokfi.app/`,
caduca 2027-01-21 (comprobado 2026-11-08). `certbot.timer` autorenueva por CF (reto HTTP-01 por el puerto 80; CF
no cachea `/.well-known/`). Dry-run verificado (`Congratulations,
all simulated renewals succeeded`).

## 4. Stripe LIVE

- **Modelo**: 3 Products separados (Nokfi Mini/Pro/Max) con 1 Price recurrente
  mensual EUR cada uno.
- **Modelo de cobro (S15b)**: cualquier cambio de plan cobra hoy el precio
  completo del plan nuevo y empieza un mes nuevo (`POST /api/payments/stripe/change-plan`:
  `billing_cycle_anchor=now`, `proration_behavior=none`,
  `payment_behavior=error_if_incomplete`); cancelar = hasta fin del periodo
  pagado; una renovación rechazada para la suscripción y bloquea la cuenta hasta
  pagar un plan nuevo (`resume-checkout`); una tarjeta que ya tuvo trial no repite.
- **Customer Portal LIVE** (Dashboard › Configuración › Billing › Portal de
  clientes, o `POST /v1/billing_portal/configurations/<bpc_…>`): **desactivar
  «Cambiar de plan» (`features[subscription_update][enabled]=false`)** y
  **desactivar «Actualizar datos del cliente»
  (`features[customer_update][enabled]=false`)**: un email cambiado en el Portal
  no se refleja en la licencia ni en los correos de Nokfi. Dejar activos método de
  pago, historial de facturas y cancelar al final del periodo
  (`subscription_cancel` con `mode=at_period_end`).
  Con el cambio de plan activo y proration `None` se podía usar Max pagando Mini.
  Aplicado en el Portal de PRUEBA (2026-11-07/08) y en el **LIVE (2026-11-08)**.
- **Reintentos de Stripe** (Billing › Revenue recovery): da igual cuántos haya,
  al primer `invoice.payment_failed` de una renovación el backend cancela la
  suscripción y anula la factura.
- **Wireup**: `STRIPE_SECRET_KEY` (`sk_live_`) + `STRIPE_WEBHOOK_SECRET`
  (`whsec_`) + `STRIPE_PRICE_{MINI,PRO,MAX}` en el `.env` del VPS. Precios que se
  cobran = `STRIPE_PRICE_*`; precios que se muestran = `PLAN_PRICE_*_EUR`
  (mantenerlos sincronizados a mano — drift caveat).
- **Paquetes de créditos (S15b, U1)**: Product «Paquetes de créditos» con 3 Prices
  de pago único EUR (50 créditos = 5 €, 220 = 20 €, 550 = 50 €) y sus ids en
  `STRIPE_PRICE_PACK_50`, `STRIPE_PRICE_PACK_220`, `STRIPE_PRICE_PACK_550`. El
  importe que se muestra sale de `config/plans.js` (`CREDIT_PACKS`): si cambia en
  Stripe, cambiarlo también allí. Creados en LIVE el 2026-11-08; el webhook ya
  recibe `checkout.session.async_payment_succeeded` (pagos asíncronos de paquetes).
- **Webhook LIVE** registrado en `https://nokfi.app/api/webhooks/stripe` con **7
  eventos**: `checkout.session.completed`, `invoice.paid`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`, `charge.dispute.created` y
  `checkout.session.async_payment_succeeded` (paquetes de créditos, añadido en la S15b). Entrega OK a través de CF.
  Un evento que llega antes que su licencia recibe `503` (Stripe lo reintenta);
  en el panel de webhooks pueden verse algunos `503` sueltos en las altas: es normal.
- **Verificado end-to-end**: pago real mini (trial 14d → 0€) creó la licencia
  `id=2` (`trial_ends_at = día+14`), reveal 200, login, Portal. API version fija
  `2024-04-10` (`config/stripe-version.js`) **solo en las llamadas salientes**.
- **Versión de los eventos**: los webhooks llegan con la versión del endpoint
  (en prod `2026-06-24.dahlia`), no con la fijada. Desde basil Stripe movió
  `invoice.subscription`, `invoice.payment_intent` y `current_period_end`;
  `routes/webhooks.js` lee los dos formatos (arreglado en la S15: antes las
  renovaciones y los cobros fallidos se ignoraban). Si se cambia la versión del
  endpoint, añadir un e2e con el formato nuevo.
- Tarjeta de test Stripe: `4242 4242 4242 4242` (OK), `4000 0000 0000 0341`
  (se guarda pero falla al cobrar: renovación o cambio de plan rechazados).
- **Al borrar una cuenta** el backend cancela la suscripción y borra el cliente
  de Stripe (si Stripe falla, la cuenta no se borra y se puede reintentar).

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
- Log de peticiones (morgan, en el log de PM2 `nokfi-backend`): formato `combined`
  propio en el que el token de los enlaces de gestoría sale como `***`
  (`/api/shared/***` y `/compartido/***` en la URL y en el Referer). Un `Origin`
  ajeno da `403 origin_not_allowed` sin traza en el log, salvo en
  `/api/v1/openapi.json` y `/api/mcp`, abiertos a cualquier origen sin credenciales
  (Swagger/Postman web, MCP Inspector).
- `xlsx` (SheetJS): vulnerabilidad upstream high, sin parche; corre solo en el
  **navegador del usuario** (el backend nunca procesa Excel) → riesgo aceptado.
  Detalle en `frontend/README.md`.

### Endurecimiento del servidor (S15b, 2026-11-08)

Copias de cada archivo tocado en `/home/deploy/backups/s15b-2026-11-08/` (700/600).

- **Cortafuegos (`ufw`)**: entrada por defecto DROP; `22/tcp` abierto (y `OpenSSH`);
  **80/443 solo desde los rangos de Cloudflare** (15 v4 + 7 v6, reglas con comentario
  `cloudflare`). Acceso directo a `https://<IP_DEL_VPS>/` → se agota el tiempo. Los rangos
  salen de `https://www.cloudflare.com/ips-v4` e `/ips-v6` (los mismos que el real-IP de
  Nginx): si Cloudflare los cambia, añadir los nuevos con
  `ufw allow proto tcp from <rango> to any port 80,443 comment cloudflare` (y en
  `cloudflare-realip.conf`) y borrar los viejos.
- **Nginx** (`deploy/nginx-nokfi.conf` = `/etc/nginx/sites-available/nokfi`, copia exacta):
  - `server` `default_server` en 80 y 443 (`ssl_reject_handshake on`, `return 444`):
    un Host desconocido o una conexión sin SNI se cierra.
  - HSTS (`max-age=31536000; includeSubDomains`) en la web.
  - En `location /api/`: `proxy_hide_header` de HSTS, X-Frame-Options,
    X-Content-Type-Options y Referrer-Policy de helmet, y Nginx pone una sola de cada
    (`Referrer-Policy: no-referrer` en la API) + Permissions-Policy, **sin la CSP de la
    web**. Las `Access-Control-*` de Express no se tocan (CORS abierto en
    `/api/v1/openapi.json` y `/api/mcp`). Sin `proxy_ignore_client_abort` (la cancelación
    de la IA necesita que el corte del navegador llegue al backend).
  - Log de acceso con formato `nokfi_safe`: el token de `/compartido/<token>` y
    `/api/shared/<token>` sale como `***` en la petición y en el Referer.
  - `/screens/` y `/fonts/` con caché de 30 días (`Cache-Control: max-age=2592000`);
    `/assets/` sigue en 1 año.
  - `/etc/nginx/nginx.conf`: `ssl_protocols TLSv1.2 TLSv1.3` y `server_tokens off` a nivel
    `http` (vale también para vhosts nuevos).
- **Permisos**: `backend/` y `backend/db/` 750; `backend/db/backups/` 700 con archivos 600
  (`umask 077` en el cron y en `backup-db.sh`). Nginx (www-data) solo lee
  `frontend/dist`. `~/.pm2` y `~/.pm2/logs` 700, logs 600.
- **Logs de PM2**: módulo `pm2-logrotate` (usuario deploy): rota a diario o al pasar de
  10 MB, guarda 14 y comprime (`pm2 conf pm2-logrotate`).
- **SSH**: `/etc/ssh/sshd_config.d/99-nokfi.conf` añade `X11Forwarding no`; `sshd -T`
  confirma `passwordauthentication no`, `kbdinteractiveauthentication no` y
  `permitrootlogin without-password` (solo clave).
- **fail2ban** (`/etc/fail2ban/jail.d/nokfi.local`): `bantime 1h`, `findtime 10m`,
  `maxretry 4` y jail `recidive` (reincidentes: 1 semana).
- **Actualizaciones**: `unattended-upgrades` activo (orígenes `noble-security`).
- **Backend solo en `127.0.0.1:3001`**: `HOST=127.0.0.1` en el `.env` del VPS
  (`server.js` escucha en `HOST`; sin `HOST`, en todas las interfaces, como en
  desarrollo). Además `ufw` no abre el 3001.

### Endurecimientos de seguridad (2026-09-14)

Aplicados y verificados (**107/107 e2e PASS**), detalle en `proyecto.md` §7 y §21:

- **Tokens hasheados en reposo** (`database.js`): sesiones y reset-tokens se
  persisten como SHA-256, no en texto plano. Migración `hashTokensAtRest()`
  idempotente y NO destructiva (no revoca nada); en el primer arranque en prod
  tras el deploy, hashearà las filas planas existentes — las sesiones activas
  siguen funcionando (el cliente manda el token crudo, que se hashea al lookup).
- **scrypt a N=2^16** (`password.js`): hash de contraseña endurecido. ⚠️ Requiere
  `maxmem` a `scryptSync` (Node v24/OpenSSL 3 necesita >64MB; tope 256MB). Hashes
  viejos siguen verificando. Latencia por hash ~0.3-0.6s (aceptable en auth de
  bajo volumen).
- **Rate-limiter dedicado a `create-checkout`** (`payments.js`): 10 req/min por IP.

## 7. Deudas abiertas (al 2026-08-16)

Todo lo crítico está resuelto. Restos **no bloqueantes / opcionales**:

| # | Deuda | Bloquea | Estado / acción |
|---|-------|---------|-----------------|
| A | Stripe LIVE — webhook + cobros reales | — | ✅ **RESUELTO** (pago real verificado end-to-end, 7 eventos desde la S15b, entrega por CF). |
| B | `STRIPE_PRICE_{MINI,PRO,MAX}` + 3 Products + Portal proration=None | — | ✅ **RESUELTO / DESPLEGADO** (Deuda B). S15b: el cambio de plan sale del Portal (ver §4). |
| C | Dominio + Nginx + SSL | — | ✅ **RESUELTO** (HTTPS vivo, cert LE, Cloudflare Full strict). |
| H | Cuota diaria de IA vulnerable a overshoot por concurrencia (**TOCTOU**) | — | ✅ **RESUELTO (2026-08-17)** — cuota atómica vía tabla `ai_usage` (PK `license_id+day+slot`). `reserveAiSlot` inserta el slot ANTES del `await` a Gemini (INSERT atómico de mejor-sqlite3 → sin ventana TOCTOU); si la IA falla, `releaseAiSlot` lo libera y el fallo NO consume cuota. El `429` responde con mensaje específico. Detalle en `api.md` §2. |
| I | `create-checkout` validaba plan tarde (coerción a mini) | — | ✅ **RESUELTO** (`400 invalid_plan` antes de tocar Stripe). |
| K | 1er `invoice.paid` del trial huérfano (`processed:false`) | — | ✅ **RESUELTO** (no-op reconocido `INVOICE_PAID_TRIAL_OPEN_NOOP`). |
| ⟶ | Forwarding `info@/help@/soporte@nokfi.app` | — | ⏳ Cosmético, Namecheap forwarding gratis; el backend no lo usa. |
| ⟶ | ufw lock a IPs de CF | — | ✅ **RESUELTO (S15b, 2026-11-08)**: 80/443 solo desde Cloudflare (ver §6). |

## 8. Cómo operar

### Deploy de código (flujo estándar)
1. Usuario commitea + `git push` (fuera de Claude Code).
2. Claude: `git pull --ff-only` en el VPS.
3. Si cambió el backend: `pm2 restart --update-env` (env del `.env` vivo).
4. Si cambió el frontend: rebuild local del bundle con `VITE_API_URL=/api npm run build`
   (Nginx sirve `frontend/dist`; nunca se compila en el VPS) y `rsync` del `dist`. Sin
   `VITE_API_URL` el build avisa: el bundle llamaría a `http://localhost:3001/api`.
5. Smoke: `/health` 200, `/api/payments/plans` 200.
6. Si cambiaron páginas públicas: `cd frontend && npm run indexnow` (avisa a Bing por
   IndexNow; con rutas como argumentos, solo esas). Comprobar que `/llms.txt` responde
   texto (`# Nokfi…`) y no la SPA.

> El éxito del webhook y los cobros dependen de NO romper: Bot Fight Mode OFF,
> WAF skip del webhook, real-IP conf, y los 7 eventos. No tocar eso sin riesgo.

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
## 10. Backups de la base de datos (2026-09-19)

Script `backend/scripts/backup-db.sh` (en el repo): copia consistente en caliente
vía `sqlite3 .backup` (seguro con WAL), verificación `PRAGMA integrity_check`
(borra la copia si falla, exit 1) y retención de 14 días. Destino:
`backend/db/backups/` (git-ignored).

Para activarlo en el VPS, añadir al cron de `deploy` (`crontab -e`):

```cron
30 3 * * * umask 077; /home/deploy/nokfi/backend/scripts/backup-db.sh >> /home/deploy/nokfi/backend/db/backups/backup.log 2>&1
```

Notas:
- El script acepta `DB_PATH` como override; por defecto resuelve
  `backend/db/nokfi.db` relativo a su propia ubicación.
- Requiere el binario `sqlite3` en el VPS (`sudo apt install sqlite3` si falta).
- Las copias locales viven en el mismo disco (corrupción o borrado accidental);
  la copia **fuera del VPS** es la de R2 (abajo).

### Copia fuera del VPS: Cloudflare R2 (activa desde la S14, 2026-10-15)
Tras cada copia local verificada, `backup-db.sh` llama a
`scripts/offsite-backup.js` si el `.env` tiene `R2_BUCKET`. La copia se comprime
(gzip) y se **cifra** (AES-256-GCM con `BACKUP_ENCRYPTION_KEY`) antes de salir del
servidor, y se sube al bucket R2 `nokfi-backups` (jurisdicción UE; una regla de
ciclo de vida la borra a los 30 días). El token de R2 solo da acceso a ese bucket
y solo desde la IP del VPS (al cambiar de VPS hay que actualizarlo; ver la nota
del 2026-10-22 arriba). Si la subida falla, la copia local sigue valiendo; cada
subida buena escribe `db/backups/offsite.ok` y el informe diario avisa si la
última tiene más de 26 h.
- Variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`, `R2_JURISDICTION=eu` y `BACKUP_ENCRYPTION_KEY` (ver
  `backend/.env.example`). **La clave de cifrado se guarda también fuera del VPS**
  (gestor de contraseñas): sin ella una copia de R2 no se puede restaurar.
- Restaurar (desde `backend/`, con PM2 parado si se sustituye la BD viva):
  `node scripts/offsite-backup.js --list` y
  `node scripts/offsite-backup.js --restore latest /ruta/salida.db`
  (o `--decrypt copia.db.gz.enc salida.db` para un archivo ya descargado).
  Así se recuperó el VPS nuevo el 2026-10-22/23.

## 11. Monitor externo (pendiente, requiere cuenta del usuario)

UptimeRobot (free) o similar apuntando a `https://nokfi.app/health` cada 5 min,
con alerta por email. No se puede crear desde Claude Code (necesita cuenta).

## 12. Notas post-auditoría before-deploy (2026-09-19)

- **Dependencias del backend en el VPS (2026-10-24):** solo si cambia
  `package-lock.json`, y siempre con
  `npm ci --omit=dev --ignore-scripts`. El VPS no tiene compilador y
  `better-sqlite3` ya trae el binario de Linux en `prebuilds/`. Sin
  `--ignore-scripts`, npm intenta compilarlo con `node-gyp`, falla y deja
  `node_modules` vacío, así que el backend no arranca. Ningún otro paquete tiene script de instalación.

- Tras el próximo `git pull` en el VPS, ejecutar `npm audit fix` en
  `backend/` (el `package-lock.json` actualizado ya va en el repo; el fix
  asegura node_modules alineado). Frontend: **no** aplicar `npm audit fix
  --force` — los fixes restantes son majors breaking (react-router 7, vite 8,
  jspdf 4); ver `proyecto.md` §22.
- Redirect `www.nokfi.app → nokfi.app` (301): **hecho**. Lo hace la Redirect
  Rule de Cloudflare (§3, con la excepción del reto ACME) y, por si una petición
  llega sin pasar por ella, también Nginx (`if ($host = www.nokfi.app) { return
  301 … }` en `deploy/nginx-nokfi.conf`; se perdió con el VPS viejo y se repuso
  en la plantilla, commit `04415bd`).
- `robots.txt`, `og-image-square.png` (imagen al compartir, 512×512 con
  `twitter:card=summary`, S15b; también es la `image` del JSON-LD de las guías) y
  `og-image.png` (desde 2026-11-10 es una copia de la cuadrada: la URL vieja sigue
  publicada para los resultados que Google ya tenía guardados) se sirven desde `frontend/dist` (los copia el build de Vite desde
  `public/`); sin config extra de Nginx. Las redes cachean la vista previa unos
  días: tras un cambio, forzarla con sus depuradores (Facebook Sharing
  Debugger, LinkedIn Post Inspector).

## 13. IA local (último respaldo, desde 2026-10-24)

Cadena de IA: **Groq → Cloudflare Workers AI → IA local** (`AI_PROVIDERS` y
`CHAT_PROVIDERS` = `groq,cloudflare,local`). Si los dos servicios externos fallan,
el análisis, el chat y los emails de reclamación los hace un modelo en el propio
VPS: los datos no salen del servidor. Es lento (CPU) y más sencillo, así que es
un salvavidas, no el motor principal.

- **Servicio**: `nokfi-ia` (systemd, `deploy/nokfi-ia.service`), usuario `llm`,
  solo `127.0.0.1:8081`, prioridad baja (Nice 15, CPUWeight 20), tope de RAM 6 GB,
  sin acceso a `/home`. `systemctl status nokfi-ia`, `journalctl -u nokfi-ia -n 50`,
  `curl -s 127.0.0.1:8081/health`.
- **Motor**: llama.cpp, binario oficial de su release de GitHub en
  `/opt/llama.cpp/<build>` con el enlace `/opt/llama.cpp/current` (instalado
  `b11852`). Necesita `libgomp1`. Para actualizar: descomprimir otra release al
  lado, mover el enlace, `systemctl restart nokfi-ia` y probar.
- **Modelo**: Gemma 4 E2B instruct, QAT q4_0 oficial de Google (Apache 2.0) +
  `mmproj` para leer facturas en foto, en `/opt/nokfi-ia/models`. Elegido midiendo
  con `backend/scripts/ia-local-prueba.js` los prompts reales de Nokfi (ver la
  cabecera de `deploy/nokfi-ia.service`). En esta CPU (EPYC 7551P, 5 núcleos, AVX2)
  lee ~18 tokens/s y escribe ~6: diagnóstico ≈ 4 min, Excel ≈ 6 min, factura ≈ 1 min,
  chat ≈ 1-2 min.
- **Backend** (`.env`): `LOCAL_AI_URL=http://127.0.0.1:8081`,
  `LOCAL_AI_MODEL=gemma-4-e2b`; opcionales `LOCAL_AI_MAX_QUEUE` (3),
  `LOCAL_AI_TIMEOUT_MS` (12 min), `LOCAL_AI_CHAT_TIMEOUT_MS` (5 min),
  `LOCAL_AI_MAX_PROMPT_CHARS` (28000: más grande, no se le manda).
- **Cómo se protege la calidad**: JSON forzado por gramática (`json_schema`), el
  idioma se repite al final del mensaje, las cifras que no estén en los datos se
  quitan del informe (`guardFigures`) y el informe lleva `ai_backup: true`, que la
  pantalla muestra como aviso para contrastar las cifras.
- **Sin cortes en la web**: las respuestas que tardan > 25 s se aplazan
  (`202 { pending }` + `GET /api/pending/:id`, ver `docs/api.md`), porque
  Cloudflare corta a los 100 s y Nginx a los 60 s. Lo que el navegador ya no
  quiere (cerrar, otro tono) se cancela en el servidor y deja libre la cola
  (`DELETE /api/pending/:id` o el corte de la conexión; Nginx lo propaga con el
  `proxy_ignore_client_abort off` por defecto).
- **Vigilancia**: `/api/admin/ai-status` (incluye `local` y su cola) y el informe
  diario (línea «IA local» y aviso si no responde).
- **Probar a mano** (en el VPS, `backend/`):
  `node scripts/ia-local-prueba.js --app --url http://127.0.0.1:8081 --label prueba --only facturas-texto`
  (deja las salidas en `~/backups/ia-prueba`).
