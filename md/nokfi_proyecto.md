# Nokfi — Documento de Definición del Proyecto
> Estado: definición completa · Backend implementado (pendiente de despliegue y pruebas reales) · Frontend y landing pendientes · Última actualización: junio 2026

---

## 1. Visión general

Software SaaS de análisis financiero para autónomos y pymes españolas. Combina un cuestionario de diagnóstico interactivo con análisis de archivos Excel mediante IA, generando informes estilo consultoría con recomendaciones concretas para mejorar la salud financiera del negocio.

Desarrollado por un equipo de 3 personas con perfiles complementarios: programación, ciberseguridad y finanzas.

---

## 2. Modelo de negocio

### Distribución
- **Landing page pública** (`vuestrodominio.com`) donde se explica el producto, se elige plan y se realiza el pago
- **Web app protegida** (`app.vuestrodominio.com`) a la que solo se accede con clave válida
- Formato **PWA** (Progressive Web App): se puede añadir al escritorio o móvil como si fuera una app nativa, sin pasar por App Store ni Google Play, sin instalación real
- No hay versión de escritorio descargable — todo corre en el navegador y en vuestro VPS

### Por qué web app y no escritorio (Electron)
- Las actualizaciones se despliegan en el servidor y todos los usuarios las reciben automáticamente
- El anti-bypass se gestiona 100% en el servidor, donde vosotros tenéis el control
- Un ejecutable de escritorio se puede decompilar; una web app con lógica de validación en servidor no
- El software requiere conexión a internet de todas formas (llama a la IA), así que no hay ventaja en trabajar offline

### Planes de precio
| Plan | Precio | Dispositivos | Funciones |
|------|--------|--------------|-----------|
| Básico | Por definir | 1 | Cuestionario + análisis Excel + informe PDF/Excel |
| Pro | Por definir | 1 | Todo lo anterior + historial + calculadoras + exportación avanzada |

> Los precios exactos se definen en una fase posterior. Una clave = un dispositivo fijo, sin excepciones.

---

## 3. Flujo completo de venta

```
Landing page pública
        ↓
[Comprar ahora] → selección de plan
        ↓
Pasarela de pago (Stripe / PayPal)
        ↓
Webhook del servidor → genera clave → vincula email del comprador
        ↓
Pantalla de revelación de clave (token de un solo uso, válido 15 minutos)
        ↓
Email automático de respaldo con la clave al email del comprador
        ↓
Usuario accede a app.vuestrodominio.com
        ↓
Pantalla de login (Email + Clave + Device fingerprint)
        ↓
Servidor valida los 3 factores → sesión activa → Dashboard
```

### Qué es el email automático de respaldo
Cuando el usuario compra, introduce su email en el checkout. El servidor, sin intervención manual de vuestro equipo, le envía automáticamente un correo con su clave `XXXX-XXXX-XXXX-XXXX`. Sirve como seguro por si el usuario cierra la pestaña de revelación antes de copiar la clave o le falla la conexión. Lo envía el servidor via **SendGrid** o **Resend** con vuestro dominio como remitente.

---

## 4. Pasarelas de pago

### Métodos implementados (fase inicial)
- **Stripe** — tarjeta de crédito/débito, Apple Pay, Google Pay. Comisión: ~1.5% + 0.25€ en tarjetas europeas. El dinero llega a vuestra cuenta bancaria automáticamente cada 7 días.
- **PayPal** — cuenta PayPal Business (gratuita). Comisión: ~3.4% + 0.35€ por transacción en Europa.
- **Revolut Business (Merchant API)** — tarjeta, Apple Pay, Google Pay. Comisión: ~1% + 0.20€ en tarjetas europeas de particulares (la más baja de las cuatro opciones). Requiere cuenta Revolut Business y solicitar acceso a Merchant API. El dinero llega al saldo de la cuenta Revolut, desde donde se transfiere al banco manual o automáticamente (transferencias programadas disponibles).

### Métodos para fases posteriores
- **Crypto (Coinbase Commerce)** — BTC, ETH, USDC, LTC. Sin comisión de plataforma, solo fees de red. Se deja para más adelante por complejidad fiscal.

### Transferencia bancaria — descartada
Se evaluó y se descartó deliberadamente como método de pago. Una transferencia bancaria normal no tiene webhook — no hay forma de que el banco notifique automáticamente al servidor que un pago se ha completado. Todo el sistema de generación de licencias se apoya en que el proveedor de pago confirma la transacción al servidor en tiempo real mediante firma criptográfica verificable; un banco no ofrece ese mecanismo. Aceptarla habría requerido un proceso manual de verificación por parte del equipo, incompatible con el principio de "0 intervención manual" del flujo de venta.

### Lo que necesita hacer el equipo (fuera del código)
- Abrir una cuenta **Stripe Business** (DNI + datos bancarios + descripción del negocio)
- Abrir una cuenta **PayPal Business** (datos personales o de empresa + cuenta bancaria)
- Abrir una cuenta **Revolut Business** y solicitar acceso a la Merchant API (puede requerir unos días de revisión)
- Proporcionar las API keys al desarrollador para meterlas en el `.env` del servidor

### Seguridad anti-bypass del pago
- La clave **nunca existe antes del pago confirmado** — se genera solo cuando el webhook del proveedor llega al servidor con firma criptográfica válida
- La URL de revelación funciona exactamente una vez con un token temporal de 15 minutos
- No hay ningún endpoint que devuelva una clave sin haber validado el pago previamente en el servidor

---

## 5. Sistema de autenticación y seguridad

### Formato de clave
```
XXXX-XXXX-XXXX-XXXX
```
Ejemplo: `A3F2-9C1E-B847-D205`
Generada criptográficamente con `crypto.randomBytes`, unicidad garantizada en base de datos.

### Login — triple factor obligatorio
Los tres elementos deben coincidir exactamente con la base de datos:
1. **Email** — el introducido en el checkout en el momento del pago
2. **Clave** `XXXX-XXXX-XXXX-XXXX`
3. **Device fingerprint** — huella digital del dispositivo generada en el navegador

Fallo en cualquiera de los tres = acceso denegado.

### Device fingerprint — cómo funciona
Se genera en el navegador combinando: User-Agent, resolución de pantalla, timezone, idioma del sistema, canvas fingerprint y número de núcleos CPU. Se hashea con SHA-256 en el cliente y se envía al servidor. La primera vez que se activa una clave, ese fingerprint queda grabado en la base de datos y es inmutable. En cada login posterior se recalcula y se compara. Si el dispositivo cambia → bloqueado aunque tenga email y clave correctos.

### Una clave = un dispositivo
Sin opción de 1-5 dispositivos. Cada clave está vinculada a exactamente un device fingerprint. Esto elimina el sharing de forma estructural.

### Capas de seguridad anti-bypass del login

**Capa 1 — Frontend sin rutas accesibles**
La app arranca siempre en la pantalla de login. No existe ruta, parámetro URL ni botón que salte esa pantalla. El dashboard solo se monta en memoria si existe una sesión válida verificada por el servidor.

**Capa 2 — Validación en cada petición**
Cada llamada al backend (análisis IA, carga de datos, exportar PDF, calculadoras...) requiere un token de sesión válido. Sin token válido → 401, la app no muestra nada.

**Capa 3 — Device fingerprint en cada sesión**
El token de sesión está vinculado al device fingerprint. Aunque alguien robe el token, no puede usarlo desde otro dispositivo.

**Capa 4 — Tokens con rotación**
Los tokens de sesión expiran cada 30 días y se rotan en cada verificación activa.

**Capa 5 — Rate limiting agresivo**
Máximo 5 intentos fallidos de login por IP en 15 minutos → bloqueo temporal automático. Previene fuerza bruta.

**Capa 6 — Token de revelación de un solo uso**
La URL donde aparece la clave tras el pago funciona exactamente una vez durante 15 minutos. Después, la clave solo aparece parcialmente enmascarada en el perfil del usuario autenticado: `••••-••••-••••-AB3F`.

### Pantalla de revelación de clave
- Aparece únicamente tras webhook de pago confirmado
- Toggle para mostrar/ocultar la clave completa
- Botón de copiar al portapapeles
- Aviso de que es la única vez que se muestra completa
- Timer visible de 15 minutos hasta que expira el token de revelación

---

## 6. Arquitectura técnica

### Stack
- **Frontend** — React (Vite) · PWA · Tailwind CSS
- **Backend** — Node.js + Express
- **Base de datos** — SQLite (con better-sqlite3) en el VPS
- **Servidor** — VPS propio ya preparado
- **Email transaccional** — SendGrid o Resend
- **Pasarela de pago** — Stripe + PayPal + Revolut (+ Coinbase Commerce en fase 2)

### Estructura real del proyecto

