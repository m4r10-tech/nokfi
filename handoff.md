# Nokfi — Handoff / Estado de la última sesión

> Última actualización: **2026-07-30**.
> Documento de "por dónde retomo el proyecto". Si solo lees un archivo, que sea este;
> luego `nokfi_contexto_claude_code.md` (panorama) y `nokfi_api_contract.md` (contrato).

---

## 0. TL;DR

- **Backend:** completo, **76/76 e2e PASS**, desplegado en el VPS (`191.44.112.86`)
  y funcional **salvo Stripe** (claves vacías en el `.env` del VPS).
- **Modelo de billing (Fase 3):** suscripción mensual Stripe-only (mini 5 € /
  pro 20 € / max 50 €), cuotas de IA 10/50/130 por licencia/día, **trial de 14 días
  solo en mini** con tarjeta. Precios env-driven (`PLAN_PRICE_*_EUR`).
- **Auth:** email + clave + **contraseña** (scrypt). El device-fingerprint se eliminó
  en `f9385af`; el anti-sharing es la cuota diaria de IA.
- **Frontend:** construido y compila, **no servido por el VPS** (falta Nginx).
  **Landing:** en diseño, no implementada.
- **Proveedores retirados:** PayPal / Revolut / Coinbase → `404` (Stripe-only).
- **Deudas F y G-b resueltas esta sesión:** comentario stale de `proxy.js` (F) e
  historial de análisis persistido (G-b). Detalle en §4.
- **Documentación (`*.md`):** movida de `md/` a la raíz del repo y al día. Los cambios
  de esta sesión (codígo + docs) **están sin commitear** todavía (ver §3).

---

## 1. Qué se hizo en las últimas sesiones (reciente → antiguo)

1. **Limpieza de proveedores muertos (Stripe-only)** — `bbf10cb`.
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

- `origin/main` **y** el VPS están en `bbf10cb` (cleanup). Local y origin en sync
  (`git rev-list origin/main...HEAD` = `0 0`).
- Backend PM2 `nokfi-backend` (fork, cwd `nokfi-fase3/backend`), `:3001`. Resurrect
  vía systemd `pm2-deploy.service`. Verificado online y healthy.
- DB `./db/nokfi.db` vacía (staging: 0 licencias). Migraciones Fase 2 + Fase 3
  (`trial_ends_at` = columna 19) corrieron schema-only en primer boot.
- `/api/payments/plans` vivo: mini 5€·10·trial / pro 20€·50 / max 50€·130.
- **No hay frontend ni landing servidos** (Nginx pendiente). **No hay dominio ni SSL.**

> Topología detallada (paths, resurrect, gotcha de `DB_PATH` relativa, rollback
> artifacts ya borrados): ver memoria `vps-deploy-topology`. Gaps de config del VPS:
> ver memoria `vps-config-gaps`.

---

## 3. Estado de git

- **`origin/main` está en `794a0a8`** y el VPS también (docs movidos + README +
  handoff ya empujados y desplegados en una sesión anterior).
- **SIN commitear (esta sesión) — deudas F + G-b:**
  - `backend/routes/proxy.js`: comentario stale corregido (F) + captura de análisis
    al generar (best-effort) → `createAnalysis`.
  - `backend/db/database.js`: tabla `analyses` + `createAnalysis`/`listAnalyses`/`getAnalysis`.
  - `backend/routes/analyses.js` (nuevo) + mount en `backend/server.js` (`/api/analyses`).
  - `backend/test/e2e.test.js`: suites de historial (DB-direct + integración con stub Gemini) → 76/76.
  - Frontend: `middleware/api.js` (`aiApi.analyze({kind,title})` + `analysesApi`),
    `components/ExcelSubModule.jsx` + `pages/Cuestionario.jsx` (pasan etiquetas),
    `components/HistoryBrowser.jsx` (nuevo) + `pages/EmptyState.jsx` (nuevo),
    `pages/Historial.jsx` + `pages/Informes.jsx` (wrappers), i18n `es.js`/`en.js` (sección `history`).
  - Docs: `nokfi_api_contract.md` (§2 body + nueva §2.5 + §6/§7), `handoff.md` (§0/§3/§4/§5),
    `nokfi_contexto_claude_code.md` (§6/§7/§8/§10), `nokfi_proyecto.md` (§14).
