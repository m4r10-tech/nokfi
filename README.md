# Nokfi — Análisis financiero con IA para autónomos y pymes

SaaS de diagnóstico financiero que combina un cuestionario interactivo con análisis de archivos Excel/PDF mediante inteligencia artificial, generando informes estilo consultoría con recomendaciones concretas.

## Qué hace Nokfi

- **Cuestionario de diagnóstico** — 5 bloques × 6 preguntas Sí/No sobre la salud financiera del negocio
- **Análisis de Excel/PDF con IA** — 6 subapartados: stock, ventas, servicios, entrada de productos, caja y profit total
- **Informes exportables** — PDF y Excel con cifras, gráficas y recomendaciones
- **Calculadoras financieras** — punto de equilibrio, margen, ROI

## Modelo de negocio

Pago único de por vida (sin suscripción). Licencia vinculada a un dispositivo fijo mediante fingerprint del navegador — una compra, un dispositivo. Activación por email + clave.

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 22 + Express + SQLite (`better-sqlite3`) |
| IA | Google Gemini (`gemini-flash-latest`) |
| Frontend | React + Vite + Tailwind CSS + PWA |
| Gráficas | Recharts |
| Excel/PDF | `xlsx` (SheetJS), `jspdf`, `pdfjs-dist` |
| Pagos | Stripe, PayPal, Revolut Business, Coinbase Commerce |
| Email | Resend |
| Despliegue | Ubuntu 24.04 + PM2 + Nginx |

## Estructura del proyecto

```
nokfi/
├── backend/            # API REST — Express + SQLite + Gemini
│   ├── server.js       # Punto de entrada, CORS, Helmet, rate limiting
│   ├── routes/         # auth, admin, payments (webhooks)
│   ├── middleware/      # sanitize (DOMPurify), auth (JWT)
│   ├── utils/          # database.js, exportUtils.js, gemini.js
│   └── db/             # Base de datos SQLite
├── frontend/           # PWA — React + Vite + Tailwind
│   ├── src/
│   │   ├── components/ # Sidebar, Logo, ExcelSubModule, Calculadoras...
│   │   ├── pages/      # Login, Dashboard, Cuestionario, Historial...
│   │   ├── context/    # AuthContext, ThemeContext, LangContext
│   │   └── hooks/      # useApi, useCompanyProfile...
│   └── public/icons/   # Iconos PWA (192, 512, favicon, apple-touch)
├── md/                 # Documentación
│   ├── nokfi_proyecto.md         # Documento maestro (21 secciones)
│   ├── nokfi_api_contract.md     # Contrato de API (fuente de verdad)
│   └── nokfi_reparto_beneficios.md
└── README.md           # Este documento
```

## Arranque rápido (desarrollo local)

### Backend

```bash
cd backend
cp .env.example .env   # Editar .env con tus claves (Gemini, Stripe, etc.)
npm install
node server.js         # Arranca en http://localhost:3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # Arranca en http://localhost:5173
```

> **Importante:** El `.env` nunca se sube al repositorio. Usa `.env.example` como referencia de las variables necesarias.

## Seguridad

Auditoría OWASP Top 10 + ASVS completada con **14 hallazgos corregidos**. `npm audit` del backend: **0 vulnerabilidades**. Detalles en los README de cada carpeta y en `md/nokfi_proyecto.md` sección 17.

## Estado del proyecto

✅ Backend funcional en VPS de pruebas (PM2)  
✅ Frontend con build exitoso y PWA configurada  
✅ Webhook de Stripe probado end-to-end en sandbox  
✅ Panel admin, métricas, anti-sharing funcionando  
⏳ Dominio y SSL pendientes de contratar  
⏳ Webhooks de PayPal/Revolut/Coinbase sin probar aún  

## Donaciones — Apoya el proyecto

Si Nokfi te resulta útil y quieres contribuir al desarrollo, aceptamos donaciones en cripto:

| Cripto | Red | Dirección |
|--------|-----|-----------|
| **Bitcoin** (BTC) | Bitcoin | `bc1qdndnce0d9t75r5thmerz3m85fnk2pa3jax95qk` |
| **Ethereum** (ETH) | Ethereum / L2 | `0x8Ea6a5261112cf459d584F68D0410f2995Af0241` |
| **Litecoin** (LTC) | Litecoin | `ltc1qk75rl0letzmy88yh6cm86tju8k5g526lu2zmt0` |

## Licencia

Software propietario. Todos los derechos reservados. Consultar `md/nokfi_proyecto.md` sección 18 para la política de licencias completa.