> Actualizado tras la implementación del backend. Difiere ligeramente de la planificación inicial: `payments.js` (creación de checkout) y `webhooks.js` (confirmación de pago) se separaron en dos routers independientes para que `server.js` pueda aplicar `express.raw()` solo donde es estrictamente necesario sin ambigüedad de montaje. También se añadió una carpeta `utils/` con lógica compartida que no encajaba ni en rutas ni en acceso a datos.

```
/
├── backend/                           ✅ IMPLEMENTADO
│   ├── server.js                      ← servidor Express, ensambla todo, orden crítico de middlewares
│   ├── package.json                   ← dependencias reales: express, better-sqlite3, cors, helmet,
│   │                                     express-rate-limit, morgan, dotenv
│   ├── .env.example                   ← plantilla documentada de las 22 variables de entorno reales
│   ├── .gitignore                     ← protege .env, node_modules y la base de datos local
│   │
│   ├── db/
│   │   └── database.js                ← esquema SQLite completo + toda la capa de acceso a datos
│   │                                     (licencias, sesiones, pagos, reset tokens, audit log, stats)
│   │
│   ├── middleware/
│   │   └── requireLicense.js          ← verifica sesión + licencia activa + fingerprint en rutas protegidas
│   │
│   ├── routes/
│   │   ├── auth.js                    ← activate, login, verify, logout, request/confirm-device-reset
│   │   ├── admin.js                   ← CRUD de licencias, stats, audit log (protegido con ADMIN_SECRET)
│   │   ├── proxy.js                   ← proxy seguro hacia Google Gemini API (requiere sesión válida)
│   │   ├── payments.js                ← creación de checkout: Stripe, PayPal, Coinbase Commerce, Revolut
│   │   └── webhooks.js                ← confirmación de pago → genera licencia; gestión de chargebacks
│   │
│   └── utils/
│       ├── fingerprint.js             ← validación y derivación server-side del device fingerprint
│       ├── mailer.js                  ← envío de emails (SendGrid/Resend): clave, reset, revocación
│       └── paypalAuth.js              ← autenticación OAuth2 de PayPal, compartida entre checkout y webhooks
│
├── frontend/                          ⏳ PENDIENTE DE IMPLEMENTAR
│   └── src/
│       ├── pages/
│       │   ├── Login.jsx              ← pantalla de activación de clave
│       │   ├── Dashboard.jsx          ← app principal
│       │   └── Admin.jsx              ← panel admin interno
│       ├── components/                ← componentes reutilizables
│       ├── middleware/
│       │   └── api.js                 ← comunicación con el servidor
│       ├── hooks/
│       └── context/
│
└── landing/                           ⏳ PENDIENTE DE IMPLEMENTAR
                                          página web pública de venta
```

### Mapa de endpoints del backend implementado

| Método | Ruta | Protección | Función |
|--------|------|------------|---------|
| POST | `/api/auth/activate` | Pública | Primera vinculación de dispositivo a una licencia |
| POST | `/api/auth/login` | Pública | Login en dispositivo ya vinculado |
| POST | `/api/auth/verify` | Bearer token | Comprobar validez de sesión |
| POST | `/api/auth/logout` | Bearer token | Cerrar sesión actual |
| POST | `/api/auth/request-device-reset` | Pública | Solicitar email de reseteo de dispositivo |
| POST | `/api/auth/confirm-device-reset` | Token de un solo uso | Confirmar y vincular nuevo dispositivo |
| POST | `/api/proxy/ai` | Bearer token (requireLicense) | Proxy hacia Google Gemini API |
| POST | `/api/payments/stripe/create-checkout` | Pública | Crear sesión de pago Stripe |
| POST | `/api/payments/paypal/create-order` | Pública | Crear orden de pago PayPal |
| POST | `/api/payments/coinbase/create-charge` | Pública | Crear charge de Coinbase Commerce |
| POST | `/api/payments/revolut/create-order` | Pública | Crear order de Revolut Merchant API |
| POST | `/api/webhooks/stripe` | Firma HMAC (raw body) | Confirma pago Stripe → genera licencia |
| POST | `/api/webhooks/paypal` | Verificación API REST | Confirma pago PayPal → genera licencia |
| POST | `/api/webhooks/coinbase` | Firma HMAC (raw body) | Confirma pago Coinbase → genera licencia |
| POST | `/api/webhooks/revolut` | Firma HMAC (raw body) | Confirma pago Revolut → genera licencia |
| GET | `/api/admin/stats` | ADMIN_SECRET | Métricas de negocio (sección 16) |
| GET | `/api/admin/licenses` | ADMIN_SECRET | Listar todas las licencias |
| GET | `/api/admin/licenses/:id` | ADMIN_SECRET | Detalle de una licencia |
| POST | `/api/admin/licenses` | ADMIN_SECRET | Crear licencia manualmente |
| PUT | `/api/admin/licenses/:id` | ADMIN_SECRET | Editar estado/plan/notas |
| DELETE | `/api/admin/licenses/:id` | ADMIN_SECRET | Eliminar licencia permanentemente |
| POST | `/api/admin/licenses/:id/reset-device` | ADMIN_SECRET | Reseteo forzado sin límite anual |
| GET | `/api/admin/audit-log` | ADMIN_SECRET | Últimos eventos de auditoría |
| GET | `/health` | Pública | Health check |

### Variables de entorno del servidor (.env)

> Lista completa real, extraída directamente del código (22 variables). Plantilla documentada disponible en `backend/.env.example`.

```bash
# Servidor
PORT=3001
NODE_ENV=production

# Base de datos
DB_PATH=./db/nokfi.db

# Seguridad
ADMIN_SECRET=                          # generar con crypto.randomBytes(32).toString('hex')
ALLOWED_ORIGINS=https://app.nokfi.app,https://nokfi.app

# URLs públicas
APP_PUBLIC_URL=https://app.nokfi.app
LANDING_PUBLIC_URL=https://nokfi.app

# Precio de licencia (checkout + métricas)
LICENSE_PRICE_EUR=150

# IA — nunca expuesta al frontend (ver justificación abajo)
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash

# Email transaccional — elegir un proveedor
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=no-reply@nokfi.app
EMAIL_FROM_NAME=Nokfi
SENDGRID_API_KEY=SG....
RESEND_API_KEY=

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_ENV=sandbox                     # 'live' en producción
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...

# Revolut Business (Merchant API) — comisión más baja de las cuatro pasarelas
REVOLUT_ENV=sandbox                    # 'live' en producción
REVOLUT_API_KEY=...
REVOLUT_WEBHOOK_SIGNING_SECRET=...

# Coinbase Commerce (fase 2)
COINBASE_COMMERCE_API_KEY=
COINBASE_COMMERCE_WEBHOOK_SECRET=
```

### Por qué la API key de la IA está en el servidor
La clave de Google Gemini nunca sale del servidor. El frontend manda los datos al proxy del backend (`POST /api/proxy/ai`, protegido por `requireLicense`), el backend llama a la IA, y devuelve la respuesta. Si la API key estuviera en el frontend cualquier usuario podría inspeccionarla con las herramientas del navegador y usarla por su cuenta.

### Decisión de proveedor de IA: Google Gemini (free tier)

> Decisión tomada tras evaluar Anthropic Claude como alternativa. Documentada aquí con sus implicaciones para que quede constancia explícita.

Se eligió **Google Gemini** (modelo `gemini-2.5-flash`) en su **plan gratuito** en vez de Anthropic Claude, principalmente por coste cero mientras el volumen de uso se mantenga bajo. Esta decisión tiene dos implicaciones que el equipo asume conscientemente:

1. **Privacidad:** en el free tier de Gemini, Google puede usar los prompts enviados (es decir, los datos financieros de los clientes de Nokfi — facturas, gastos, ingresos) para entrenar sus modelos. Esto no ocurre en el tier de pago de Gemini ni en Anthropic. Si en el futuro esto se considera un riesgo inaceptable (por ejemplo, al crecer la base de clientes o por exigencias contractuales de algún cliente grande), la solución es activar facturación en el proyecto de Google Cloud, lo que elimina el free tier y el uso de los prompts para entrenamiento, pero convierte a Gemini en un servicio de pago.
2. **Límite de cuota:** el free tier limita a aproximadamente 1.500 peticiones al día **por proyecto completo**, no por cliente individual. Si Nokfi alcanza un volumen de uso que se acerque a ese límite, los análisis empezarán a fallar con un error de cuota agotada (`ai_quota_exceeded`) hasta el día siguiente, salvo que se active facturación.

El backend ya contempla este segundo caso de forma explícita: cuando Gemini devuelve un 429 (cuota agotada), el proxy responde con `503 { error: "ai_quota_exceeded" }` en vez de un error genérico, para que el frontend pueda mostrar un mensaje claro al usuario en vez de un fallo confuso.

### Estado de verificación del backend

El backend se escribió completo y se sometió a una revisión exhaustiva sin poder ejecutarlo en un entorno con red real (limitación del entorno de desarrollo usado durante la definición). La revisión aplicada a cada archivo fue:

