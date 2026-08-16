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
```

Incluye el manifest de PWA y el service worker. En producción el frontend y el
backend comparten origen (Nginx proxyea `/api` → `localhost:3001`), así el bundle
se construye con `VITE_API_URL=/api` y no lleva IP/dominio hardcodeado.

> Nota: se compila en local y se sube el `dist` (el build en el VPS puede dar OOM
> por falta de RAM del droplet). Ver [`docs/deploy.md`](../docs/deploy.md).

---

## Estructura

```
src/
├── main.jsx              punto de entrada
├── App.jsx               todas las rutas
├── index.css             variables de tema + estilos base
├── context/              Auth, Theme, Lang (React Context)
├── middleware/
│   ├── api.js            único punto de comunicación con el backend
│   ├── sanitize.js       sanitizeAiHtml + sanitizeFreeText
│   ├── pdfExtract.js     extracción de texto de PDF en el cliente
│   └── exportUtils.js    exportación a PDF/Excel
├── hooks/
│   └── useCompanyProfile.js    puente API con GET/PUT /api/profile
├── components/           Logo, Sidebar, OnboardingModal, PlanCards, HistoryBrowser...
├── layouts/
│   └── DashboardLayout.jsx     sidebar + onboarding + outlet
└── pages/
    ├── Landing.jsx             home pública (ruta /)
    ├── Login, Activate, Reveal, ResetPassword   (fuera del dashboard)
    └── Home, Cuestionario, ExcelHub, excel/*, Historial, Calculadoras,
        Informes, Configuracion          (dentro de /app)
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