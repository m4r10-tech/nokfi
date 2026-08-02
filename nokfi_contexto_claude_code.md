# CONTEXTO DEL PROYECTO — Nokfi
> Documento de traspaso para continuar en Claude Code. **Reescrito julio 2026** — el
> estado anterior del documento describía "pago único de por vida" + 4 pasarelas +
> auth por device-fingerprint, todo lo cual cambió con la Fase 3. Verifica todo lo que
> aquí se describes con el código real (Claude Code ejecuta), no asumas que funciona
> solo por estar escrito.
>
> Para el detalle exacto de endpoints y estado puntual del despliegue, ver
> `nokfi_api_contract.md` (contrato) y `handoff.md` (estado de la última sesión +
> deudas abiertas).

---

## 1. Qué es Nokfi

SaaS de análisis financiero para autónomos y pymes españolas. Combina:
- Un **cuestionario de diagnóstico** (5 bloques × 6 preguntas Sí/No)
- **6 subapartados de análisis de Excel/PDF** con IA (stock, ventas, servicios,
  entrada de productos, caja, profit total)
- Informes exportables en PDF/Excel · Calculadoras financieras (punto de equilibrio,
  margen, ROI)

**Modelo de negocio (Fase 3): suscripción mensual** vía Stripe, 3 tiers:
- **mini** 5 €/mes · 10 análisis IA/día · **14 días de prueba gratis** (tarjeta obligatoria)
- **pro** 20 €/mes · 50 análisis IA/día
- **max** 50 €/mes · 130 análisis IA/día

**Auth: email + clave (`XXXX-XXXX-XXXX-XXXX`) + contraseña (scrypt).** El viejo modelo
de device-fingerprint del navegador **se eliminó** (commit `f9385af`) — la clave ya no
se vincula a un dispositivo fijo. El anti-sharing se delega en la **cuota diaria de IA
por licencia** (10/50/130): una clave compartida se agota entre todos los que la usen.

El nombre del producto pasó por dos iteraciones: **Finia → Nokfi** (cambiado por
colisión de marca). Todo el código y documentación usa "Nokfi" — si ves "Finia"
en algún sitio residual, hay que corregirlo.

---

## 2. Dónde vive todo

- **Repo:** `https://github.com/m4r10-tech/nokfi.git` (rama `main`)
- **VPS de pruebas/producción:** `deploy@191.44.112.86` (Ubuntu 24.04 LTS, Node 22,
  PM2, UFW con 22 y 3001 abiertos). **No hay `/var/www/`**: el backend vive en
  `/home/deploy/nokfi-fase3/backend` (clone de git, `HEAD` == `origin/main`).
- **El único `.env`** es `/home/deploy/nokfi-fase3/backend/.env` (mode 600). `server.js`
  hace `require('dotenv').config()` sin path → carga `process.cwd()/.env`. **`DB_PATH`
  es relativa (`./db/nokfi.db`)**: el proceso PM2 arranca con cwd = dir del backend;
  arrancarlo desde otro cwd rompe DB + env. (No hay un `/home/deploy/.env` maestro —
  se borró para evitar drift; si se redepliega en un dir nuevo, copiar del `.env`
  vivo.)
- **PM2:** proceso `nokfi-backend`, fork mode. `pm2 save` lo persiste en
  `~/.pm2/dump.pm2` (lleva el cwd). **Resurrect tras reboot:** systemd
  `pm2-deploy.service` (enabled) ejecuta `pm2 resurrect` en el boot → reinicia el
  backend desde el cwd guardado. Verificado que apunta a `nokfi-fase3/backend`.
- **Aún NO hay dominio ni SSL ni Nginx** — todo funciona sobre IP directa por HTTP en
  `:3001`. El frontend **no lo sirve el VPS** todavía. Nginx (con cabeceras de
  seguridad + Certbot) está documentado (`nokfi_proyecto.md` §17) pero pendiente.