1. **Sintaxis** — verificada con `node --check` en los 11 archivos `.js` (parsea el código sin ejecutarlo ni requerir dependencias instaladas)
2. **Consistencia de imports/exports** — verificación cruzada manual confirmando que cada función importada en cada archivo existe realmente con ese nombre exacto en el módulo de origen
3. **Lógica de flujos críticos** — revisión manual paso a paso de los flujos de activación, login, reseteo de dispositivo y webhooks de pago
4. **Seguridad** — auditoría de que ningún secreto está hardcodeado y todas las claves sensibles se leen de `process.env`

Lo que **falta** antes de considerar el backend production-ready:
- [ ] `npm install` real en un entorno con red (VPS) para confirmar que las versiones de dependencias declaradas en `package.json` son compatibles entre sí
- [ ] Arranque real del servidor y prueba manual de cada endpoint (con Postman, curl o similar)
- [ ] Pruebas con claves de sandbox de Stripe/PayPal/Coinbase/Revolut para validar el flujo de checkout → webhook → licencia de principio a fin
- [ ] Carga de un volumen de prueba de licencias para validar el rendimiento de las queries de `getStats()`



---

## 7. Base de datos — esquema real implementado

> Actualizado tras la implementación. Cambio respecto al plan inicial: no existe una tabla `devices` separada — el modelo real es **un dispositivo fijo por licencia** (sección 5), así que el fingerprint vive directamente como columna en `licenses` en vez de en una tabla aparte de muchos-a-uno. Se añadió `reset_tokens` para los enlaces de un solo uso de revelación de clave y reseteo de dispositivo.

| Tabla | Propósito | Columnas clave |
|-------|-----------|-----------------|
| `licenses` | Clave, email, estado, plan, dispositivo vinculado, datos de pago | `key`, `email`, `status`, `plan`, `device_fingerprint`, `last_device_reset`, `payment_provider`, `payment_ref`, `amount_eur` |
| `sessions` | Tokens de sesión activos | `token`, `license_id`, `fingerprint`, `expires_at` |
| `payment_events` | Idempotencia de webhooks — evita procesar el mismo evento dos veces | `provider`, `event_id` (único por proveedor), `processed` |
| `reset_tokens` | Tokens de un solo uso (revelación de clave / reseteo de dispositivo) | `token`, `purpose`, `license_id`, `used`, `expires_at` |
| `audit_log` | Registro de todos los eventos de seguridad | `event`, `license_id`, `fingerprint`, `ip`, `ts` |

### Por qué no hay tabla `devices` separada
El modelo de negocio (sección 5) es **una licencia = un dispositivo fijo**, no una relación uno-a-muchos. Guardar el fingerprint directamente en `licenses.device_fingerprint` simplifica las queries más frecuentes (verificar si una licencia ya tiene dispositivo, comparar el fingerprint en cada login) sin necesidad de joins, y refleja con más fidelidad la regla de negocio real: no puede haber "varios dispositivos pendientes de aprobar" para una misma licencia, solo existe `NULL` (sin vincular) o un valor (vinculado).

---

## 8. Panel de administración interno

Accesible solo con `ADMIN_SECRET` (comparación en tiempo constante para evitar timing attacks). Implementado en `routes/admin.js`. Funciones reales:

- Ver todas las licencias (`GET /api/admin/licenses`) y el detalle de una concreta (`GET /api/admin/licenses/:id`)
- Crear licencia manualmente (`POST /api/admin/licenses`) — por ejemplo, para cortesías o reposiciones tras soporte. Con flag opcional `notify: true` para enviar el email de la clave automáticamente
- Editar licencia (`PUT /api/admin/licenses/:id`) — cambiar `status`, `plan`, `notes` o `email`. Si se cambia a `revoked`, se limpian automáticamente las sesiones activas y se envía el email de revocación
- Eliminar licencia permanentemente (`DELETE /api/admin/licenses/:id`)
- Forzar reseteo de dispositivo (`POST /api/admin/licenses/:id/reset-device`) — sin el límite de 1 vez/año que aplica al usuario, para los casos de un segundo reseteo gestionado por soporte (sección 15.2)
- Ver métricas globales (`GET /api/admin/stats?period=30`) — activaciones, ingresos, estado de licencias (sección 16)
- Ver registro de auditoría (`GET /api/admin/audit-log?limit=50`)

> **Nota:** la creación de licencias en lote (bulk) y la gestión de fecha de expiración no se implementaron en esta versión — el modelo de negocio acordado en la sección 15 es pago único de por vida sin caducidad, por lo que el campo de expiración no aplica. Si en el futuro se necesita generar licencias en lote (p. ej. para una campaña de partners), se puede añadir como extensión sin tocar el resto del sistema.

---

## 9. UI / Dashboard — estructura y secciones

### Estética visual
Dos temas globales seleccionables en configuración:
- **Oscuro** — grafito oscuro + verde esmeralda
- **Claro** — blanco + azul marino + acentos verdes

### Menú lateral persistente — secciones
1. **Home** — pantalla principal al entrar
2. **Cuestionario** — diagnóstico por preguntas
3. **Análisis Excel** — subida y análisis de archivos
4. **Historial** — análisis anteriores y comparativas
5. **Calculadoras** — herramientas financieras
6. **Informes** — exportación de resultados
7. **Configuración** — preferencias y perfil

---

### Sección 1 — Home
Métricas combinadas visibles nada más entrar:
- Puntuación de salud financiera (del último cuestionario)
- KPIs clave del último Excel subido (ventas, pedidos, productos top)
- Alertas activas detectadas por la IA
- Accesos rápidos a las secciones principales

---

### Sección 2 — Cuestionario de diagnóstico
5 bloques temáticos con 6 ítems cada uno. Para cada ítem el usuario pulsa "Sí lo tengo" o "No lo tengo":

| Bloque | Contenido |
|--------|-----------|
| Ingresos y ventas | Facturación, control de cobros, previsiones, descuentos, clientes recurrentes, margen por producto |
| Gastos y costes | Gastos fijos, variables, presupuesto mensual, tickets digitales, gastos de personal, revisión de proveedores |
| Pedidos y stock | Gestión de pedidos, control de inventario, productos top, productos poco rentables, punto de pedido, devoluciones |
| Tesorería y finanzas | Conciliación bancaria, cash flow, fondo de reserva, financiación, planificación fiscal, análisis de rentabilidad |
| Reporting e informes | Dashboard, informe mensual, comparativa de periodos, alertas automáticas, KPIs de ventas, asesor externo |

---

### Sección 3 — Análisis Excel
- Subida con drag & drop o selector de archivos
- Formatos soportados: `.xlsx`, `.xls`, `.csv`
- Chips de tipo de datos para etiquetar cada archivo: Pedidos / Gastos / Ventas / General
- Preview de tabla con las primeras filas de cada hoja
- Tabs para navegar entre hojas del mismo archivo
- Análisis IA con hasta 60 filas de muestra por hoja
- El diagnóstico incluye sección específica de **reducción de gastos** con pasos concretos

---

### Sección 4 — Historial
- Lista de todos los análisis realizados (cuestionario + Excel) con fecha y puntuación
- Vista detallada de cualquier análisis anterior
- Comparativa entre dos análisis: qué ha mejorado, qué ha empeorado
- Evolución temporal de la puntuación de salud financiera

---

### Sección 5 — Calculadoras financieras
Tres pestañas:

**Punto de equilibrio**
Calcula cuánto hay que vender para cubrir todos los costes. Inputs: costes fijos, precio de venta unitario, coste variable unitario.

**Margen bruto / neto**
Calcula margen bruto y neto a partir de ingresos, coste de ventas y gastos operativos.

**ROI de inversiones**
Calcula el retorno sobre inversión. Inputs: inversión inicial, beneficio obtenido, periodo de tiempo.

---

### Sección 6 — Informes
El usuario elige el formato antes de exportar:
- **PDF** — con logo, gráficos, resumen ejecutivo estilo consultoría, tabla de recomendaciones
- **Excel** — datos estructurados, diagnóstico, KPIs y plan de acción en hojas separadas
- Ambos formatos disponibles simultáneamente, el usuario elige el que prefiera

---

### Sección 7 — Configuración
- **Tema** — toggle Oscuro / Claro
- **Idioma** — Español / English (selector)
- **Perfil de empresa** — nombre, sector, tamaño (para personalizar los análisis de la IA)
- **Sesión** — ver dispositivo activo, cerrar sesión

---

## 10. Diagnóstico IA — formato de informe estilo consultoría

Cuando se completa el cuestionario o se sube un Excel, la IA genera un informe completo con:

### Componentes visuales
- **Radar chart** por área (Ingresos, Gastos, Stock, Tesorería, Reporting) — muestra el nivel de gestión en cada dimensión
- **Tarjetas visuales** con puntuación numérica y semáforo (rojo / amarillo / verde) por área
- **Barras de progreso** por categoría dentro de cada área

