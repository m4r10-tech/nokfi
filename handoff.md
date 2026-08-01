# Nokfi — Handoff / Estado de la última sesión

> Última actualización: **2026-08-01**.
> Documento de "por dónde retomo el proyecto". Si solo lees un archivo, que sea este;
> luego `nokfi_contexto_claude_code.md` (panorama) y `nokfi_api_contract.md` (contrato).

---

## 0. TL;DR

- **Backend:** completo, **93/93 e2e PASS**, desplegado en el VPS (`191.44.112.86`,
  HEAD `ce00f9d`) y funcional **salvo Stripe** (claves vacías en el `.env` del VPS).
- **Modelo de billing (Fase 3):** suscripción mensual Stripe-only (mini 5 € /
  pro 20 € / max 50 €), cuotas de IA 10/50/130 por licencia/día, **trial de 14 días
  solo en mini** con tarjeta. Precios env-driven (`PLAN_PRICE_*_EUR`).
- **Auth:** email + clave + **contraseña** (scrypt). El device-fingerprint se eliminó
  en `f9385af`; el anti-sharing es la cuota diaria de IA.
- **Frontend:** construido y compila, **no servido por el VPS** (falta Nginx).
  **Landing:** en diseño, no implementada.
- **Proveedores retirados:** PayPal / Revolut / Coinbase → `404` (Stripe-only).
- **Deudas resueltas:** F (comentario stale `proxy.js`) + G-b (historial de análisis)
  + G-a (`/api/profile` del onboarding) → **las tres commiteadas, pusheadas y
  desplegadas** (VPS en `ce00f9d`). Detalle en §4.
- **Sin commitear (esta sesión):** refactor **Resend-only** del `mailer.js` —
  retirada de la rama SendGrid + el switch `EMAIL_PROVIDER||'sendgrid'` (footgun
  latente: caía al proveedor muerto si faltaba la var) + limpieza de `.env.example`
  y docs. e2e 93/93. Ver §3. **No tocar el `.env` del VPS hasta deployear el nuevo
  mailer** (el código vivo aún lee `EMAIL_PROVIDER=resend`).
- **VPS deploy autónomo por llave SSH** desde el 2026-07-31 (ver §6).
- **Documentación (`*.md`):** en la raíz del repo y al día.

---

## 1. Qué se hizo en las últimas sesiones (reciente → antiguo)

0. **Landing pública en `/` (home de la SPA)** — SIN commitear todavía (ver §3).
   `pages/Landing.jsx` (ruta `/`, antes redirigía a `/login`): top bar (logo +
   selector ES/EN + toggle tema + link "Iniciar sesión"), Hero, Info de empresa /
   qué es Nokfi, Planes y precios, CTA final, footer. Extracción reutilizable:
   `components/PlanCards.jsx` + `hooks/usePlans.js` (GET `/api/payments/plans`,
   anti-drift) consumidos por `Landing` Y `Pricing` (rewired). Namespace i18n
   `landing.*` (es+en). Gating SIN tocar: app sigue en `/app/*` bajo `ProtectedRoute`
   (solo licencia activa/trial). `npm run build` verde, 0 precios hardcodeados en
   el bundle. Pendiente: build en el VPS con `VITE_API_URL=/api` (tarea dominio+SSL).
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

- `origin/main` **y** el VPS están en `ce00f9d` (G-a `/api/profile` + G-b
  historial + F comentario). Local y origin en sync (`git rev-list origin/main...HEAD`
  = `0 0`).
- Backend PM2 `nokfi-backend` (fork, cwd `nokfi-fase3/backend`), `:3001`. Resurrect
  vía systemd `pm2-deploy.service`. Verificado online y healthy.
- DB `./db/nokfi.db` vacía (staging: 0 licencias). Migraciones Fase 2 + Fase 3
  (`trial_ends_at` = columna 19) corrieron schema-only en primer boot. Las tablas
  `analyses` y `company_profiles` se **autocrea**n en boot (`CREATE TABLE IF NOT
  EXISTS`, sin migración).
- `/api/payments/plans` vivo: mini 5€·10·trial / pro 20€·50 / max 50€·130.
  `/api/analyses` y `/api/profile` vivos (401 sin auth → rutas montadas y
  `requireLicense` aplicado).
- **No hay frontend ni landing servidos** (Nginx pendiente). **No hay dominio ni SSL.**
  La landing pública (`pages/Landing.jsx`) ya existe en código (commit esta sesión);
  entra en producción con el build del frontend (`VITE_API_URL=/api`) en la tarea
  dominio+SSL.

