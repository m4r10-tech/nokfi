# Nokfi — Frontend

React + Vite + Tailwind CSS + PWA. Sigue el contrato de API en
[`docs/api.md`](../docs/api.md) y la visión de producto en
[`docs/proyecto.md`](../docs/proyecto.md).

---

## Instalación

```bash
npm install
cp .env.example .env
# Edita .env y pon la URL de tu backend (VITE_API_URL=/api para same-origin en prod)
npm run dev            # → http://localhost:5173
```

## Build de producción

```bash
npm run build          # → dist/ (listo para Nginx o cualquier servidor estático)
npm run build:spa      # solo la SPA, sin prerender (más rápido para probar)
npm run check:i18n     # mismas claves en los 6 idiomas
npm run check:seo      # páginas públicas con contenido es/en y calendario igual que el backend
npm run test:einvoice  # lector de facturas electrónicas (Facturae, UBL, CII)
node test/s15b-cifras.test.mjs   # CSV del libro, trimestres traducidos, errores de XML (sin navegador)
VITE_API_URL=/api npx vite build && node test/s15b-cifras.e2e.cjs   # Impuestos, Cobros, Libro e Inicio en Chromium (Playwright)
node test/s15b-t4-cifras.test.mjs   # xlsx/ods del libro (fecha y 0,00), signo −, trimestres de lo importado, IRPF de sociedades, textos (sin navegador)
VITE_API_URL=/api npx vite build && node test/s15b-t4-cifras.e2e.cjs   # Libro (periodo vacío, filtro, Excel), Factur-X gratis, otro trimestre, 130 y onboarding (Playwright; puertos 4201/4202)
VITE_API_URL=/api npx vite build && node test/s15b-seguridad.e2e.cjs   # exportar informes sin innerHTML y un solo enlace de gestoría por envío (Playwright)
node test/s15b-ia.test.mjs       # botones del asistente a partir de «[enlace: clave]» (sin navegador)
VITE_API_URL=/api npx vite build && node test/s15b-ia.e2e.cjs   # Cuestionario, Reclamar, asistente e Historial con la IA simulada (Playwright)
node test/s15b-t4-ia.test.mjs    # cifras clave de análisis antiguos en el historial (sin navegador)
VITE_API_URL=/api npx vite build && node test/s15b-t4-ia.e2e.cjs   # Reclamar bajo demanda y cancelación en el servidor, progreso del cuestionario, historial, comparación y carpeta (Playwright, puertos 4211-4212)
VITE_API_URL=/api npx vite build && node test/s15b-visual.e2e.cjs   # móvil/tablet: sin scroll horizontal a 390/360/768/1366, táctiles ≥ 40 px, «sin conexión», plantillas n8n y manifest (Playwright; ~10 min; ONLY=V1,V4… CFGS=m390 LANGS=es para acotar)
npm i --prefix /tmp/a11y-tools axe-core@4.10.2   # una vez, FUERA del proyecto (no es dependencia)
VITE_API_URL=/api npm run build && AXE_PATH=/tmp/a11y-tools/node_modules/axe-core/axe.min.js node test/s15b-a11y.e2e.cjs
                                 # accesibilidad (Playwright): axe sin fallos serious/critical en 25 pantallas en claro y
                                 # oscuro, foco retenido y devuelto en modales, hoja «Más» y asistente, «Saltar al contenido»,
                                 # región viva de toasts y la landing pidiendo solo la captura visible en WebP (ONLY=axe|kbd|landing|misc)
```

Capturas de la landing (`public/screens/`): `<pantalla>-<tema>.jpg` (1920×1200, las genera
`backend/scripts/landing-screens.js`) y sus versiones WebP `<pantalla>-<tema>-{640,960,1280,1920}.webp`,
que son las que pide la landing (`<picture>` con `srcset`; el JPG queda de respaldo). Si se
regeneran los JPG, hay que regenerar los WebP, p. ej. con ImageMagick:
`convert inicio-dark.jpg -resize 960x -quality 78 -define webp:method=6 inicio-dark-960.webp`.