### Secciones del informe de texto
1. **Estado general** — párrafo ejecutivo de 2-3 frases
2. **Puntos fuertes** — qué está haciendo bien el negocio
3. **Áreas críticas** — las 3-5 carencias más importantes con explicación del impacto y acciones concretas
4. **Reducción de gastos** *(sección nueva y diferenciadora)* — análisis específico de dónde y cómo recortar costes sin dañar el negocio
5. **Plan de acción — próximos 30 días** — 3 acciones prioritarias e inmediatas
6. **Automatizaciones recomendadas** — qué procesos se podrían automatizar para ahorrar tiempo y reducir errores

---

## 11. Idiomas

- **Español** (idioma principal)
- **English** (disponible desde el inicio)
- Selector en la sección de Configuración
- Todos los textos de la interfaz, mensajes de error, emails automáticos y contenido de la IA se adaptan al idioma seleccionado

---

## 12. Próximos apartados por definir

- [x] Landing page pública — estructura, copy y diseño ✓
- [x] Flujo de onboarding del usuario tras el primer login ✓
- [x] Política de renovación de licencias y gestión de impagos ✓
- [x] Estrategia de soporte al cliente — Tawk.to (chat en vivo) ✓
- [x] Métricas de negocio a monitorizar (activaciones, ingresos, estado licencias) ✓
- [x] Hoja de reparto de beneficios entre los 3 socios — ver documento aparte `nokfi_reparto_beneficios.md` ✓
- [x] Configuración del VPS (dominio, SSL, PM2, Nginx) ✓
- [x] Crypto como método de pago (fase 2) ✓

---

## 13. Landing page pública — Nokfi

### Nombre y marca
**Nokfi** — corto, memorable, funciona en español e inglés, fácil de pronunciar en ambos idiomas.
- Subtítulo ES: *"Tu negocio, bajo control."*
- Subtítulo EN: *"Your business, under control."*
- Dominio objetivo: `nokfi.app` o `getnokfi.com`

### Idiomas
Bilingüe ES / EN desde el lanzamiento. Selector de idioma visible en el navbar. La elección se guarda en localStorage del visitante.

### Modelo de precio en landing
Pago único — acceso de por vida. Sin suscripciones, sin cuotas mensuales. Una sola tarjeta de precio centrada y clara. El precio exacto se define en una fase posterior.

### Soporte / chat
Widget de **Tawk.to** (gratuito) flotante en esquina inferior derecha, activo en toda la página.

### Captura de emails
No. Directo al pago sin fricción extra. Sin formularios de newsletter ni listas de espera.

### Social proof
Ninguno en el lanzamiento. La sección de testimonios se añade cuando haya clientes reales con métricas verificables (horas ahorradas, errores eliminados).

---

### Estructura de secciones — orden y contenido

**1. Navbar**
- Logo Nokfi a la izquierda
- Navegación central: Funciones · Cómo funciona · Precio · FAQ
- Derecha: selector ES/EN + toggle oscuro/claro + botón "Empezar ahora" destacado
- Se queda fija al hacer scroll con fondo semitransparente

**2. Hero**
- Titular directo al dolor: *"¿Sabes realmente a dónde va el dinero de tu negocio?"*
- Subtítulo explicativo en 2 líneas: qué hace Nokfi y para quién
- Botón CTA principal: "Comprar acceso"
- Texto secundario bajo el botón: "Pago único · Acceso de por vida · Sin suscripciones"
- Visual a la derecha: mock o screenshot del dashboard
- Sin testimonios, sin logos de clientes, sin distracciones

**3. Problema**
- 3 tarjetas con los dolores reales del target:
  - Horas perdidas clasificando gastos en Excel
  - No saber qué cortar cuando los números no cuadran
  - Informes financieros que nunca están listos cuando los necesitas
- Tono directo, sin tecnicismos, sin jerga corporativa

**4. Solución / Funciones**
- 6 bloques con icono + título + descripción corta (2 líneas máximo):
  1. Cuestionario de diagnóstico financiero
  2. Análisis de Excel con IA
  3. Informe estilo consultoría con recomendaciones concretas
  4. Calculadoras financieras (punto de equilibrio, margen, ROI)
  5. Historial y comparativa de análisis
  6. Exportación en PDF y Excel

**5. Cómo funciona**
- 3 pasos numerados, muy visual y limpio:
  1. **Compra tu acceso** — pago único, recibes tu clave en segundos
  2. **Activa tu clave** — introduce tu email y clave en la app, queda vinculada a tu dispositivo
  3. **Analiza tu negocio** — sube tus datos o responde el cuestionario, la IA hace el resto
- Mensaje de cierre: "Sin instalaciones. Sin cuotas. Sin complicaciones."

**6. Precio**
- Una sola tarjeta centrada con diseño limpio y destacado
- Badge superior: "Pago único · Sin cuotas mensuales"
- Precio grande y visible
- Lista de todo lo incluido con checkmarks
- Botón CTA: "Comprar ahora"
- Texto de confianza bajo el botón: "Pago seguro con Stripe, PayPal o Revolut · Clave entregada al instante"

**7. FAQ**
- Acordeón expandible con 7 preguntas:
  1. ¿Funciona para cualquier tipo de negocio?
  2. ¿Es seguro subir mis datos financieros?
  3. ¿Necesito instalar algo?
  4. ¿Qué pasa si cambio de ordenador?
  5. ¿Qué incluye exactamente el acceso?
  6. ¿Hay soporte si tengo problemas?
  7. ¿Puedo usarlo en móvil?

**8. CTA final**
- Sección corta de cierre con titular de remate
- Botón de compra repetido
- Fondo con acento de color (verde esmeralda en modo oscuro, azul marino en modo claro) para destacar visualmente del resto de la página

**9. Footer**
- Logo Nokfi
- Links legales: Política de privacidad · Términos y condiciones · RGPD
- Email de contacto
- Selector de idioma ES/EN
- Sin redes sociales por ahora

---

### Tema visual

**Modo oscuro (por defecto)**
- Fondo: `#0F0F0F`
- Acento principal: `#10B981` (verde esmeralda)
- Texto: `#F5F5F5`

**Modo claro**
- Fondo: `#FFFFFF`
- Acento principal: `#1E3A5F` (azul marino)
- Texto: `#111111`

El toggle oscuro/claro está en el navbar. La preferencia se guarda en localStorage del visitante.

### Tipografía
`Inter` para toda la landing. Limpio, profesional, alta legibilidad en pantalla en ambos temas.

### Tono del copy
- Directo, sin tecnicismos ni jerga corporativa
- Habla de "tu negocio", no de "soluciones empresariales"
- Orientado al ahorro de tiempo y dinero concretos
- Evitar palabras como: innovador, disruptivo, revolucionario, ecosistema, sinergia
- Target: autónomos, freelancers, CEOs de pymes, profesionales liberales (abogados, fisioterapeutas, diseñadores, consultores)

---

## 14. Flujo de onboarding — primer login

### Principio de diseño
El usuario llega al dashboard de inmediato, sin fricción. No hay wizard obligatorio ni pantallas intermedias. El onboarding se integra dentro del propio dashboard de forma no intrusiva: una card de bienvenida + modal de configuración inicial + estado vacío orientativo en cada sección.

---

### Paso 1 — Modal de configuración inicial (aparece automáticamente solo la primera vez)

Nada más hacer login por primera vez, aparece un modal centrado sobre el dashboard. Es el único momento en que se solicitan datos antes de poder usar la app. Tiene 4 campos obligatorios y un botón para completar:

| Campo | Tipo | Ejemplos / opciones |
|-------|------|---------------------|
| Nombre de la empresa | Texto libre | "Taller García", "Clínica Ruiz"... |
| Sector | Desplegable | Comercio · Hostelería · Salud · Legal · Construcción · Tecnología · Consultoría · Diseño · Educación · Otro |
| Tamaño | Selector de opciones | Solo (autónomo) · 2–5 personas · 6–20 personas · +20 personas |
| Principales gastos del negocio | Multi-selección | Alquiler · Personal · Proveedores · Marketing · Suministros · Tecnología · Transporte · Otro |

- El modal **no se puede cerrar sin rellenar** los 4 campos — son necesarios para que la IA personalice los análisis
- Botón de acción: "Empezar a usar Nokfi"
- Estos datos se guardan en el perfil del usuario y son editables en cualquier momento desde Configuración

---

### Paso 2 — Home con card de bienvenida

Tras cerrar el modal, el usuario aterriza en el Home. En la parte superior aparece una **card de bienvenida** que ocupa el ancho completo y desaparece para siempre en cuanto el usuario la cierra manualmente o completa su primer análisis:

**Contenido de la card:**
- Saludo personalizado: *"Bienvenido a Nokfi, [Nombre empresa]"*
- Mensaje corto: *"Tu panel está listo. Empieza cuando quieras — no hay un orden obligatorio."*
- 2 accesos rápidos en botones dentro de la propia card:
  - "Hacer el diagnóstico" → lleva al Cuestionario
  - "Subir mis datos" → lleva al Análisis Excel