- Acción pendiente: preparar un commit conjunto del código + docs cuando el usuario
  quiera. **El usuario hace `git push` fuera de Claude Code** (no pegar tokens en el
  chat). Tras push: `git pull --ff-only` + `pm2 restart nokfi-backend --update-env` en
  el VPS (la tabla `analyses` se autocrea por `CREATE TABLE IF NOT EXISTS`), smoke de
  `/health` y `/api/analyses`.

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
| G-a | `/api/profile` no existe | perfil de empresa (onboarding) no persiste entre dispositivos | Sigue abierto (limitación `nokfi_contexto_claude_code.md` §6.1). El hook `useCompanyProfile.js` guarda en localStorage; sustituir por API cuando el negocio lo pida — los componentes no cambian (mismo shape). |
| G-b | ✅ **RESUELTO** — tabla `analyses` + `/api/analyses` | — | Historial de análisis persistido: captura en `routes/proxy.js` (best-effort, no bloquea), tabla `analyses` (autocreada por `CREATE TABLE IF NOT EXISTS`), `GET /api/analyses` (lista ligera) + `GET /api/analyses/:id` (scoped por licencia → 404 ajeno). Frontend: `HistoryBrowser.jsx` compartido por `Historial`/`Informes` (lista + detalle + re-export PDF), `sanitizeAiHtml` obligatorio. e2e **76/76** (incluye path real con stub de Gemini). |
| H | **Cuota diaria de IA vulnerable a overshoot por concurrencia** (TOCTOU) | nada en staging; allows scripted abuse to exceed the per-license daily cap | `countAiAnalysesToday` se lee en `routes/proxy.js` (línea ~65) pero solo se incrementa vía `audit('AI_ANALYSIS_GENERATED')` *después* del `await fetch` a Gemini → el `await` cede el event loop y N requests concurrentes de una misma licencia pasan el check leyendo el mismo conteo (todos <límite) antes de que se escriba el audit. Preexistente (no introducido por G-b); el backstop es el cap global de Gemini. Fix sería una reserva atómica (p.ej. tabla `ai_usage_daily` con `UNIQUE(license_id, day, slot)` o un contador transaccional) — cambio aparte con sus propios tests. |

`e2e.test.js` refleja lo correcto (10/50/130, `/plans`, MRR con trial excluido, `/api/analyses` + scoping), ver §2.

---

## 5. Cómo continuar (sugerido)

1. **Commit + push de esta sesión** (F + G-b, ver §3) — el usuario hace `git push`
   fuera de Claude Code; pull + restart en el VPS (tabla `analyses` autocreada);
   smoke (`/health`, `/api/analyses` con y sin auth → 200/401).
2. **Stripe** (deuda A): claves reales + verificar API version. Dry-run del trial de
   mini (tarjeta test `4242…` para trial; `4000…0341` para forzar fallo de cobro al
   día 14). Confirmar `trial_ends_at` y el banner "quedan X días". Con claves en medio
   se puede probar el path real de historial (checkout → análisis → aparece en historial).
3. **Dominio + Nginx + SSL** (deudas C, D): servir landing + frontend, proxeary
   `/api/`, poner cabeceras de seguridad, mover la CSP al dominio.
4. **Pruebas de navegador reales**: login/activación, los 6 subapartados de Excel,
   el cuestionario, exportación PDF/Excel, envío de email (Resend). Probar que un
   análisis generado aparece en Historial/Informes y re-exporta a PDF.
5. (Opcional) `/api/profile` (deuda G-a) — el único resto de la antigua deuda G.

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