- **La documentación `.md` está en la RAÍZ del repo** (no en `md/`): se movió en julio
  2026 (`git mv` preserva historia). La carpeta `md/` quedó solo con `.claude/`.

---

## 3. Stack técnico

**Backend:** Node.js 22 + Express + SQLite (`better-sqlite3`). Sin ORM, queries
parametrizadas. IA: **Google Gemini** (`gemini-flash-latest`, fallback
`gemini-2.5-flash` — este último fue retirado por Google 07/2026; free tier).

**Frontend:** React + Vite + Tailwind CSS + PWA (`vite-plugin-pwa`). Sin Redux —
Context API (Auth, Theme, Lang). Recharts (gráficas), `xlsx`/SheetJS (Excel),
`jspdf` + `pdfjs-dist` (PDF), `dompurify` (sanitiza el HTML de la IA), `i18next`
(ES/EN). **Está construido y compila** (`npm run build` verde) pero **no se sirve
desde el VPS** todavía.

**Pasarela de pago: Stripe (única)** — suscripción mensual (`mode=subscription`,
`recurring[interval]=month`, `unit_amount` en céntimos desde `.env`). Los antiguos
PayPal / Revolut / Coinbase Commerce **se retiraron** (sus endpoints no están
montados → `404`). Solo Stripe se probó de extremo a extremo en sandbox.

**Email transaccional:** Resend (remitente de pruebas `onboarding@resend.dev`, sin
dominio verificado todavía).

**Fuente única de planes:** `backend/config/plans.js` (`PLANS`, `VALID_PLANS`,
`AI_QUOTAS`, `TRIAL_DAYS=14`, `TRIAL_PLANS=['mini']`, `coercePlan`, `planHasTrial`).
Los precios (EUR) se leen de `PLAN_PRICE_*_EUR` en `.env` (defaults 5/20/50); la
cuota de IA (10/50/130) es decisión de producto, **no** env-driven. El catálogo se
expone por el endpoint público `GET /api/payments/plans` (anti-drift: el frontend lo
fetcha en runtime en vez de hardcodear precios).

---

## 4. Documentos de referencia (en la raíz del repo)

- `nokfi_proyecto.md` — documento maestro (21 secciones): modelo de negocio, flujo de
  venta, pasarela, seguridad, arquitectura, UI/dashboard, landing, onboarding,
  política de licencias, métricas, VPS, frontend, subapartados de Excel, identidad
  visual.
- `nokfi_api_contract.md` — **fuente de verdad** del contrato backend↔frontend (cada
  endpoint con request/response shape y códigos de error). Lee esto antes de tocar
  cualquier endpoint o llamada del frontend.
- `handoff.md` — estado de la última sesión + deudas abiertas + topología VPS +
  cómo continuar. **Empezar por aquí al retomar el proyecto.**
- `nokfi_reparto_beneficios.md` — reparto entre los 3 socios (no técnico).

---

## 5. Auditoría de seguridad (realizada; 14 hallazgos corregidos)