- Botón de cierre (X) en la esquina — si la cierra sin hacer nada, no vuelve a aparecer

---

### Paso 3 — Estados vacíos orientativos por sección

Las primeras veces que el usuario entra a cada sección del menú lateral y aún no tiene datos, en lugar de mostrar una pantalla en blanco aparece un **estado vacío** con instrucción clara y un CTA:

| Sección | Mensaje de estado vacío | CTA |
|---------|------------------------|-----|
| Home | *(card de bienvenida activa)* | Ver arriba |
| Cuestionario | "Aún no has hecho tu primer diagnóstico. Tarda menos de 5 minutos." | "Empezar diagnóstico" |
| Análisis Excel | "Sube tu primer archivo para que la IA analice tus datos reales." | "Subir archivo" |
| Historial | "Aquí aparecerán todos tus análisis anteriores una vez que hagas el primero." | "Ir al cuestionario" |
| Calculadoras | *(siempre disponibles, no tienen estado vacío)* | — |
| Informes | "Genera tu primer análisis para poder exportar un informe." | "Ir al cuestionario" |

---

### Comportamiento técnico del onboarding

- El modal de configuración inicial se activa comprobando un flag `onboarding_completed` en el perfil del usuario almacenado en el servidor
- Una vez guardados los datos del modal, el flag se marca como `true` y el modal nunca vuelve a aparecer
- La card de bienvenida se controla con un flag `welcome_card_dismissed` guardado también en servidor (no en localStorage, para que funcione aunque el usuario cambie de navegador)
- Los estados vacíos se renderizan condicionalmente comprobando si el usuario tiene análisis previos en base de datos

---

### Lo que NO hace el onboarding de Nokfi

- No hay tour con tooltips superpuestos — interrumpen y la gente los cierra sin leer
- No hay vídeo de bienvenida — añade fricción y alarga el tiempo hasta el primer valor
- No hay email de "primeros pasos" post-registro — ya recibió el email de la clave, no queremos saturar
- No hay checklist gamificada de "completa tu perfil" — innecesaria para un tool B2B de este tipo

---

## 15. Política de licencias y gestión de incidencias de pago

### Modelo de licencia
**Pago único de por vida.** El usuario paga una vez y tiene acceso para siempre, sin renovaciones, sin cuotas mensuales, sin fechas de caducidad. Una licencia activa permanece activa indefinidamente mientras no se produzca una incidencia de pago o una violación de los términos de uso.

No existe gestión de impagos recurrentes porque no hay pagos recurrentes. Los únicos escenarios que pueden afectar a una licencia activa son los descritos a continuación.

---

### Escenario 1 — Chargeback (reclamación del pago al banco)

**Qué es:** el usuario contacta con su banco o PayPal y reclama la devolución del cargo alegando que no autorizó el pago o que el producto no fue entregado.

**Comportamiento del sistema:**
- Stripe, PayPal y Revolut notifican al servidor vía webhook en el momento en que se abre la disputa
- El servidor revoca la licencia **automáticamente e instantáneamente** al recibir el webhook
- La sesión activa se invalida en el mismo momento — el usuario queda bloqueado sin previo aviso
- Se registra el evento en el `audit_log` con todos los detalles (fecha, IP, motivo)
- Se envía un email automático al email vinculado a la licencia informando de la revocación y el motivo

**Por qué automático y sin periodo de gracia:** el chargeback implica que el pago ha sido revertido, por lo que el acceso al software ya no está respaldado por ningún pago válido. Permitir acceso durante 48h adicionales tras un chargeback sería dar acceso gratuito. La revocación inmediata es la única respuesta técnicamente coherente.

**Resolución:** si el usuario considera que fue un error, puede contactar con soporte. Si retira la disputa y el pago se confirma de nuevo, la licencia se reactiva manualmente desde el panel admin.

---

### Escenario 2 — Cambio de dispositivo (reseteo de device fingerprint)

**Qué es:** el usuario cambia de ordenador, reinstala el sistema operativo, o su device fingerprint cambia por cualquier motivo técnico. Al hacer login, el fingerprint no coincide con el registrado → acceso denegado.

**Comportamiento del sistema:**
- El usuario ve un mensaje claro en la pantalla de login: "Este dispositivo no coincide con el registrado para tu licencia. Puedes resetear tu dispositivo desde tu perfil si has cambiado de equipo."
- El usuario puede solicitar el reseteo **desde su perfil dentro de la app** via token temporal enviado a su email (válido 30 minutos, un solo uso)
- Dentro de la app, confirma el reseteo desde Configuración → Sesión → "Vincular nuevo dispositivo"
- El servidor elimina el fingerprint anterior y registra el nuevo en el siguiente login
- **Límite:** 1 reseteo por año por licencia. Si necesita un segundo reseteo en el mismo año, debe contactar con soporte para que lo hagan manualmente desde el panel admin
- El límite anual queda registrado en la base de datos con fecha del último reseteo

**Por qué 1 vez al año:** es suficiente para cubrir cambios legítimos de equipo sin abrir la puerta al sharing. Si alguien comparte su clave, el primer usuario que resetee "roba" el dispositivo al otro, lo que genera fricción suficiente para desincentivar el sharing.

---

### Escenario 3 — Política de reembolsos

**Sin reembolsos bajo ninguna circunstancia.**

Esta política debe estar claramente visible en:
- La página de precios de la landing (texto pequeño bajo el botón de compra)
- Los Términos y Condiciones (sección dedicada)
- El email de confirmación de compra y revelación de clave

**Texto legal recomendado para los T&C:**
> "Dado que Nokfi es un producto digital de acceso inmediato, una vez que la clave de licencia ha sido generada y entregada, no se realizarán devoluciones bajo ninguna circunstancia. Al completar la compra, el usuario acepta expresamente esta política y renuncia a su derecho de desistimiento conforme al artículo 103.a) del Real Decreto Legislativo 1/2007."

**Por qué sin reembolsos:** el acceso al software es inmediato tras el pago. En el momento en que la clave se genera y se entrega, el servicio ya ha sido prestado. La política de no reembolso es estándar en software B2B de este tipo y está respaldada legalmente por la excepción de contenido digital de la directiva europea.

---

### Escenario 4 — Licencia revocada por abuso o fraude

Si desde el panel admin se detecta uso fraudulento (múltiples IPs simultáneas sospechosas, intentos de bypass documentados, uso comercial no autorizado):
- Revocación manual desde el panel admin
- Email automático al usuario informando del motivo
- El evento queda registrado en `audit_log`
- No hay reembolso en caso de revocación por abuso

---

### Resumen de estados posibles de una licencia

| Estado | Descripción | Acceso a la app |
|--------|-------------|-----------------|
| `active` | Licencia válida y en regla | Completo |
| `suspended` | Suspensión temporal por el admin | Bloqueado con mensaje |
| `revoked` | Revocada por chargeback o abuso | Bloqueado con mensaje |

---

### Implementación técnica

> Sección actualizada tras la implementación real en `routes/webhooks.js`, `routes/auth.js` y `db/database.js`.

- El webhook de chargeback de Stripe llega a `POST /api/webhooks/stripe` (evento `charge.dispute.created`), busca la licencia por `payment_ref` con `getLicenseByPaymentRef()`, y dispara `updateLicense(id, { status: 'revoked' })` + `deleteSessionsForLicense(id)` (cierra **todas** las sesiones de esa licencia, no solo una) + `sendLicenseRevokedEmail()`
- El webhook equivalente de PayPal llega a `POST /api/webhooks/paypal` (evento `CUSTOMER.DISPUTE.CREATED`) con la misma lógica común, compartida en la función `handleChargebackByPaymentRef()`
- El reseteo de dispositivo usa **dos** endpoints separados, no uno solo:
  - `POST /api/auth/request-device-reset` — recibe `{ email, license_key }`, verifica `canResetDevice()` (límite de 1/año), genera un `reset_token` de 30 minutos y lo envía por email. Responde siempre con un mensaje genérico exista o no la licencia, para evitar enumeración
  - `POST /api/auth/confirm-device-reset` — recibe `{ token, client_fingerprint, device_name }` desde el enlace del email, consume el token (un solo uso), libera el dispositivo anterior con `resetDevice()` y vincula el nuevo con `bindDevice()` en el mismo flujo, devolviendo una sesión ya activa
- El campo `licenses.last_device_reset` controla el límite anual — se compara la fecha actual contra `last_device_reset + 1 año` en `canResetDevice()`
- El panel admin puede forzar un reseteo sin este límite vía `POST /api/admin/licenses/:id/reset-device`, para los casos de segundo reseteo gestionado manualmente por soporte
- Todos los eventos quedan en `audit_log` con timestamp, IP y detalle del motivo (`ACTIVATION_SUCCESS`, `LOGIN_FAILED_DEVICE_MISMATCH`, `DEVICE_RESET_CONFIRMED`, `LICENSE_REVOKED_CHARGEBACK`, etc.)