> Topología detallada (paths, resurrect, gotcha de `DB_PATH` relativa, rollback
> artifacts ya borrados): ver memoria `vps-deploy-topology`. Gaps de config del VPS:
> ver memoria `vps-config-gaps`. **Deploy autónomo por llave SSH**: ver memoria
> `vps-deploy-ssh-key` (Claude deploya solo; el archivo de credenciales se borró).

---

## 3. Estado de git

- **`origin/main` y el VPS están en `ce00f9d`** (G-a `/api/profile` + G-b historial
  + F comentario + 3 fixes de la revisión pre-Stripe) — commiteado, pusheado y
  desplegado (VPS verificado: HEAD `ce00f9d`, `/health` 200, `/api/profile` 401 sin
  auth, tabla `company_profiles` autocreada).
- **SIN commitear (esta sesión) — landing pública en `/`:** `frontend/src/pages/Landing.jsx`
  (ruta `/` antes → `/login`, ahora renderiza la home pública: top bar + Hero +
  Info de empresa + Planes + CTA + footer), `components/PlanCards.jsx` +
  `hooks/usePlans.js` (extracción reutilizable de Pricing, anti-drift vía
  `/api/payments/plans`), rewiring de `Pricing.jsx` para reusarlos, namespace i18n
  `landing.*` (es+en), wiring en `App.jsx`. `npm run build` verde, 0 precios
  hardcodeados en el bundle. **No se toca el gating** (app en `/app/*` bajo
  `ProtectedRoute`). Entra en producción con el build del frontend en la tarea
  dominio+SSL.
- **SIN commitear (esta sesión) — refactor Resend-only del mailer:** retirar la
  rama SendGrid (`dispatchViaSendGrid` + el switch `EMAIL_PROVIDER||'sendgrid'`).
  El VPS ya va por Resend y ni siquiera tiene `SENDGRID_API_KEY`; SendGrid era
  código muerto + un footgun (el `||'sendgrid'` caía al proveedor muerto si faltaba
  la var, rompiendo emails silenciosamente). Cambios:
  - `backend/utils/mailer.js`: `dispatch()` solo Resend; fuera `dispatchViaSendGrid`
    y `EMAIL_PROVIDER`.
  - `backend/.env.example`: fuera `EMAIL_PROVIDER=`, bloque "Si usas SendGrid" y
    `SENDGRID_API_KEY=`.
  - `nokfi_proyecto.md` + `README.md`: menciones SendGrid → Resend.
  - e2e **93/93** (no toca callers: `auth.js`/`admin.js`/`webhooks.js` solo usan
    `send*Email` con interfaz intacta). `node --check` OK. 0 menciones SendGrid en
    toda la repo.
- Acción: commit atómico "chore(mailer): retirar SendGrid (Resend-only)" + push
  (usuario) + deploy. **En el deploy, paso aparte con sudo-env**: borrar
  `EMAIL_PROVIDER=resend` del `.env` del VPS (el código vivo `ce00f9d` aún lo lee
  para rutear a Resend → quitarlo ANTES de deployear el nuevo mailer rompería el
  envío). Tras `pm2 restart --update-env`, smoke `/health`.

---

## 4. Deudas abiertas (no código a menos que se indique)

