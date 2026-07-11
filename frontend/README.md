# Nokfi — Frontend

React + Vite + Tailwind CSS + PWA. Sigue el contrato de API documentado en
`nokfi_api_contract.md` y la definición completa en `nokfi_proyecto.md`
(secciones 19, 20 y 21).

---

## Instalación

```bash
npm install
cp .env.example .env
# Edita .env y pon la URL de tu backend (VITE_API_URL)
npm run dev
```

Se abre en `http://localhost:5173`.

## Build de producción

```bash
npm run build
```

Genera la carpeta `dist/` lista para servir con Nginx (o cualquier servidor
de archivos estáticos). Incluye el manifest de PWA y el service worker.

---

## Estructura

```
src/
├── main.jsx              punto de entrada
├── App.jsx                todas las rutas
├── index.css               variables de tema + estilos base
├── context/                 Auth, Theme, Lang (React Context)
├── middleware/
│   ├── api.js                único punto de comunicación con el backend
│   ├── fingerprint.js         genera el device fingerprint (SHA-256, 64 chars)
│   ├── pdfExtract.js           extracción de texto de PDF en el cliente
│   └── exportUtils.js          exportación a PDF/Excel
├── hooks/
│   └── useCompanyProfile.js    perfil de empresa (ver limitación abajo)
├── components/               Logo, Sidebar, OnboardingModal, ExcelSubModule...
├── layouts/
│   └── DashboardLayout.jsx    sidebar + onboarding + outlet
└── pages/
    ├── Login.jsx, ResetDevice.jsx     (fuera del dashboard)
    └── Home, Cuestionario, ExcelHub, excel/*, Historial, Calculadoras,
        Informes, Configuracion.jsx    (dentro de /app)
```

---

## ⚠️ Limitaciones conocidas (requieren ampliar el backend)

Estas dos cosas están documentadas explícitamente en el código con
comentarios `LIMITACIÓN CONOCIDA` en los archivos correspondientes:

### 1. Perfil de empresa (`hooks/useCompanyProfile.js`)
El backend actual no tiene un endpoint `/api/profile`. El perfil del
onboarding (nombre de empresa, sector, tamaño, gastos) se guarda en
`localStorage` del navegador — **no viaja entre dispositivos ni sobrevive
a un cambio de navegador**. Cuando se añada el endpoint real en el
backend, sustituir este hook por llamadas a `middleware/api.js` sin tocar
los componentes que lo consumen (mismo shape de datos).

### 2. Historial de análisis (`pages/Historial.jsx`, `pages/Informes.jsx`)
El backend no persiste los análisis generados (no hay tabla `analyses`
ni endpoints asociados). Estas pantallas muestran el estado vacío
definido en la sección 14 del proyecto. La exportación de un análisis
concreto SÍ funciona (PDF/Excel), justo después de generarlo, desde
cada subapartado — lo que falta es poder volver a consultarlo más tarde.

**Recomendación para cuando se amplíe el backend:** añadir tabla
`analyses` (license_id, type, input_summary, ai_response, created_at) y
endpoints `POST /api/analyses` (guardar) + `GET /api/analyses` (listar).

---

## ⚠️ Auditoría de seguridad — dependencia `xlsx` (SheetJS)

`npm audit` reporta una vulnerabilidad **high** en `xlsx` (ReDoS y prototype
pollution — GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9), **sin parche
disponible** a fecha de esta auditoría.

**Análisis de riesgo real para Nokfi:**
- `xlsx` se ejecuta **enteramente en el navegador del propio usuario**, nunca
  en el servidor — el backend no procesa archivos Excel en ningún momento
  (confirmado en la auditoría: no hay `multer` ni endpoints de subida de
  archivos en el backend).
- El escenario de explotación (ReDoS) requiere que la víctima abra **su
  propio archivo Excel malicioso** — es decir, el atacante y la víctima son
  la misma persona en el caso típico (self-DoS de su propia pestaña), o
  requiere ingeniería social para que un usuario abra un Excel de un
  tercero malicioso dentro de Nokfi.
- Impacto máximo realista: la pestaña del navegador se congela/cuelga
  (Denial of Service local del cliente). No hay ejecución de código, no hay
  acceso a datos de otros usuarios, no hay compromiso del servidor.

**Decisión:** se mantiene `xlsx` porque no hay alternativa madura con la
misma cobertura de formatos (.xlsx/.xls/.csv) y sin el mismo problema — la
mayoría de librerías del ecosistema JS para Excel comparten limitaciones
similares. Se documenta el riesgo residual aceptado. Revisar este apartado
periódicamente por si SheetJS publica un parche.

## Sobre el fingerprint y la seguridad

`middleware/fingerprint.js` genera el hash que el backend espera
(sección 7 del contrato de API). Es determinista: mismas señales del
navegador → mismo hash, así no hace falta guardarlo en `localStorage`
(evita dejarlo a la vista para una falsificación trivial).

El token de sesión vive en memoria + `sessionStorage` (se borra al
cerrar la pestaña) — es un balance entre seguridad y no forzar login en
cada refresco de página.

---

## Regla de contraste (sección 21 del proyecto)

Todo componente nuevo debe usar las variables CSS de `index.css`
(`var(--text-primary)`, `var(--surface-1)`, etc.), nunca colores hex
fijos. Antes de dar por terminada una pantalla, probarla visualmente en
ambos temas (oscuro y claro).