---

## 16. Métricas de negocio — panel de monitorización

### Dónde se ven
Panel dedicado dentro del **admin interno**, accesible solo con `ADMIN_SECRET`. No hay reportes automáticos por email — toda la información se consulta en tiempo real desde el panel cuando el equipo lo necesite.

La landing tendrá **Plausible Analytics** (privado, sin cookies, compatible con RGPD) para métricas de tráfico web. Las métricas de negocio viven exclusivamente en el panel admin del servidor.

---

### Métricas prioritarias — visibles nada más entrar al panel

**Bloque 1 — Activaciones**
- Activaciones hoy / esta semana / este mes
- Gráfico de línea: activaciones diarias en los últimos 30 días
- Gráfico de barras: activaciones por semana en los últimos 3 meses

**Bloque 2 — Ingresos**
- Ingresos totales acumulados (desde el lanzamiento)
- Ingresos este mes
- Ingresos esta semana
- Ingreso medio por licencia (precio total / licencias vendidas)
- Gráfico de línea: ingresos diarios en los últimos 30 días

**Bloque 3 — Estado de licencias**
- Total licencias emitidas
- Licencias activas (número + % sobre el total)
- Licencias revocadas (número + % — incluye chargebacks y abusos)
- Licencias suspendidas (número + %)
- Tasa de revocación = revocadas / total emitidas × 100

---

### Métricas secundarias — visibles en secciones del panel

**Seguridad y uso**
- Intentos de login fallidos por día (últimos 7 días)
- Chargebacks recibidos (total histórico + últimos 30 días)
- Reseteos de dispositivo solicitados (total + últimos 30 días)
- Sesiones activas en este momento
- IPs con más intentos fallidos (top 5) — para detectar ataques

**Retención y actividad**
- Usuarios que han hecho al menos 1 análisis (cuestionario o Excel)
- Usuarios que llevan más de 30 días sin hacer login (licencias inactivas)
- Análisis realizados en total (cuestionario + Excel separados)
- Exportaciones generadas (PDF vs Excel)

---

### Diseño del panel de métricas

- Tarjetas de KPI en la parte superior con número grande + comparativa respecto al período anterior (flecha arriba/abajo + porcentaje de cambio)
- Gráficos usando la misma librería que el frontend de la app (Recharts)
- Selector de período: últimos 7 días / 30 días / 90 días / desde el inicio
- Tabla de últimas activaciones con columnas: fecha, email (parcialmente enmascarado), plan, IP, estado
- Tabla de últimos eventos de auditoría (chargebacks, revocaciones, reseteos)
- Todo en tiempo real — los datos se leen directamente de SQLite al cargar la página, sin caché

---

### Implementación técnica

- Endpoint real implementado: `GET /api/admin/stats?period=30` (no `metrics` — corregido tras la implementación) — devuelve todos los datos agregados en un solo objeto JSON: `licenses`, `activations`, `revenue`, `daily_series`, `recent_events`
- Las agregaciones se hacen con queries SQLite directas (COUNT, SUM, GROUP BY fecha) — eficiente para los volúmenes esperados
- El precio por licencia se define en `LICENSE_PRICE_EUR` para que el cálculo de ingresos sea automático
- **Ya implementado:** los ingresos reales provienen directamente de `licenses.amount_eur`, que se rellena con el importe exacto confirmado por cada webhook de Stripe/PayPal/Coinbase/Revolut (`payment_events` registra el evento bruto para idempotencia; `licenses.amount_eur` es la fuente de verdad para las métricas)

---

## 17. Configuración del VPS

### Elección del sistema operativo
**Ubuntu 24.04 LTS** (10 Gbps si está disponible sin coste extra, si no 1 Gbps es más que suficiente para el volumen esperado).

**Por qué Ubuntu 24.04 y no las alternativas:**
- LTS (Long Term Support) — soporte oficial hasta 2029, no hay que migrar el sistema en mitad del negocio
- Mejor compatibilidad y documentación con Node.js, Nginx, PM2 y Certbot que CentOS Stream o FreeBSD
- CentOS Stream no es recomendable para producción seria — es la rama de pruebas de Red Hat, con menor estabilidad que una LTS de Ubuntu/Debian
- FreeBSD es excelente para otros casos de uso pero tiene mucha menos documentación para este stack concreto y complica la vida a un equipo que no tiene experiencia previa con él
- Debian 12 sería la alternativa más cercana, pero Ubuntu LTS tiene el ecosistema de paquetes y guías ligeramente más amplio para Node.js

---

### Dominio — qué hacer primero

Antes de tocar el VPS, hay que comprar el dominio. Recomendación: `nokfi.app` o `getnokfi.com` en **Namecheap**, **Cloudflare Registrar** (precio de coste, sin margen) o **OVH**. Una vez comprado:

1. Apuntar los DNS del dominio al **Cloudflare** (gratis) para tener proxy, protección DDoS básica y SSL gestionado de forma más sencilla
2. Crear 2 registros tipo A apuntando a la IP del VPS:
   - `nokfi.app` → landing pública
   - `app.nokfi.app` → web app protegida (subdominio)
3. Opcional pero recomendado: `admin.nokfi.app` → panel de administración interno, con acceso restringido por IP además del `ADMIN_SECRET`

---

### Estructura de despliegue en el VPS

```
/var/www/
├── landing/              ← build estático de la landing (HTML/CSS/JS)
├── app/                  ← build de producción del frontend React
└── backend/              ← código del servidor Node.js + Express
    ├── server.js
    ├── .env               ← NUNCA en git, permisos 600
    ├── db/
    │   └── licenses.db    ← base de datos SQLite
    └── node_modules/
```

---

### Pasos de instalación (orden recomendado)

**1. Acceso inicial y hardening básico**
```bash
# Conectar por SSH como root la primera vez
ssh root@IP_DEL_VPS

# Crear usuario no-root con permisos sudo
adduser deploy
usermod -aG sudo deploy

# Configurar firewall básico
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Deshabilitar login root por SSH (solo usuario deploy)
# Editar /etc/ssh/sshd_config → PermitRootLogin no
systemctl restart sshd
```

**2. Instalar Node.js (LTS)**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # verificar versión 22.x
```

**3. Instalar PM2 (gestor de procesos)**
```bash
sudo npm install -g pm2
pm2 startup    # configura arranque automático al reiniciar el VPS
```

**4. Instalar Nginx (proxy reverso)**
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

**5. Instalar Certbot (SSL gratuito de Let's Encrypt)**
```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

### Configuración de Nginx — proxy reverso

Nginx recibe todo el tráfico en los puertos 80/443 y redirige cada subdominio a su destino correspondiente:

> **⚠️ Auditoría de seguridad:** la configuración original no incluía cabeceras
> de seguridad HTTP para el frontend estático. Helmet (en el backend) solo
> protege las respuestas de la API — los archivos que sirve Nginx directamente
> para `app.nokfi.app` no llevaban ninguna cabecera propia. Esto dejaba la
> app expuesta a **clickjacking** (se podía embeber en un `<iframe>` de un
> sitio malicioso) porque la directiva `frame-ancestors` de la CSP **no
> funciona en absoluto** puesta como `<meta>` tag en el HTML — los navegadores
> la ignoran ahí, solo es efectiva como cabecera HTTP real. Se añaden abajo
> las cabeceras que cierran ese hueco.