Auditoría OWASP Top 10 + ASVS sobre todo el proyecto. **14 hallazgos corregidos**,
verificados con `node --check` y/o ejecución real en el VPS. Resumen (los más
relevantes para no reabrirlos):

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | XSS vía respuesta HTML de la IA sin sanitizar | ALTA | ✅ DOMPurify en `middleware/sanitize.js` (Cuestionario.jsx, ExcelSubModule.jsx) |
| 2 | CORS roto (`*` no funcional) + sin failsafe en prod | MEDIA | ✅ `server.js` aborta arranque si `NODE_ENV=production` y `ALLOWED_ORIGINS=*` |
| 3 | Panel admin sin rate limit propio | BAJA | ✅ `adminLimiter` en `server.js` |
| 4 | Sin fortaleza mínima del `ADMIN_SECRET` | MEDIA | ✅ `routes/admin.js` (mín 32 chars; en prod aborta el arranque si es más corta) |
| 5 | Texto libre sin sanitizar (device_name, notes) | BAJA | ✅ `sanitizeFreeText` en auth.js / admin.js |
| 6 | Límite implícito de tamaño en webhooks | BAJA | ✅ límite explícito 512kb en `express.raw()` |
| 7 | Sin cuota diaria por licencia (Gemini free tier compartido) | MEDIA | ✅ `countAiAnalysesToday` — **cuotas 10/50/130 por plan** (mini/pro/max) |
| 8 | Sin CSP en frontend | MEDIA | ✅ meta tag en `index.html` — **⚠️ tiene hardcoded en `connect-src` la IP/dominio del backend; hay que mantenerla sincronizada al cambiar de VPS o al poner dominio** (ya causó un bloqueo real en su momento) |
| 9 | Headers de Helmet sin ajustar | BAJA | ✅ HSTS 1 año, CORP cross-origin, Referrer-Policy |
| 13 | Formula/CSV Injection en exportación Excel | MEDIA | ✅ `neutralizeFormulaInjection` en `exportUtils.js` |
| 14 | Sin cabeceras de seguridad en Nginx para frontend estático (clickjacking) | MEDIA | Documentado en `nokfi_proyecto.md` §17 — **pendiente de aplicar cuando se despliegue Nginx** |