| # | Deuda | Bloquea | Acción |
|---|-------|--------|--------|
| A | **Stripe keys vacías en el VPS** (`.env`) | trial/suscripción en vivo, dry-run del checkout | Pegar `STRIPE_SECRET_KEY`+`STRIPE_WEBHOOK_SECRET` reales; verificar API version ≥ `2024-04-10` en el dashboard; `pm2 restart --update-env`. Usuario bloqueado por verificación de empresa en Stripe. |
| B | **`STRIPE_PRICE_{MINI,PRO,MAX}` ausentes** | inferencia de plan tras upgrade por Customer-Portal | Crear los 3 recurring-Price en Stripe y setearlos. Sin impacto hoy (0 suscripciones). Cae a `subscription.metadata.plan`. |
| C | **Frontend/landing no servidos; Nginx + SSL pendientes** | acceso por navegador, lanzamiento | Comprar dominio; desplegar Nginx sirviendo `landing/`+`frontend/` y proxeando `/api/`; Certbot; cabeceras de seguridad (hallazgo #14). Plantilla de Nginx en `nokfi_proyecto.md` §17. |
| D | **CSP del `index.html` con la IP del VPS hardcodeada** | cambiará al poner dominio | Actualizar `connect-src` al nuevo dominio/IP (hallazgo #8; ya causó un bloqueo real antes). |
| E | **Gemini 503 transitorio** | nada (se autocale) | Mapea `non-2xx/non-429 → 502`. Si persiste → cuota/disponibilidad de Google, no bug. `GEMINI_API_KEY` válida (53 chars). |
| F | ✅ **RESUELTO** — `routes/proxy.js` comentario stale | — | Decía "mini 30/pro 80/max 200"; corregido a `10/50/130` (lo real vía `aiQuotaForPlan`). |
| G-a | ✅ **RESUELTO** — `/api/profile` (perfil de empresa del onboarding) | — | Tabla `company_profiles` (1 fila/licencia, FK CASCADE, PK `license_id` UNIQUE) + `getCompanyProfile`/`upsertCompanyProfile` (merge parcial en el DB layer, UPSERT `ON CONFLICT`). Rutas `routes/profile.js`: `GET /api/profile` (200, vacío si no existe — no 404) + `PUT /api/profile` (enum-validado contra los valores del `OnboardingModal.jsx`, `companyName` saneado vía `sanitizeFreeText`, scoping por `req.license.id`). Frontend: `useCompanyProfile.js` ahora es puente API (load async + `loading`, PUT debounced 600 ms **acumulando** partials para no perder edits de campos distintos); `profileApi` en `api.js`; `DashboardLayout`/`Home`/`Configuracion` consumen `loading` (sin flash del modal/tarjeta ni keystroke-loss). Refactor: `sanitizeFreeText` extraído a `utils/sanitize.js` (3º uso — auth/admin/profile). e2e **93/93** (17 tests nuevos: scoping 2 licencias, merge parcial, filtro enum, saneado, guards 400). |
| G-b | ✅ **RESUELTO** — tabla `analyses` + `/api/analyses` | — | Historial de análisis persistido: captura en `routes/proxy.js` (best-effort, no bloquea), tabla `analyses` (autocreada por `CREATE TABLE IF NOT EXISTS`), `GET /api/analyses` (lista ligera) + `GET /api/analyses/:id` (scoped por licencia → 404 ajeno). Frontend: `HistoryBrowser.jsx` compartido por `Historial`/`Informes` (lista + detalle + re-export PDF), `sanitizeAiHtml` obligatorio. e2e **76/76** (incluye path real con stub de Gemini). |
| H | **Cuota diaria de IA vulnerable a overshoot por concurrencia** (TOCTOU) | nada en staging; allows scripted abuse to exceed the per-license daily cap | `countAiAnalysesToday` se lee en `routes/proxy.js` (línea ~65) pero solo se incrementa vía `audit('AI_ANALYSIS_GENERATED')` *después* del `await fetch` a Gemini → el `await` cede el event loop y N requests concurrentes de una misma licencia pasan el check leyendo el mismo conteo (todos <límite) antes de que se escriba el audit. Preexistente (no introducido por G-b); el backstop es el cap global de Gemini. Fix sería una reserva atómica (p.ej. tabla `ai_usage_daily` con `UNIQUE(license_id, day, slot)` o un contador transaccional) — cambio aparte con sus propios tests. |

`e2e.test.js` refleja lo correcto (10/50/130, `/plans`, MRR con trial excluido, `/api/analyses` + scoping), ver §2.

---

## 5. Cómo continuar (sugerido)

1. **Commit + push del refactor Resend-only** (ver §3) — el usuario hace `git push`
   fuera de Claude Code. Deploy autónomo (llave SSH): `git pull --ff-only` +
   `pm2 restart --update-env`. **Paso aparte (env, no código):** borrar
   `EMAIL_PROVIDER=resend` del `.env` del VPS solo tras reiniciar con el nuevo
   mailer (el `ce00f9d` vivo aún lo lee). Smoke `/health`.
2. **Dominio + Nginx + SSL** (deudas C, D) — **prerrequisito de Stripe LIVE**: el
   webhook que crea la licencia (`webhooks.js:193`) requiere HTTPS, y hoy solo hay
   IP+HTTP `:3001` → un cobro real no generaría licencia. Single-subdomain
   `app.nokfi.app` (serves `dist/` + proxea `/api/` → `:3001`), Certbot, cabeceras
   de seguridad (#14), CSP al dominio (#8). Build frontend con `VITE_API_URL=/api`.
   División: Claude (sin sudo) build + configs + `.env` (ALLOWED_ORIGINS,
   APP_PUBLIC_URL); usuario (sudo+dinero+Stripe) dominio+A-records+`apt
   install nginx certbot`+`ufw 80,443`+`certbot`+pegar LIVE keys+registrar endpoint
   `https://app.nokfi.app/api/webhooks/stripe`.
3. **Stripe** (deuda A — tras dominio+SSL): claves LIVE + verificar API version ≥
   `2024-04-10`. Dry-run del trial de mini (`4242…` trial; `4000…0341` fallo de cobro
   al día 14). Confirmar `trial_ends_at` + banner "quedan X días". Con claves en
   medio se prueba el path real de historial (checkout → análisis → Historial).
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