`npm run build` hace tres pasos (sesión 12, SEO): `vite build` (la SPA),
`vite build --ssr src/entry-server.jsx` y `scripts/prerender.mjs`, que renderiza
con React en Node cada página pública de `src/seo/routes.js` y escribe
`dist/<ruta>/index.html` (contenido + title, canonical, hreflang, JSON-LD) y
`dist/sitemap.xml`. Los precios los pide a `https://nokfi.app/api/payments/plans`
(`PRERENDER_API=<url>` para usar otro backend).

Incluye el manifest de PWA y el service worker. En producción el frontend y el
backend comparten origen (Nginx proxyea `/api` → `localhost:3001`), así el bundle
se construye con `VITE_API_URL=/api` y no lleva IP/dominio hardcodeado.

> Nota: se compila en local y se sube el `dist` (el build en el VPS puede dar OOM
> por falta de RAM del droplet). Ver [`docs/deploy.md`](../docs/deploy.md).

---

## Estructura

```
src/
├── main.jsx              punto de entrada (hidrata las páginas prerenderizadas)
├── entry-server.jsx      render en Node para el prerender (sesión 12)
├── App.jsx               todas las rutas (las públicas salen de seo/routes.js)
├── index.css             variables de tema + estilos base + fuente
├── context/              Auth, Theme, Lang (React Context)
├── seo/                  routes.js (páginas públicas es/en), useSeo, content/{es,en}.js
├── middleware/           api.js (único cliente del backend), sanitize, exports…
├── hooks/                useCompanyProfile, usePlans, usePageMeta…
├── components/           calculators.jsx, PublicChrome, Sidebar, PlanCards…
├── layouts/              DashboardLayout (sidebar + onboarding + outlet)
├── i18n/                 es, en, fr, it, de, pl
└── pages/
    ├── Landing, Pricing, Legal, ApiDocs, Login, Reveal…   (públicas)
    ├── seo/              herramientas (ToolPage), guías (GuidePage, GuidesIndex)
    └── Home, finance/, excel/, dev/, Historial, Calculadoras, Configuracion  (dentro de /app)
```

---

## ⚠️ Auditoría de seguridad — dependencia `xlsx` (SheetJS)

`npm audit` reporta una vulnerabilidad **high** en `xlsx` (ReDoS y prototype
pollution — GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9), **sin parche disponible**.

**Análisis de riesgo real para Nokfi:**
- `xlsx` se ejecuta **enteramente en el navegador del propio usuario**, nunca en el
  servidor — el backend no procesa archivos Excel en ningún momento (no hay
  `multer` ni endpoints de subida).
- El escenario de explotación (ReDoS) requiere que la víctima abra **su propio**
  archivo Excel malicioso (self-DoS de su pestaña) o ingeniería social con un
  Excel de un tercero dentro de Nokfi.
- Impacto máximo realista: la pestaña se cuelga (DoS local del cliente). No hay
  ejecución de código, ni acceso a datos de otros usuarios, ni compromiso del
  servidor.

**Decisión:** se mantiene `xlsx` (no hay alternativa madura con la misma cobertura
. xlsx/.xls/.csv sin el mismo problema). Se documenta el riesgo residual aceptado.
Revisar periódicamente por si SheetJS publica un parche.

---

## Notas de sesión y autenticación

- El token de sesión vive en memoria + `sessionStorage` (se borra al cerrar la
  pestaña) — balance entre seguridad y no forzar login en cada refresco.
- El historial de análisis (`/api/analyses`) y el perfil de empresa (`/api/profile`)
  se persisten en el backend y se scopean por licencia — ya no hay estado de esas
  pantallas en `localStorage`.

## Regla de contraste (`docs/proyecto.md` §19)

Todo componente nuevo debe usar las variables CSS de `index.css`
(`var(--text-primary)`, `var(--surface-1)`, etc.), nunca colores hex fijos. Antes
de dar por terminada una pantalla, probarla visualmente en ambos temas (oscuro y
claro).