**Cambio estructural de auth (no era un hallazgo, sino una decisión posterior):** el
modelo device-fingerprint se eliminó en `f9385af` (tercer factor → contraseña scrypt;
columnas `device_fingerprint`/`last_device_reset` DROPeadas; `sessions.fingerprint`
también). El anti-sharing pasó a ser la cuota diaria de IA (#7).

`npm audit` backend: **0 vulnerabilidades**. Frontend: avisos en dependencias
transitivas (`dompurify` vía `jspdf`, `esbuild` vía `vite` [solo dev server],
`xlsx` sin parche) — documentados y riesgo aceptado en `frontend/README.md`.
**No ejecutar `npm audit fix --force`** (rompería `vite-plugin-pwa`).

---

## 6. Limitaciones conocidas (alcance pendiente, no bugs)

1. **~~Perfil de empresa (onboarding) no persiste~~ → RESUELTO (deuda G-a)** — ya
   existe `GET/PUT /api/profile`: la tabla `company_profiles` (1 fila por licencia,
   FK CASCADE) + `routes/profile.js` (escopado por `req.license.id`, GET vacío-inicial,
   PUT enum-validado con merge parcial). El frontend `hooks/useCompanyProfile.js` es
   ahora el puente (antes guardaba en `localStorage`): `GET` al montar (`loading`,
   sin flash del `OnboardingModal`/welcome-card) + `PUT` debounced 600 ms **acumulando
   partials** (no pierde edits de campos distintos hecho en la misma ventana). Refactor:
   `sanitizeFreeText` extraído a `utils/sanitize.js` (3º uso). e2e **93/93** (17 tests
   nuevos de perfil: scoping entre 2 licencias, merge parcial, filtro de enum, saneado
   de texto libre, guards 400).
2. **~~Historial de análisis no persiste~~ → RESUELTO (deuda G-b)** — la tabla
   `analyses` y `GET /api/analyses` (+ `/:id`, scoped por licencia) ya existen;
   `routes/proxy.js` persiste cada análisis generado (best-effort, no bloquea la
   respuesta); `Historial.jsx`/`Informes.jsx` los listan, abren y re-exportan vía
   `components/HistoryBrowser.jsx` (con `sanitizeAiHtml` obligatorio). Solo persiste
   `result_html` + `prompt_chars` (conteo), **no** el prompt (privacidad — los datos
   financieros no se duplican en otra tabla). e2e cubre scoping (404 ajeno) + path real
   con stub de Gemini.
3. **Gemini free tier** — Google puede usar los prompts para entrenar (decisión de
   negocio consciente, `nokfi_proyecto.md` §6-sobre-IA) y hay límite de ~1.500
   peticiones/día para todo el proyecto (mitigado con la cuota 10/50/130 por licencia).
4. **Transferencia bancaria descartada** como método de pago (sin webhook;
   incompatible con el flujo 100% automático de licencias).
5. **~~Comentario stale de `routes/proxy.js`~~ → RESUELTO (deuda F)** — decía
   "mini 30 / pro 80 / max 200"; corregido a `10/50/130` (lo real vía `aiQuotaForPlan`).

---

## 7. Qué se ha probado con ejecución real (y qué no)

### ✅ Probado y funcionando en el VPS real
- Arranque con PM2, `/health` 200, resurrect tras reboot (systemd `pm2-deploy.service`)
- Migraciones Fase 2 (auth contraseña) y Fase 3 (suscripción + `trial_ends_at`)
  corriendo en vivo, schema verificado
- Creación de licencias por admin, activación + login (email + clave + contraseña)
- Anti-sharing via cuota diaria (AI proxy 429 al pasar del límite)
- **Webhook de Stripe end-to-end en sandbox**: checkout real → tarjeta de prueba →
  webhook recibido → licencia generada con importe correcto → visto en `/api/admin/stats`
- `GET /api/payments/plans` vivo (mini 5€·10·trial, pro 20€·50, max 50€·130)
- CORS verificado con curl; headers de Helmet en respuesta real
- `npm install` frontend (482 paquetes) + `npm run build` sin errores
- **e2e backend 93/93 PASS** (`backend/test/e2e.test.js`) — incluye `/plans`, cuotas,
  MRR (trial excluido), `billing.trialing`, `/api/analyses` + scoping (404 ajeno,
  400 no-numérico), path real de captura con stub de Gemini, y `/api/profile`
  (scoping 2 licencias, merge parcial, filtro enum, saneado, guards 400).

### ❌ Pendiente de probar en vivo (bloqueado por dominio+SSL)
- **Stripe LIVE: claves pegadas**, pero el **webhook no entrega** sin HTTPS. Hasta
  tener dominio+SSL + registrar el endpoint `https://nokfi.app/api/webhooks/stripe`
  y copiar su `whsec_` LIVE, un cobro real **no crea licencia** (el handler
  `webhooks.js:193 createLicense` solo se dispara por webhook). `create-checkout` ya
  responde con las claves (no `stripe_not_configured`); falta confirmar la cadena
  completa checkout → webhook → licencia. API version ≥ `2024-04-10` (fija
  `backend/config/stripe-version.js`).
- Envío real de emails con Resend (API key configurada, no se ha disparado ninguno real)
- Login/activación completos **desde el navegador** de principio a fin
  (frontend compila pero no está servido por el VPS)
- Los 6 subapartados de Excel con datos reales desde el navegador
- Exportación real a PDF/Excel desde la UI

### 🪦 Retirados (ya no son "pendientes de probar")
- Webhooks/checkout de PayPal, Revolut, Coinbase — **eliminados**, devuelven `404`

---

## 8. Estado actual — dónde está el proyecto

- **Backend:** completo, testeado (**93/93**), desplegado en el VPS (`191.44.112.86`,
  HEAD `5810ae9`) y funcional. Deudas F + G-a (`/api/profile`) + G-b (historial de
  análisis) + SendGrid retirado (Resend-only) + landing pública → todas commiteadas,
  pusheadas y desplegadas. **Stripe LIVE**: `STRIPE_SECRET_KEY` (`sk_live_`) +
  `STRIPE_WEBHOOK_SECRET` (`whsec_`) pegadas y verificadas en el `.env` del VPS
  (GET `/v1/balance` → 200). ⚠️ **El webhook LIVE aún NO entrega**: Stripe exige
  HTTPS y no hay dominio+SSL → un cobro real hoy no generaría licencia (el handler
  `webhooks.js:193 createLicense` solo se dispara por webhook). Dominio+Nginx+SSL =
  prerrequisito (ver `handoff.md` §5). 3 commits de infra+docs (`d07996d`, `ba4f4d2`,
  `5c1a714`) están 3 ahead de `origin/main` a la espera del `git push` del usuario.
- **Frontend:** compila, bundle limpio (same-origin `/api`, sin IP). **No servido por
  el VPS** (falta Nginx — paso `sudo` del usuario). La plantilla Nginx real está en
  `deploy/nginx-nokfi.conf` (`d07996d`). `Historial`/`Informes` ya listan y abren
  análisis reales (deuda G-b resuelta).
- **Landing:** **implementada + commiteada + desplegada** (`5810ae9`, en disco del
  VPS, aún no servida hasta Nginx). `pages/Landing.jsx` en ruta `/` (antes redirigía
  a `/login`): Hero + Info empresa + Planes + CTA. Definición en `nokfi_proyecto.md`
  §13 (4 de las 8 secciones previstas; el resto para el futuro).
- **Documentación:** en la raíz del repo y al día (`handoff.md` como fuente de estado).

**Tareas inmediatas de configuración (no código):** push de los 3 commits ahead,
comprar dominio + desplegar Nginx + SSL (desbloquea el webhook LIVE de Stripe),
registrar el endpoint `https://nokfi.app/api/webhooks/stripe`. Ver `handoff.md` §5
para el orden y los detalles (división Claude sin-sudo / usuario con-sudo).

---

## 9. Reglas de trabajo acordadas con el usuario (mantener)

- **El backend es la fuente de verdad de la API** — antes de tocar el frontend, confirmar
  el contrato real en `nokfi_api_contract.md` o en el código del backend, no asumir.
- **Regla de contraste obligatoria** (`nokfi_proyecto.md` §21): todo componente usa
  variables CSS (`var(--text-primary)`, etc.), nunca hex fijos, para que el contraste
  funcione en ambos temas.
- **Anti-drift de precios:** nunca hardcodear precios en el frontend — siempre via
  `GET /api/payments/plans`. Lo que cobra Stripe y lo que muestra la web deben coincidir.
- El usuario prefiere que se le explique **qué se hizo y por qué** en cada cambio,
  especialmente en seguridad (formato: explicación breve + gravedad + código +
  verificación).
- **Verificar SIEMPRE con ejecución real** cuando sea posible (Claude Code ejecuta,
  a diferencia del chat anterior) — no dar nada por funcionando solo por revisión
  visual.
- El `.env` real (con secretos) **nunca se sube al repo** (`.gitignore`). Y CVE: el
  usuario maneja credenciales (VPS_PASS, tokens) **fuera de Claude Code** cuando
  corrían por un gateway que pudo verlas — no pegues secretos en el chat.

---

## 10. Siguientes pasos (orden recomendado — detalle en `handoff.md`)

1. Pegar claves reales de Stripe en el `.env` del VPS + `pm2 restart --update-env`;
   verificar API version ≥ `2024-04-10`; dry-run del trial de mini (tarjeta 4242…).
2. Comprar dominio y desplegar Nginx + SSL (Certbot) + cabeceras de seguridad
   (hallazgo #14), sirviendo landing + frontend.
3. Sincronizar la CSP del `index.html` al nuevo dominio (hallazgo #8).
4. Probar login/activación completos desde el navegador, los 6 subapartados de Excel
   y el cuestionario con datos reales.
5. Probar envío real de emails (Resend) y event-driven del webhook de Stripe en vivo.
   En cuanto haya frontend en el VPS, probar que un análisis generado aparece en
   Historial/Informes y re-exporta a PDF (deuda G-b ya resuelta en código, falta
   verificación en navegador real) Y que el onboarding (modal) se persiste y recupera
   al recargar (deuda G-a resuelta, falta verificación en navegador real — el perfil
   ahora viaja por `/api/profile`, no localStorage).
