# Nokfi — Finanzas claras para autónomos y pymes

Nokfi lee tus facturas, te dice cuánto apartar para Hacienda, quién te debe y
cómo irá tu caja, y te da un diagnóstico del negocio con un plan de acción.
Web (PWA) en 6 idiomas y API para automatizaciones.

**En producción** 🟢 — `https://nokfi.app/` (HTTPS, Cloudflare, cobros reales con
Stripe).

## Qué hace Nokfi

**Para el negocio** (`/app`)
- **Libro de facturas** — a mano o **leídas por IA** (fotos y PDF, revisión en
  tarjetas junto al documento). Las **facturas electrónicas** (Facturae, UBL,
  Factur-X/ZUGFeRD) se leen al instante, sin IA.
- **Impuestos** — estimación del modelo 303 (IVA) y 130 (IRPF), lo que llevas
  apartado y el **calendario fiscal** con avisos por email.
- **Cobros** — facturas vencidas, email de reclamación redactado por IA y
  recordatorios automáticos.
- **Fugas, previsión de caja a 90 días y comparativa con tu sector** (datos INE).
- **Diagnóstico** — 30 preguntas (Sí / A medias / No / No aplica) → nota de salud
  calculada con reglas fijas + informe con prioridades y plan enlazado a la app.
- **Análisis de Excel, carpetas y comparación de periodos** con IA.
- **Asistente** con el contexto de tu libro.
- **Calculadoras españolas** — IVA, retención IRPF, cuota de autónomos, coste de
  un empleado, precio por hora, punto de equilibrio, márgenes y ROI.
- **Enlace de solo lectura para la gestoría** y exportación a PDF, Excel, Word,
  CSV, ODS, ODT, PowerPoint y JSON.

**Para desarrolladores** (`/app/dev`, planes Pro y Max)
- **API REST** `/api/v1` (análisis, lectura de facturas, herramientas fiscales sin
  IA: NIF, IVA, retención, 130, trimestre, calendario), con modo asíncrono,
  `Idempotency-Key` y claves de prueba `nk_test_`.
- **Webhooks firmados** (HMAC, reintentos) y servidor **MCP** (`/api/mcp`).
- **Nodo de n8n**: [`n8n-nodes-nokfi`](https://www.npmjs.com/package/n8n-nodes-nokfi)
  (código en `integrations/n8n`).
- Panel con claves, Playground, registro de llamadas y clientes.

## Modelo de negocio

**Suscripción mensual** vía Stripe (sin permanencia, cambios a fin de periodo):

| Plan | Precio/mes | Análisis IA/día | Extra |
|------|-----------|-----------------|-------|
| **Mini** | 5 € | 10 | **14 días gratis** |
| **Pro** | 20 € | 50 | API para automatizaciones |
| **Max** | 50 € | 130 | API + soporte prioritario (< 4 h laborables) |

- Stripe: **3 Products** (Mini/Pro/Max), un Price mensual EUR cada uno; Customer
  Portal con cambios a fin de periodo. El catálogo público
  `GET /api/payments/plans` evita que la web y Stripe muestren precios distintos.
- **Acceso**: email + clave de licencia (`XXXX-XXXX-XXXX-XXXX`) + contraseña
  (scrypt). Tokens hasheados en reposo.

## Stack

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 22 + Express + SQLite (`better-sqlite3`) |
| IA | Groq → Cloudflare Workers AI → Cerebras (en cadena; proveedores que no entrenan con los datos) |
| Frontend | React + Vite + Tailwind CSS + PWA, i18n (es, en, fr, it, de, pl) |
| Gráficas | Recharts |
| Archivos | `xlsx` (SheetJS), `jspdf`, `pdfjs-dist`, `docx`, `pptxgenjs` |
| Pagos | Stripe |
| Email | Resend |
| Infra | Ubuntu 24.04 · PM2 · Nginx · Cloudflare (Full strict) · copia diaria de la BD |

## Estructura

```
nokfi/
├── backend/            # API — Express + SQLite; test/ (e2e 362/362)
├── frontend/           # PWA — React + Vite + Tailwind (build same-origin /api)
├── integrations/n8n/   # nodo de n8n (publicado en npm)
├── deploy/             # nginx-nokfi.conf + nginx-cloudflare-realip.conf
├── docs/               # proyecto, API, despliegue
└── README.md
```

## Documentación

| Doc | Contenido |
|-----|-----------|
| [`docs/proyecto.md`](docs/proyecto.md) | Visión de producto, modelo de negocio, esquema de DB, seguridad |
| [`docs/api.md`](docs/api.md) | Contrato backend ↔ frontend |
| [`docs/deploy.md`](docs/deploy.md) | Despliegue, Cloudflare, Stripe y operación del VPS |
| `https://nokfi.app/api-docs` | Documentación pública de la API v1 (OpenAPI en `/api/v1/openapi.json`) |

## Arranque rápido (desarrollo local)

### Backend
```bash
cd backend
cp .env.example .env   # ADMIN_SECRET (≥32), claves de IA, Stripe, Resend, PLAN_PRICE_*_EUR
npm install --omit=optional
npm run dev            # → http://localhost:3001
```
Tests: `cd backend && node test/e2e.test.js` (**362/362**, sin red: la IA se simula).

### Frontend
```bash
cd frontend
npm install
npm run dev            # → http://localhost:5173
```

> El `.env` nunca se sube al repositorio. **`DB_PATH=./db/nokfi.db` es
> relativa**: arranca el backend desde su carpeta. Las capturas de la landing se
> regeneran con `node backend/scripts/landing-screens.js` (cuenta de ejemplo local).

## Estado (octubre de 2026)

- ✅ En producción con pagos reales, emails y copia diaria de la base de datos
- ✅ Sesiones 6-10 completadas: libro, impuestos, cobros, previsión, diagnóstico,
  asistente con datos, API v1 + webhooks + MCP + nodo n8n, pulido de la interfaz
- ✅ e2e **362/362**
- 🔜 Factura electrónica B2B y VERI\*FACTU (app y API), posicionamiento, y
  apps para Play Store y App Store

## Donaciones — Apoya el proyecto

Si Nokfi te resulta útil y quieres contribuir al desarrollo, aceptamos donaciones
en cripto *(direcciones personales, no relacionadas con el producto de pago)*:

| Cripto | Red | Dirección |
|--------|-----|-----------|
| **Bitcoin** (BTC) | Bitcoin | `bc1qdndnce0d9t75r5thmerz3m85fnk2pa3jax95qk` |
| **Ethereum** (ETH) | Ethereum / L2 | `0x8Ea6a5261112cf459d584F68D0410f2995Af0241` |
| **Litecoin** (LTC) | Litecoin | `ltc1qk75rl0letzmy88yh6cm86tju8k5g526lu2zmt0` |

## Licencia

Software propietario. Todos los derechos reservados. Política de licencias y
estado en [`docs/proyecto.md`](docs/proyecto.md).