```nginx
# /etc/nginx/sites-available/nokfi

# Landing pública — archivos estáticos
server {
    listen 80;
    server_name nokfi.app www.nokfi.app;
    root /var/www/landing;
    index index.html;

    # Cabeceras de seguridad — ver nota de auditoría arriba
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Web app — proxy al frontend servido + backend API
server {
    listen 80;
    server_name app.nokfi.app;

    # Cabeceras de seguridad para el frontend estático (ver nota de auditoría arriba).
    # frame-ancestors 'none' es la protección REAL contra clickjacking — la que
    # va en el <meta> de index.html es solo defensa complementaria, no suficiente.
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.nokfi.app https://generativelanguage.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;

    location / {
        root /var/www/app;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activar la configuración y obtener certificados SSL:
```bash
sudo ln -s /etc/nginx/sites-available/nokfi /etc/nginx/sites-enabled/
sudo nginx -t                              # verificar sintaxis
sudo systemctl reload nginx
sudo certbot --nginx -d nokfi.app -d www.nokfi.app -d app.nokfi.app
```

Certbot configura HTTPS automáticamente y renueva los certificados cada 90 días sin intervención manual. Una vez activo el certificado, Certbot añade además la redirección automática HTTP→HTTPS, que junto al HSTS ya configurado en Helmet (backend) y en las cabeceras de arriba (frontend), fuerza tráfico cifrado en todo el sistema.

---


### Arrancar el backend con PM2

```bash
cd /var/www/backend
npm install --production
pm2 start server.js --name nokfi-backend
pm2 save                    # persiste el proceso tras reinicios
pm2 logs nokfi-backend      # ver logs en tiempo real
```

**Comandos útiles de PM2 para el día a día:**
- `pm2 restart nokfi-backend` — reiniciar tras un despliegue nuevo
- `pm2 status` — ver si el proceso está corriendo
- `pm2 logs nokfi-backend --lines 100` — ver últimas 100 líneas de logs
- `pm2 monit` — monitor de CPU/memoria en tiempo real

---

### Seguridad adicional del VPS

- **Fail2ban** instalado para bloquear IPs con intentos de fuerza bruta por SSH
- **Backups automáticos** de la base de datos SQLite con un cron diario que copia `licenses.db` a almacenamiento externo (ej. backup del propio proveedor del VPS o un bucket S3-compatible)
- El archivo `.env` con las claves API nunca se sube a git — se transfiere manualmente por SCP la primera vez y se edita directamente en el servidor
- Permisos del `.env` restringidos: `chmod 600 .env` para que solo el usuario `deploy` pueda leerlo

```bash
# Cron diario de backup (ejemplo, a las 3 AM)
0 3 * * * cp /var/www/backend/db/licenses.db /var/backups/licenses_$(date +\%Y\%m\%d).db
```

---

### Checklist de despliegue inicial

- [ ] Comprar dominio y apuntar DNS a Cloudflare
- [ ] Crear VPS con Ubuntu 24.04 LTS
- [ ] Hardening inicial: usuario no-root, firewall, SSH sin root
- [ ] Instalar Node.js 22 LTS, PM2, Nginx, Certbot
- [ ] Subir código de landing, frontend y backend al VPS
- [ ] Configurar `.env` del backend con todas las claves (Google Gemini, Stripe, PayPal, Revolut, SendGrid, ADMIN_SECRET)
- [ ] Configurar Nginx con los 3 subdominios
- [ ] Generar certificados SSL con Certbot
- [ ] Arrancar backend con PM2 y verificar `pm2 status`
- [ ] Configurar Fail2ban
- [ ] Configurar cron de backups diarios de la base de datos
- [ ] Probar el flujo completo de principio a fin en producción antes de anunciar el lanzamiento

---

## 18. Crypto como método de pago (fase 2)

### Cuándo se activa
Esta fase se implementa después del lanzamiento inicial con Stripe + PayPal + Revolut, una vez que el negocio esté rodando y el equipo tenga capacidad para gestionar la complejidad fiscal adicional que implica aceptar criptomonedas.

---

### Proveedor elegido
**Coinbase Commerce** — pasarela de pago cripto diseñada específicamente para negocios. Sin comisión de plataforma (solo fees de red de cada blockchain), integración vía API con webhooks igual que las demás pasarelas, y panel propio para ver todos los pagos recibidos.

### ⚠️ Importante: elegir Commerce "gestionado", no "autogestionado"
Coinbase Commerce ofrece dos modalidades de cuenta:
- **Gestionada por Coinbase** (recomendada para Nokfi): el dinero entra a la cuenta normal de Coinbase.com del equipo, desde donde se puede convertir a euros dentro de la propia plataforma y transferir al banco, igual que con las demás pasarelas.
- **Autogestionada (self-custody)**: el equipo tiene control total del saldo mediante una frase semilla de 12 palabras propia — si se pierde, ni el equipo ni Coinbase pueden recuperar los fondos. Más importante aún: **los retiros en euros a una cuenta bancaria de empresa no están disponibles actualmente con esta modalidad** — solo permite mover la cripto a otra wallet o a una cuenta de Coinbase.com vinculada, no directo al banco.

Dado que el plan es "mantener en crypto y convertir manualmente cuando se quiera" (ver más abajo), **hay que asegurarse de elegir la opción gestionada al crear la cuenta**, no la autogestionada, o el equipo se encontrará sin forma simple de convertir a euros.

### Criptomonedas aceptadas
Las que soporta Coinbase Commerce por defecto: **Bitcoin (BTC), Ethereum (ETH), USD Coin (USDC), Litecoin (LTC)** y otras que Coinbase vaya añadiendo a su catálogo estándar. No se restringe a un subconjunto — se acepta todo lo que la pasarela soporte de fábrica, sin configuración adicional por nuestra parte.

### Gestión del dinero recibido
**El equipo mantiene el saldo en criptomoneda** tras cada pago, sin conversión automática a euros. La conversión a EUR se hace manualmente desde el panel de Coinbase Commerce cuando el equipo lo decida (por ejemplo, mensualmente, o según la evolución del mercado).

**Importante a tener en cuenta:**
- Esto implica exposición a la volatilidad del precio de la criptomoneda entre el momento del cobro y el momento de la conversión
- Recomendable revisar con un asesor fiscal cómo declarar estos ingresos en España — Hacienda considera el cripto como ganancia patrimonial y el momento de conversión a EUR puede generar una plusvalía o minusvalía adicional a declarar, separada del ingreso original por la venta del software
- El apartado de finanzas del equipo debería llevar un registro simple de: fecha de cada pago en crypto, cantidad recibida, valor en EUR en ese momento (para declarar el ingreso correctamente), y fecha/valor de la conversión posterior

---

### Integración técnica

**Flujo idéntico al resto de pasarelas:**
```
Usuario elige "Pagar con crypto" en el checkout
        ↓
Redirección a Coinbase Commerce Checkout
        ↓
Usuario paga con su wallet (BTC, ETH, USDC...)
        ↓
Coinbase confirma la transacción en la blockchain
        ↓
Webhook → POST /api/webhooks/coinbase
        ↓
Servidor verifica firma del webhook (HMAC) → genera clave → vincula email
        ↓
Mismo flujo de revelación de clave que con las demás pasarelas
```

**Diferencia clave respecto a Stripe/PayPal/Revolut:** las confirmaciones de blockchain tardan más que una tarjeta (de unos segundos a varios minutos según la red y el número de confirmaciones requeridas). La pantalla de espera tras el pago debe indicarlo claramente: *"Esperando confirmación en la blockchain. Esto puede tardar unos minutos."* con un spinner y polling al servidor cada 10 segundos hasta que el webhook llegue y la clave se genere.

### Variables de entorno adicionales
```
COINBASE_COMMERCE_API_KEY=...
COINBASE_COMMERCE_WEBHOOK_SECRET=...
```

### Seguridad del webhook
Igual que con Stripe, cada webhook entrante se verifica criptográficamente con la firma HMAC que Coinbase incluye en la cabecera `X-CC-Webhook-Signature`. Sin firma válida, el servidor descarta la petición y no genera ninguna clave. Esto cierra cualquier intento de simular un pago falso enviando una petición directa al endpoint del webhook.

### Consideración legal pendiente
Antes de activar esta fase, revisar con un gestor o asesor fiscal:
- Cómo se factura una venta pagada en criptomoneda en España
- Si aplica IVA de la misma forma que en pagos en euros
- Cómo declarar la ganancia o pérdida patrimonial derivada del cambio de valor entre el cobro y la conversión a EUR

---

## 19. Frontend — Estructura y diseño

### Stack técnico
- **React + Vite** — framework principal
- **Tailwind CSS** — estilos
- **PWA** — instalable desde el navegador sin App Store
- **Recharts** — gráficas interactivas
- **SheetJS (xlsx)** — importación y exportación de Excel
- **pdfjs-dist** — extracción de texto de PDFs en el cliente
- **jsPDF** — generación de PDFs de exportación
- **i18next** — internacionalización ES/EN

---

### Rutas de la aplicación

```
/login                          → activación + login
/reset-device                   → confirmación reseteo dispositivo (desde email)

/app/home                       → dashboard principal
/app/cuestionario               → diagnóstico por preguntas
/app/excel                      → hub de análisis Excel (índice de subapartados)
  /app/excel/excel-stock-almacen
  /app/excel/excel-salida-ventas
  /app/excel/excel-salida-servicios
  /app/excel/excel-entrada-productos
  /app/excel/excel-caja
  /app/excel/excel-total
