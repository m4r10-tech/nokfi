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
```

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