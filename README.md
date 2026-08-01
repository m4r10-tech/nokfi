# Nokfi — Análisis financiero con IA para autónomos y pymes

SaaS de diagnóstico financiero que combina un cuestionario interactivo con análisis de archivos Excel/PDF mediante inteligencia artificial, generando informes estilo consultoría con recomendaciones concretas.

## Qué hace Nokfi

- **Cuestionario de diagnóstico** — 5 bloques × 6 preguntas Sí/No sobre la salud financiera del negocio
- **Análisis de Excel/PDF con IA** — 6 subapartados: stock, ventas, servicios, entrada de productos, caja y profit total
- **Informes exportables** — PDF y Excel con cifras, gráficas y recomendaciones
- **Calculadoras financieras** — punto de equilibrio, margen, ROI

## Modelo de negocio (Fase 3)

**Suscripción mensual** vía Stripe (sin permanencia, cancelable a fin de periodo):

| Plan | Precio/mes | Análisis IA/día | Trial |
|------|-----------|-----------------|-------|
| **mini** | 5 € | 10 | **14 días gratis** (tarjeta obligatoria) |
| **pro** | 20 € | 50 | — |
| **max** | 50 € | 130 | — |

- Precios env-driven (`PLAN_PRICE_MINI_EUR` / `_PRO_EUR` / `_MAX_EUR`). El frontend los obtiene del endpoint público `GET /api/payments/plans` — nunca hardcodeados (anti-drift: la web y Stripe cobran lo mismo).
- **Auth: email + clave (`XXXX-XXXX-XXXX-XXXX`) + contraseña** (hash scrypt). El viejo modelo de device-fingerprint se eliminó; el anti-sharing es la **cuota diaria de IA por licencia** (una clave compartida se agota entre sus usuarios).

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 22 + Express + SQLite (`better-sqlite3`) |
| IA | Google Gemini (`gemini-flash-latest`) |
| Frontend | React + Vite + Tailwind CSS + PWA |
| Gráficas | Recharts |
| Excel/PDF | `xlsx` (SheetJS), `jspdf`, `pdfjs-dist` |
| Pagos | **Stripe** (suscripción mensual; PayPal/Revolut/Coinbase retirados) |
| Email | Resend |
| Despliegue | Ubuntu 24.04 + PM2 + Nginx (pendiente) |

## Estructura del proyecto

```
nokfi/
├── backend/            # API REST — Express + SQLite + Gemini
│   ├── server.js       # Punto de entrada: Helmet, CORS, rate limiters, raw webhook
│   ├── config/         # plans.js (precios/cuotas/trial) + stripe-version.js
│   ├── db/             # database.js (esquema, migraciones, acceso a datos)
│   ├── middleware/     # requireLicense.js
│   ├── routes/         # auth.js, proxy.js, payments.js, webhooks.js, admin.js
│   ├── utils/          # password.js (scrypt), mailer.js (Resend)
│   └── test/           # e2e.test.js (61/61 PASS)
├── frontend/           # PWA — React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/      # Login, Reveal, ResetPassword, Pricing, Home, Cuestionario,
│   │   │               # ExcelHub + excel/ (6 subapartados), Historial, Calculadoras,
│   │   │               # Informes, Configuracion
│   │   ├── middleware/ # api.js (cliente HTTP), sanitize.js, exportUtils.js, pdfExtract.js
│   │   ├── context/    # AuthContext, ThemeContext, LangContext
│   │   └── hooks/      # useApi, useCompanyProfile...
│   └── public/icons/   # Iconos PWA (192, 512, favicon, apple-touch)
├── *.md                # Documentación (en la raíz del repo)
│   ├── nokfi_proyecto.md     # Documento maestro (21 secciones)
│   ├── nokfi_api_contract.md # Contrato de API (fuente de verdad backend↔frontend)
│   ├── nokfi_contexto_claude_code.md # Panorama para retomar el trabajo
│   └── handoff.md           # Estado de la última sesión + deudas abiertas
└── README.md          # Este documento
```

## Arranque rápido (desarrollo local)

### Backend

```bash
cd backend
cp .env.example .env   # Editar .env: ADMIN_SECRET (≥32), Gemini, Stripe, email, PLAN_PRICE_*_EUR
npm install
npm run dev            # o: node server.js  → http://localhost:3001
```

Para verificar: `cd backend && node test/e2e.test.js` (61/61 PASS offline).

### Frontend

```bash
cd frontend
npm install
npm run dev            # → http://localhost:5173
```

> **Importante:** El `.env` nunca se sube al repositorio (`.gitignore`). Usa `.env.example` como referencia de las variables necesarias. **`DB_PATH=./db/nokfi.db` es relativa** — arranca el backend desde su directorio.

## Seguridad

Auditoría OWASP Top 10 + ASVS completada con **14 hallazgos corregidos**. `npm audit` del backend: **0 vulnerabilidades**. Detalles y estado del frontend en `nokfi_contexto_claude_code.md` (sección 5).

## Estado del proyecto

- ✅ Backend completo, **61/61 e2e PASS**, desplegado en VPS de pruebas (PM2) y funcional
- ✅ Frontend con build exitoso y PWA configurada (no servido por el VPS todavía)
- ✅ Webhook de Stripe probado end-to-end en sandbox; anti-sharing por cuota diaria
- ⏳ **Stripe en el VPS necesita claves reales** (verificación de empresa pendiente)
- ⏳ Dominio + Nginx + SSL pendientes de desplegar
- 🪹 PayPal / Revolut / Coinbase retirados (Stripe-only)

Para el detalle de deudas y siguientes pasos ver `handoff.md`.

## Donaciones — Apoya el proyecto

Si Nokfi te resulta útil y quieres contribuir al desarrollo, aceptamos donaciones en cripto *(direcciones personales, no relacionadas con el producto de pago)*:

| Cripto | Red | Dirección |
|--------|-----|-----------|
| **Bitcoin** (BTC) | Bitcoin | `bc1qdndnce0d9t75r5thmerz3m85fnk2pa3jax95qk` |
| **Ethereum** (ETH) | Ethereum / L2 | `0x8Ea6a5261112cf459d584F68D0410f2995Af0241` |
| **Litecoin** (LTC) | Litecoin | `ltc1qk75rl0letzmy88yh6cm86tju8k5g526lu2zmt0` |

## Licencia

Software propietario. Todos los derechos reservados. Ver `nokfi_proyecto.md` (sección 15) para la política de licencias y `handoff.md` para el estado actual.
