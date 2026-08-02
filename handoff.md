# Nokfi — Handoff / Estado de la última sesión

> Última actualización: **2026-08-01**.
> Documento de "por dónde retomo el proyecto". Si solo lees un archivo, que sea este;
> luego `nokfi_contexto_claude_code.md` (panorama) y `nokfi_api_contract.md` (contrato).

---

## 0. TL;DR

- **Backend:** completo, **93/93 e2e PASS**, desplegado en el VPS (`191.44.112.86`,
  HEAD `5810ae9`) y funcional. **Stripe LIVE** — `STRIPE_SECRET_KEY` (`sk_live_`)
  + `STRIPE_WEBHOOK_SECRET` (`whsec_`) pegadas y verificadas en el `.env` del VPS
  (GET `/v1/balance` → 200, sin cobros). ⚠️ **El webhook LIVE aún NO entrega**: Stripe
  exige HTTPS y no hay dominio+SSL → un cobro real hoy **no** generaría licencia
  (el handler `webhooks.js:193 createLicense` solo se dispara por webhook). **Dominio
  + Nginx + SSL = prerrequisito** (ver §5, bloqueador #60).
- **Modelo de billing (Fase 3):** suscripción mensual Stripe-only (mini 5 € /
  pro 20 € / max 50 €), cuotas de IA 10/50/130 por licencia/día, **trial de 14 días
  solo en mini** con tarjeta. Precios env-driven (`PLAN_PRICE_*_EUR`).
- **Auth:** email + clave + **contraseña** (scrypt). El device-fingerprint se eliminó
  en `f9385af`; el anti-sharing es la cuota diaria de IA.
- **Frontend:** compila y el bundle está limpio (same-origin `/api`, sin IP
  hardcodeada). **No servido por el VPS** (falta Nginx). **Landing pública ya
  implementada + commiteada + desplegada en el disco del VPS** (`5810ae9`):
  `pages/Landing.jsx` en ruta `/` (Hero / Info / Planes / CTA); entra en producción
  con el build del frontend (`VITE_API_URL=/api`) en la tarea dominio+SSL.
- **Mailer:** **Resend-only** (SendGrid retirado: rama + switch `EMAIL_PROVIDER`
  eliminados). Commiteado `b2ec073`, desplegado; `EMAIL_PROVIDER=resend` borrado del
  `.env` del VPS. 0 menciones SendGrid en la repo.
- **Proveedores retirados:** PayPal / Revolut / Coinbase → `404` (Stripe-only).
- **Deudas resueltas:** F + G-b (historial) + G-a (`/api/profile`) → commiteadas,
  pusheadas y desplegadas (VPS `5810ae9`). Plus: SendGrid retirado, landing pública,
  Nginx+CSP single-origin (config), subdominio `app.` purgado del código y docs.
- **Sin commitear (esta sesión):** nada pendiente en el árbol de trabajo salvo este
  mismo update de docs; los dos commits de infra (`d07996d` Nginx+CSP, `ba4f4d2`
  cleanup subdominio) están listos para `push` del usuario (2 ahead de origin).
- **VPS deploy autónomo por llave SSH** desde el 2026-07-31 (ver §6).
- **Documentación (`*.md`):** en la raíz del repo y al día.

---

## 1. Qué se hizo en las últimas sesiones (reciente → antiguo)

0. **Landing pública en `/` (home de la SPA)** — commiteada `5810ae9` + desplegada
   (VPS HEAD `5810ae9`; LH en el disco pero **aún no servida** — falta Nginx + el
   build con `VITE_API_URL=/api` en la tarea dominio+SSL). `pages/Landing.jsx`
   (ruta `/`, antes redirigía a `/login`): top bar (logo + selector ES/EN +
   toggle tema + link "Iniciar sesión"), Hero, Info de empresa / qué es Nokfi,
   Planes y precios, CTA final, footer. Extracción reutilizable:
   `components/PlanCards.jsx` + `hooks/usePlans.js` (GET `/api/payments/plans`,
   anti-drift) consumidos por `Landing` Y `Pricing` (rewired). Namespace i18n
   `landing.*` (es+en). Gating SIN tocar: app sigue en `/app/*` bajo `ProtectedRoute`
   (solo licencia activa/trial). `npm run build` verde, 0 precios hardcodeados en
   el bundle.
0. **G-a `/api/profile` (perfil de empresa del onboarding)** — DESPLEGADO en
   `ce00f9d` (VPS verificado: 401 sin auth, tabla `company_profiles` autocreada).
   Tabla `company_profiles` + `routes/profile.js` (GET vacío-inicial / PUT
   enum-validado y merge-parcial) + `useCompanyProfile` como puente API (PUT
   debounced acumulando partials, `loading` para evitar flash de modal). Refactor:
   `sanitizeFreeText` → `utils/sanitize.js`. e2e **93/93** (17 nuevos). Ver §4/§3.
1. **G-b historial + F comentario (commiteado `8376fcc`, desplegado)** — VPS en
   ese HEAD; tabla `analyses` autocreada en boot, `/api/analyses` vivo (401 sin
   auth). Revisión pre-Stripe aplicó 3 fixes (locale fecha, índice redundante,
   i18n muertas) y documentó la deuda H (cuota IA TOCTOU).
2. **Limpieza de proveedores muertos (Stripe-only)** — `bbf10cb`.
   Quitó PayPal/Coinbase/Revolut de `routes/payments.js` (3 endpoints → eliminados),
   `routes/webhooks.js` (handlers + verify helpers), borró `utils/paypalAuth.js`,
   limpió `server.js` (solo `express.raw()` para stripe), recortó `.env.example`
   (fuera los bloques PAYPAL/REVOLUT/COINBASE), ajustó `e2e.test.js` (3 asserts
   `410 → 404`). **DB CHECK constraints (`payment_provider IN (...)`) KEPT** —
   documentan el universo histórico, 0 licencias reales en el VPS, nada que ganar
   reconstruyendo la tabla. Desplegado y verificado verde (health 200, /plans OK,
   3 rutas muertas → 404, webhook invalid sig → 400).
2. **Precios en `.env` + endpoint `/plans` (anti-drift)** — `d5eebdc`.
   `config/plans.js` lee `PLAN_PRICE_*_EUR`; nuevo `GET /api/payments/plans` (público)
   que `Pricing.jsx` fetcha en runtime (nunca hardcodear precios). `.env` del VPS
   recibió las 3 líneas (5/20/50).
3. **Repricing + trial de 14 días** — `08db2db`.
   mini 5 €/cuota 10/trial, pro 20/50, max 50/130. Migración `trial_ends_at`.
   Discriminador de MRR: `billing_model='subscription' AND status='active' AND
   trial_ends_at IS NULL` (trial excluido de MRR). Bug cazado: el auto-clear de
   `trial_ends_at` no funcionaba pasando `isoFromUnix(sub.trial_end)` (→ undefined);
   fixed a `sub.trial_end ? isoFromUnix(sub.trial_end) : null`.
4. **Migración a suscripción mensual (Fase 3)** — `2bb4b40`.
   Pago único lifetime (€150) → suscripción. Campos `billing_model`,
   `stripe_customer_id`, `stripe_subscription_id`, `current_period_ends_at`,
   `cancel_at_period_end`. Customer Portal para cancel/upgrade.
5. **Auth de device-fingerprint a contraseña + `/reveal`** — `f9385af`.
   DROP de `device_fingerprint`/`last_device_reset`/`sessions.fingerprint`; hash scrypt.
6. **Gemini `gemini-2.5-flash` (retirado por Google) → `gemini-flash-latest`** — `c674133`.

---

## 2. Estado de despliegue (VPS `191.44.112.86`)

- El **VPS está en `5810ae9`** (landing + SendGrid retirado + G-a + G-b + F). El
  local lleva 2 commits **más** (`d07996d` Nginx+CSP, `ba4f4d2` cleanup subdominio)
  ahead de `origin/main` a la espera del `git push` del usuario; tras el push,
  FF-pull al VPS (son docs+config que tokenless del backend, no exigen restart).
- Backend PM2 `nokfi-backend` (fork, cwd `nokfi-fase3/backend`), `:3001`. Resurrect
  vía systemd `pm2-deploy.service`. Verificado: `pm2` online, `/health` 200,
  `/api/payments/plans` 200, `/api/profile` 401 sin auth, `/api/analyses` 401.
- DB `./db/nokfi.db` vacía (staging: 0 licencias). Migraciones Fase 2 + Fase 3
  (`trial_ends_at` = columna 19) corrieron schema-only en primer boot. Las tablas
  `analyses` y `company_profiles` se **autocrea**n en boot (`CREATE TABLE IF NOT
  EXISTS`, sin migración).
- `/api/payments/plans` vivo: mini 5€·10·trial / pro 20€·50 / max 50€·130.
- **Stripe LIVE**: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` presentes y
  verificados (GET `/v1/balance` → 200). **Sin embargo el webhook LIVE no entrega**
  — falta HTTPS (dominio+SSL), prerrequisito de la deuda C/#60. 0 suscripciones
  hoy → el handler `createLicense` del webhook nunca se ha disparado en real.
- **No hay frontend ni landing SERVIDOS** (Nginx pendiente de instalar — paso
  `sudo` del usuario). **No hay dominio ni SSL.** En el disco del VPS sí están:
  el backend `5810ae9` Y un `frontend/dist` ya construido (bundle `/api`, sin IP,
  aunque su `index.html` aún lleva la CSP vieja — se regenerará al rebuild tras el
  pull de `d07996d`). El render público real entra con Nginx + build `VITE_API_URL=/api`.
- **Mailer Resend-only** en el VPS: `mailer.js` 0 menciones SendGrid;
  `EMAIL_PROVIDER` borrada del `.env` (copias `.env.bak.*`).
- 10 vars muertas limpiadas del `.env` del VPS (2026-08-01). Nginx no instalado;
  80/443 libres; `ufw` presente.

> Topología detallada (paths, resurrect, gotcha de `DB_PATH` relativa, rollback
> artifacts ya borrados): ver memoria `vps-deploy-topology`. Gaps de config del VPS:
> ver memoria `vps-config-gaps`. **Deploy autónomo por llave SSH**: ver memoria
> `vps-deploy-ssh-key` (Claude deploya solo; el archivo de credenciales se borró).

---

## 3. Estado de git

- **`origin/main` y el VPS están en `5810ae9`** (landing pública + SendGrid retirado
  + G-a `/api/profile` + G-b historial + F comentario) — commiteado, pusheado y
  desplegado (VPS verificado: HEAD `5810ae9`, `/health` 200, `/api/profile` 401 sin
  auth, `EMAIL_PROVIDER` 0 líneas en `.env`, `mailer.js` 0 SendGrid).
- **2 commits AHEAD de origin (esta sesión de continuación), listos para `push`
  del usuario:**
  - **`d07996d` — `feat(deploy): Nginx + CSP single-origin para dominio nokfi.app`**
    (la plantilla Nginx real: `deploy/nginx-nokfi.conf`; `frontend/index.html` CSP
    → `'self' + http://localhost:3001`; `frontend/.env.example` documenta `/api`).
  - **`ba4f4d2` — `chore(deploy): limpiar restos del subdominio app. → dominio
    único nokfi.app`** (`.env.example` URL block + webhook URL → `nokfi.app`;
    `mailer.js` fallback `APP_URL`; `server.js` comentario helmet).
  - Tras el push: FF-pull al VPS + **rebuild del frontend** (`cd frontend &&
    VITE_API_URL=/api npm run build`) para regenerar `dist/index.html` con la CSP
    nueva. No exige `pm2 restart` (el backend no cambia). Funcionalidad desbloqueada
    en cuanto el usuario instale Nginx + SSL (deuda C → ver §5).
- **Lo ya desplegado y verde (VPS `5810ae9`, smoke OK):**
  - Landing pública `5810ae9` (en disco; render real abre tras Nginx).
  - Mailer Resend-only `b2ec073` (`EMAIL_PROVIDER` borrado del `.env`;
    0 SendGrid en la repo).
  - G-a `/api/profile`, G-b `/api/analyses`, F (comentario de cuota).
- **Ya commiteada en sesiones previas (pushed+deployed):** repricing+trial
  `08db2db`, precios-env+`/plans` `d5eebdc`, migración suscripción `2bb4b40`,
  auth contraseña `f9385af`, Gemini latest `c674133`, limpieza proveedores `bbf10cb`.

---

## 4. Deudas abiertas (no código a menos que se indique)

| # | Deuda | Bloquea | Acción |
|---|-------|--------|--------|
| A | **Stripe LIVE: keys pegadas, webhook HTTPS pendiente** (`.env`) | webhook LIVE entrega (crea licencia tras cobro real); dry-run del checkout | ✅ `STRIPE_SECRET_KEY` (`sk_live_`) + `STRIPE_WEBHOOK_SECRET` (`whsec_`) **ya en el VPS** y verificados (GET `/v1/balance` → 200). ⚠️ **Bloqueado por C**: Stripe OPEN LIVE exige HTTPS → sin dominio+SSL el webhook no entrega y un cobro real no crea licencia. Tras SSL: registrar endpoint `https://nokfi.app/api/webhooks/stripe` (eventos: checkout.session.completed, invoice.paid, customer.subscription.updated/deleted, invoice.payment_failed, charge.dispute.created) y copiar su `whsec_` LIVE. |
| B | **`STRIPE_PRICE_{MINI,PRO,MAX}` ausentes** | inferencia de plan tras upgrade por Customer-Portal | Crear los 3 recurring-Price en Stripe y setearlos. Sin impacto hoy (0 suscripciones). Cae a `subscription.metadata.plan`. |
| C | **Dominio + Nginx + SSL pendientes (frontend no servido)** | acceso por navegador, lanzamiento, **desbloquea Stripe LIVE (A)** | Plantilla Nginx real ya en el repo: `deploy/nginx-nokfi.conf` (`d07996d`), dominio único `nokfi.app`. Pasos `sudo` del usuario (comprar dominio + 1 A-record + `apt install nginx certbot` + `ufw 'Nginx Full'` + `certbot --nginx -d nokfi.app --redirect`). Tras SSL, Claude (sin sudo) hace build `VITE_API_URL=/api` en el VPS + cutover `.env` (`ALLOWED_ORIGINS`/`APP_PUBLIC_URL`/`LANDING_PUBLIC_URL` → `https://nokfi.app`) + `pm2 restart --update-env`. |
| D | ✅ **RESUELTO** — CSP del `index.html` con la IP del VPS hardcodeada | — | `connect-src` → `'self' + http://localhost:3001` (same-origin en prod vía Nginx `/api`; `localhost` solo dev). IP del VPS y `generativelanguage.googleapis.com` fuera (el frontend nunca llama a Gemini directo). Commit `d07996d`. La CSP HTTP real con `frame-ancestors 'none'` la pone Nginx (ver `deploy/nginx-nokfi.conf`). |
| E | **Gemini 503 transitorio** | nada (se autocale) | Mapea `non-2xx/non-429 → 502`. Si persiste → cuota/disponibilidad de Google, no bug. `GEMINI_API_KEY` válida (53 chars). |
| F | ✅ **RESUELTO** — `routes/proxy.js` comentario stale | — | Decía "mini 30/pro 80/max 200"; corregido a `10/50/130` (lo real vía `aiQuotaForPlan`). |
| G-a | ✅ **RESUELTO** — `/api/profile` (perfil de empresa del onboarding) | — | Tabla `company_profiles` (1 fila/licencia, FK CASCADE, PK `license_id` UNIQUE) + `getCompanyProfile`/`upsertCompanyProfile` (merge parcial en el DB layer, UPSERT `ON CONFLICT`). Rutas `routes/profile.js`: `GET /api/profile` (200, vacío si no existe — no 404) + `PUT /api/profile` (enum-validado contra los valores del `OnboardingModal.jsx`, `companyName` saneado vía `sanitizeFreeText`, scoping por `req.license.id`). Frontend: `useCompanyProfile.js` ahora es puente API (load async + `loading`, PUT debounced 600 ms **acumulando** partials para no perder edits de campos distintos); `profileApi` en `api.js`; `DashboardLayout`/`Home`/`Configuracion` consumen `loading` (sin flash del modal/tarjeta ni keystroke-loss). Refactor: `sanitizeFreeText` extraído a `utils/sanitize.js` (3º uso — auth/admin/profile). e2e **93/93** (17 tests nuevos: scoping 2 licencias, merge parcial, filtro enum, saneado, guards 400). |
| G-b | ✅ **RESUELTO** — tabla `analyses` + `/api/analyses` | — | Historial de análisis persistido: captura en `routes/proxy.js` (best-effort, no bloquea), tabla `analyses` (autocreada por `CREATE TABLE IF NOT EXISTS`), `GET /api/analyses` (lista ligera) + `GET /api/analyses/:id` (scoped por licencia → 404 ajeno). Frontend: `HistoryBrowser.jsx` compartido por `Historial`/`Informes` (lista + detalle + re-export PDF), `sanitizeAiHtml` obligatorio. e2e **76/76** (incluye path real con stub de Gemini). |
| H | **Cuota diaria de IA vulnerable a overshoot por concurrencia** (TOCTOU) | nada en staging; allows scripted abuse to exceed the per-license daily cap | `countAiAnalysesToday` se lee en `routes/proxy.js` (línea ~65) pero solo se incrementa vía `audit('AI_ANALYSIS_GENERATED')` *después* del `await fetch` a Gemini → el `await` cede el event loop y N requests concurrentes de una misma licencia pasan el check leyendo el mismo conteo (todos <límite) antes de que se escriba el audit. Preexistente (no introducido por G-b); el backstop es el cap global de Gemini. Fix sería una reserva atómica (p.ej. tabla `ai_usage_daily` con `UNIQUE(license_id, day, slot)` o un contador transaccional) — cambio aparte con sus propios tests. |

`e2e.test.js` refleja lo correcto (10/50/130, `/plans`, MRR con trial excluido, `/api/analyses` + scoping), ver §2.

---

## 5. Cómo continuar (sugerido)

1. **Push de los 2 commits de infra** (`d07996d` Nginx+CSP, `ba4f4d2` cleanup
   subdominio) — el usuario hace `git push` fuera de Claude Code. Deploy autónomo
   (llave SSH): `git pull --ff-only` al VPS + **rebuild del frontend**
   (`cd frontend && VITE_API_URL=/api npm run build`) para regenerar `dist/index.html`
   con la CSP nueva. **No** exige `pm2 restart` (el backend no cambia en estos 2
   commits). Smoke `/health` 200 + `/plans` 200. *(El refactor Resend-only + landing
   ya están commiteados y desplegados en `5810ae9` — hechos.)*
2. **Dominio + Nginx + SSL** (deudas C, D) — **prerrequisito de Stripe LIVE**: el
   webhook que crea la licencia (`webhooks.js:193`) requiere HTTPS, y hoy solo hay
   IP+HTTP `:3001` → un cobro real no generaría licencia. **Dominio único
   `nokfi.app`** (serves `dist/` + proxea `/api/` → `:3001`, mismo origen), Certbot,
   cabeceras de seguridad (#14), CSP same-origin (#8). **Plantilla real ya en el
   repo**: `deploy/nginx-nokfi.conf` (commit `d07996d`). Build frontend con
   `VITE_API_URL=/api`. División: **Claude (sin sudo)** ya commiteó nginx.conf + CSP
   + cleanup subdominio (`d07996d` + `ba4f4d2`); hará el build del frontend en el VPS
   y stageará el cutover del `.env` (`ALLOWED_ORIGINS`,
   `APP_PUBLIC_URL`/`LANDING_PUBLIC_URL` → `https://nokfi.app`, `pm2 restart
   --update-env`). **Usuario (sudo+dinero+Stripe)**: comprar dominio + 1 registro A
   `nokfi.app`→IP + `apt install nginx certbot` + `ufw 'Nginx Full'` +
   `certbot --nginx -d nokfi.app --redirect` (plantilla + pasos en
   `deploy/nginx-nokfi.conf` y `nokfi_proyecto.md` §17) + registrar el
   endpoint `https://nokfi.app/api/webhooks/stripe` (eventos: checkout.session.completed,
   invoice.paid, customer.subscription.updated, customer.subscription.deleted,
   invoice.payment_failed, charge.dispute.created) + copiar su `whsec_` al `.env`
   (ya hay uno del modo test; el LIVE se crea al registrar el endpoint en modo Live).
3. **Stripe dry-run** (tras dominio+SSL y webhook LIVE registrado): verificar API
   version ≥ `2024-04-10` (fija `backend/config/stripe-version.js`). Dry-run del
   trial de mini (`4242…` trial; `4000…0341` fallo de cobro al día 14). Confirmar
   `trial_ends_at` + banner "quedan X días". Con claves en medio se prueba el path
   real de historial (checkout → análisis → Historial). **Clave:** confirmar que
   un checkout real (+ webhook entrega) **crea la licencia** — eso valida la cadena
   bloqueada hasta hoy.
4. **Pruebas de navegador reales**: login/activación, los 6 subapartados de Excel,
   el cuestionario, exportación PDF/Excel, envío de email (Resend). Probar que un
   análisis generado aparece en Historial/Informes y re-exporta a PDF, y que el
   onboarding (modal) se persiste y recupera al recargar (G-a, ya en código+falta
   ver en navegador).

---

## 6. Convenciones no obvias que recordar

- **`DB_PATH` y `dotenv` son relativos al cwd** — PM2 arranca con cwd = `backend/`.
  Redeployar en un dir nuevo rompe la DB/env si no se respeta. No hay `.env` maestro
  en `/home/deploy/` (se borró); copiar del vivo.
- **Anti-drift de precios:** el frontend SIEMPRE pasa por `GET /api/payments/plans`,
  nunca hardcodea. Lo que cobra Stripe == lo que muestra la web.
- **El backend es la fuente de verdad de la API** — `nokfi_api_contract.md` antes de
  tocar el frontend.
- **Regla de contraste** (`nokfi_proyecto.md` §21): variables CSS, no hex fijos.
- **No pegues secretos en el chat** (VPS_PASS, tokens). El usuario los gestiona fuera
  de Claude Code.
- **`trialing` no es un `status` aparte**: una licencia en trial sigue siendo
  `status='active'` con `trial_ends_at` futuro. El MRR la excluye por campos.
- El `CHECK(payment_provider IN ('stripe','paypal','coinbase','revolut',NULL))` se
  conserva a propósito (documentación histórica), no es deuda a limpiar.
