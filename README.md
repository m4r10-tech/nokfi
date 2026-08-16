# Nokfi — Análisis financiero con IA para autónomos y pymes

SaaS de diagnóstico financiero que combina un cuestionario interactivo con el
análisis de archivos Excel/PDF mediante IA, generando informes estilo consultoría
con recomendaciones concretas y exportables a PDF/Excel.

**En producción** 🟢 — `https://nokfi.app/` (HTTPS, Cloudflare edge, cobros
reales Stripe).

## Qué hace Nokfi

- **Cuestionario de diagnóstico** — 5 bloques × 6 preguntas Sí/No sobre la salud
  financiera del negocio
- **Análisis de Excel/PDF con IA** — 6 subapartados: stock, ventas, servicios,
  entrada de productos, caja y profit total
- **Informes exportables** — PDF y Excel con cifras, gráficas y recomendaciones
- **Calculadoras financieras** — punto de equilibrio, margen, ROI

## Modelo de negocio

**Suscripción mensual** vía Stripe (sin permanencia, cancelable a fin de periodo):

| Plan | Precio/mes | Análisis IA/día | Trial |
|------|-----------|-----------------|-------|
| **mini** | 5 € | 10 | **14 días gratis** (tarjeta obligatoria) |
| **pro** | 20 € | 50 | — |
| **max** | 50 € | 130 | — |

- Modelo de billing Stripe: **3 Products separados** (Mini/Pro/Max), un Price
  recurrente mensual EUR cada uno, Customer Portal con prorrateo a fin de periodo
  (cambiar de plan = €0 hoy, se aplica al terminar el periodo en curso).
- Precios env-driven **y** vía catálogo público `GET /api/payments/plans` — el
  frontend nunca hardcodea precios (anti-drift: la web y Stripe cobran lo mismo).
- **Auth**: email + clave de licencia (`XXXX-XXXX-XXXX-XXXX`) + contraseña (hash
  scrypt). Anti-sharing por **cuota diaria de IA por licencia**.

## Stack

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 22 + Express + SQLite (`better-sqlite3`) |
| IA | Google Gemini (`gemini-flash-latest`) |
| Frontend | React + Vite + Tailwind CSS + PWA |
| Gráficas | Recharts |
| Excel/PDF | `xlsx` (SheetJS), `jspdf`, `pdfjs-dist` |
| Pagos | **Stripe** (PayPal/Revolut/Coinbase retirados) |
| Email | Resend |
| Infra | Ubuntu 24.04 · PM2 · Nginx · Cloudflare (edge, Full strict) |

## Estructura

```
nokfi/
├── backend/            # API REST — Express + SQLite + Gemini (e2e 94/94)
├── frontend/           # PWA — React + Vite + Tailwind (build same-origin /api)
├── deploy/             # nginx-nokfi.conf (site) + nginx-cloudflare-realip.conf
├── docs/               # documentación (proyecto, API, deploy)
└── README.md           # este archivo
```

## Documentación

| Doc | Contenido |
|-----|-----------|
| [`docs/proyecto.md`](docs/proyecto.md) | Visión de producto, modelo de negocio, esquema de DB, seguridad, diseño |
| [`docs/api.md`](docs/api.md) | **Contrato Backend↔Frontend** (fuente de verdad técnica) |
| [`docs/deploy.md`](docs/deploy.md) | Despliegue, Cloudflare, Stripe, operación del VPS, deudas |
| [`frontend/README.md`](frontend/README.md) | Frontend: instalar, build, auditoría `xlsx` |

## Arranque rápido (desarrollo local)

### Backend
```bash
cd backend
cp .env.example .env   # editar: ADMIN_SECRET(≥32), Gemini, Stripe, email, PLAN_PRICE_*_EUR
npm install
npm run dev            # → http://localhost:3001
```
Verifica: `cd backend && node test/e2e.test.js` (**94/94 PASS offline**).

### Frontend
```bash
cd frontend
npm install
npm run dev            # → http://localhost:5173
```

> El `.env` nunca se sube al repositorio (gitignore). Usa `.env.example` como
> referencia. **`DB_PATH=./db/nokfi.db` es relativa** — arranca el backend desde
> su directorio.

## Estado

- ✅ Backend completo, **94/94 e2e PASS**, desplegado y funcional
- ✅ Frontend con build exitoso y PWA (bundle same-origin `/api`, sin IP fija)
- ✅ **Producción HTTPS viva** con Cloudflare (Full strict) y Let's Encrypt
- ✅ **Stripe LIVE cobrando de verdad** (pago real verificado, trial 14d)
- ✅ Mailer Resend funcionando (`noreply@nokfi.app`)
- ✅ Deudas I (validar plan) y K (invoice del trial) resueltas

Deudas abiertas (opcionales, no bloqueantes) y operación: ver
[`docs/deploy.md`](docs/deploy.md).

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