/app/historial                  → análisis anteriores y comparativas
/app/calculadoras               → calculadoras financieras (3 pestañas)
/app/informes                   → exportación PDF/Excel
/app/configuracion              → tema, idioma, perfil, sesión
```

---

### Capa de comunicación con el backend — middleware/api.js

Módulo central que gestiona TODAS las llamadas al servidor. Ningún componente llama al backend directamente. Este módulo maneja automáticamente:
- Token de sesión en cada petición (`Authorization: Bearer`)
- Errores `401/403` → limpia sesión y redirige al login
- Error `ai_quota_exceeded` → mensaje claro "inténtalo más tarde"
- Error `device_mismatch` → ofrece flujo de reseteo de dispositivo
- Error `internal_error` → mensaje genérico de fallback

---

### Pantalla de login — flujos según respuesta del backend

| Respuesta backend | Acción del frontend |
|---|---|
| `201 success` (activate) | Primera activación completada → onboarding |
| `200 success` (login) | Login correcto → dashboard |
| `409 not_activated` | Redirigir al flujo de activación inicial |
| `401 device_mismatch` | Mostrar opción de reseteo de dispositivo |
| `403 license_inactive` | Pantalla específica de licencia revocada/suspendida |
| `404 not_found` | "Email o clave incorrectos" — mensaje genérico |

---

### Onboarding — primer login

Modal obligatorio antes de entrar al dashboard (no se puede saltar):
- Nombre de la empresa
- Sector (desplegable)
- Tamaño (autónomo / 2-5 / 6-20 / +20)
- Principales gastos del negocio (multi-selección)

Estos datos se guardan en el servidor y personalizan los prompts de Gemini en cada análisis.

---

### Temas visuales

Dos temas globales guardados en el servidor (no en localStorage):
- **Oscuro** — fondo `#0F0F0F` + verde esmeralda `#10B981`
- **Claro** — blanco + azul marino `#1E3A5F`

---

### Idiomas

ES / EN desde el inicio con i18next. Todas las cadenas en un objeto de traducciones central, nunca hardcodeadas en componentes.

---

## 20. Subapartados de /app/excel

### Subapartados definidos

| Ruta | Descripción |
|------|-------------|
| `excel-stock-almacen` | Inventario actual del almacén |
| `excel-salida-ventas` | Parte del almacén destinada a ventas |
| `excel-salida-servicios` | Parte del almacén destinada a servicios |
| `excel-entrada-productos` | Pedidos / entradas de producto |
| `excel-caja` | Dinero en caja y cambio |
| `excel-total` | Profit total descontando impuestos y gastos |

---

### Estructura común de TODOS los subapartados

Cada subapartado tiene exactamente estas 4 zonas en el mismo orden:

**Zona 1 — Importar archivos**
- Drag & drop o selector de archivos
- Formatos: `.xlsx`, `.xls`, `.csv`, `.pdf`
- Límite: 5MB por archivo, máximo 3 archivos simultáneos
- Barra de texto: "Añade contexto para que la IA entienda este archivo..."
- Botón: "Analizar con IA"
- Historial de los últimos 5 archivos subidos en ese subapartado (con fecha, recargables)

**Zona 2 — Indicadores KPI + Gráfica interactiva**
- 3 tarjetas KPI encima de la gráfica: total del período, variación vs archivo anterior (ej. `+12% vs mes anterior`), alerta si algo está fuera de lo normal
- Gráfica interactiva (Recharts) que se actualiza con cada archivo subido
- El tipo de gráfica varía según el subapartado pero la zona es idéntica en todos
- Modo comparación: botón para subir 2 archivos y verlos en paralelo en la misma gráfica

**Zona 3 — Análisis de la IA**
- Respuesta de Gemini con: resumen ejecutivo, hallazgos clave, alertas, recomendaciones específicas del tipo de Excel
- Cada subapartado tiene un prompt base predefinido + el contexto que añadió el usuario
- Texto estructurado con secciones colapsables

**Zona 4 — Exportar resultado**
- El usuario elige: PDF o Excel
- PDF: incluye gráfica + KPIs + análisis completo de la IA
- Excel: datos procesados + recomendaciones en hojas separadas

---

### Tipos de gráfica por subapartado

| Subapartado | Gráfica principal | Qué muestra |
|-------------|-------------------|-------------|
| Stock/almacén | Barras horizontales | Cantidad por producto, mínimos de seguridad |
| Salida ventas | Barras + línea de tendencia | Unidades vendidas por producto/período |
| Salida servicios | Circular + barras | Distribución por tipo de servicio |
| Entrada productos | Barras agrupadas | Pedidos realizados vs recibidos |
| Caja | Línea temporal | Evolución del saldo de caja por día |
| Total (profit) | Barras apiladas | Ingresos vs gastos vs profit neto |

---

### Sistema de gestión de PDFs — 4 capas

**Capa 1 — Conversión automática PDF → datos (cliente)**
Cuando se sube un PDF, `pdfjs-dist` extrae el texto directamente en el navegador del usuario, sin coste de tokens. Lo que se manda a Gemini es texto plano — mismo coste que un Excel.

**Capa 2 — Detección de PDFs escaneados**
Si `pdfjs-dist` extrae menos de 100 caracteres (señal de imagen escaneada), se muestra aviso al usuario con dos opciones:
- "Convertir a Excel" → activa el conversor integrado
- "Continuar igualmente" → el usuario asume el coste extra de tokens

**Capa 3 — Conversor PDF → Excel integrado**
Módulo que estructura el texto extraído en columnas y filas descargables como `.xlsx`. Funciona bien con facturas, albaranes y extractos bancarios con estructura tabular. No funciona con PDFs escaneados.

**Capa 4 — Límites duros**
- Tamaño máximo por archivo: **5MB**
- Máximo **3 archivos simultáneos** por análisis
- Texto extraído truncado a **30.000 caracteres** máximo (protege el límite de 50.000 del backend)
- PDFs escaneados que el usuario insista en mandar: cuentan doble contra el rate limit de Gemini

---

## 21. Identidad visual — Sistema de diseño Nokfi

### Logo
Dos variantes oficiales, sin más versiones:
- **Variante header/dashboard:** texto "nok" en color de texto primario (blanco en oscuro, negro/grafito en claro) + "fi" en azul eléctrico `#3B82F6`. Fondo transparente, se adapta al tema activo.
- **Variante icono/favicon/PWA:** fondo sólido azul `#3B82F6` + texto "nokfi" completo en blanco. Usada para el icono de la PWA, favicon, y splash screen al instalar la app.

No se usan variantes con fondo blanco/negro sólido en el texto, ni colores alternativos del logo.

### Paleta de color

| Color | Hex | Uso |
|-------|-----|-----|
| Azul eléctrico (acento) | `#3B82F6` | Botones primarios, badges activos, links, KPIs destacados, "fi" del logo |
| Negro profundo (fondo oscuro) | `#0F0F0F` | Fondo del tema oscuro |
| Grafito (superficie oscura) | `#141414` | Cards y menú lateral en modo oscuro |
| Blanco (fondo claro) | `#FFFFFF` | Fondo del tema claro |
| Gris muy claro (superficie clara) | `#F8FAFC` | Cards y menú lateral en modo claro |
| Verde (positivo) | `#22C55E` | Variaciones positivas, estado ok, ganancias |
| Rojo (negativo/alerta) | `#EF4444` | Variaciones negativas, alertas, pérdidas, errores |
| Ámbar (advertencia) | `#F59E0B` | Advertencias, datos que requieren atención |

### Tipografía
**Plus Jakarta Sans** en todos los pesos (400 regular, 500 medium, 600 semibold). Elegida sobre Inter por tener más personalidad propia sin sacrificar legibilidad — encaja con el posicionamiento fintech/corporativo del azul eléctrico.

| Uso | Tamaño | Peso |
|-----|--------|------|
| Título principal | 24px | 600 |
| Heading de sección | 18px | 500 |
| Cuerpo de texto | 14px | 400 |
| Caption / texto secundario | 12px | 400 |
| Label / etiqueta | 11px | 500, uppercase, letter-spacing 0.06em |

### Iconografía
**Lucide Icons** — trazos finos y consistentes que complementan el azul eléctrico sin competir visualmente con los datos financieros, que son el verdadero protagonista de la interfaz.

---

### ⚠️ Regla obligatoria de contraste — aplica a TODOS los componentes

**El texto debe invertirse automáticamente según el tema activo. Nunca texto oscuro sobre fondo oscuro, nunca texto claro sobre fondo claro.**

Esto se garantiza estructuralmente usando siempre variables CSS de tema, nunca colores hardcodeados:

```css
/* CORRECTO — se adapta automáticamente */
color: var(--text-primary);
background: var(--surface-1);

/* INCORRECTO — texto negro fijo, ilegible en modo oscuro */
color: #000000;
background: var(--surface-1);
```

**Checklist de verificación para cada componente nuevo que se construya:**
- [ ] ¿El texto usa `var(--text-primary)` / `var(--text-secondary)` / `var(--text-muted)`, nunca un hex fijo?
- [ ] ¿Se ha probado visualmente el componente en AMBOS temas antes de darlo por terminado?
- [ ] ¿Los badges/pills con fondo de color (verde, rojo, ámbar, azul) usan el tono oscuro de esa misma familia de color para el texto, no negro genérico?
- [ ] ¿Los inputs y bordes usan `var(--border)` / `var(--border-strong)`, que también cambian entre temas?

Este checklist se aplica sin excepción a cada pantalla del frontend (login, dashboard, los 6 subapartados de Excel, calculadoras, etc.) antes de considerarla terminada.
