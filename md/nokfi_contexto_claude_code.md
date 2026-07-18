# CONTEXTO DEL PROYECTO — Nokfi
> Documento de traspaso para continuar en Claude Code. Generado tras varias
> sesiones de trabajo en Claude.ai (chat) donde se definió, construyó y
> auditó el proyecto sin poder ejecutar código de verdad (sin red ni
> entorno persistente). Claude Code SÍ tiene ejecución real — úsala para
> verificar todo lo que aquí se describe, no asumas que funciona solo
> porque está escrito.

---

## 1. Qué es Nokfi

SaaS de análisis financiero para autónomos y pymes españolas. Combina:
- Un **cuestionario de diagnóstico** (5 bloques x 6 preguntas Sí/No)
- **6 subapartados de análisis de Excel/PDF** con IA (stock, ventas, servicios,
  entrada de productos, caja, profit total)
- Informes exportables en PDF/Excel
- Calculadoras financieras (punto de equilibrio, margen, ROI)

Modelo de negocio: **pago único de por vida** (sin suscripción), licencia
vinculada a **un único dispositivo fijo** (anti-sharing), activación por
email + clave + fingerprint del navegador.

El nombre del producto pasó por dos iteraciones: **Finia → Nokfi** (cambiado
por colisión de marca con productos existentes). Todo el código y
documentación actual usa "Nokfi" — si ves referencias a "Finia" en algún
sitio residual, es un resto sin actualizar, hay que corregirlo.

---

## 2. Dónde vive todo

- **Repositorio:** https://github.com/m4r10-tech/nokfi.git
- **Estructura del repo:** `backend/`, `frontend/`, `md/` (documentación),
  `zip/`, `icons/`
- **VPS de pruebas:** IP actual `191.44.112.86` (⚠️ ha cambiado una vez ya
  durante el proyecto — si algo no conecta, lo primero es comprobar que la
  IP en `.env` / CSP / documentación sigue siendo la correcta)
- Proveedor del VPS: "NodeHost" — Ubuntu 24.04 LTS, usuario `deploy` (no
  root), UFW activo con puertos 22 (SSH) y 3001 (backend) abiertos
- El backend corre con **PM2** (`pm2 start server.js --name nokfi-backend`),
  sobrevive a reinicios de sesión SSH
- Aún **no hay dominio comprado** — todo funciona sobre IP directa por HTTP,
  sin SSL todavía. Nginx está documentado (`md/` sección 17 del proyecto)
  pero no desplegado.

---

## 3. Stack técnico

**Backend:** Node.js 22 + Express + SQLite (`better-sqlite3`). Sin ORM,
queries parametrizadas directas. IA: **Google Gemini** (`gemini-2.5-flash`,
free tier — decisión consciente, ver limitaciones en sección 6).

**Frontend:** React + Vite + Tailwind CSS + PWA (`vite-plugin-pwa`).
Sin Redux — Context API (Auth, Theme, Lang). Gráficas con Recharts. Excel
con `xlsx` (SheetJS). PDF con `jspdf` + extracción de texto con
`pdfjs-dist`. Sanitización de HTML de IA con `dompurify`.

**Pasarelas de pago implementadas (checkout + webhooks):** Stripe, PayPal,
Revolut Business (Merchant API), Coinbase Commerce (fase 2). Ninguna
probada de extremo a extremo con claves reales todavía **excepto Stripe**,
que sí se probó en sandbox con éxito (ver sección 7).

**Email transaccional:** Resend (`onboarding@resend.dev` como remitente de
pruebas, sin dominio verificado aún).

---

## 4. Documentos de referencia (dentro de `md/` en el repo)

- `nokfi_proyecto.md` — documento maestro de definición (21 secciones):
  modelo de negocio, flujo de venta, seguridad, arquitectura, UI/dashboard,
  landing, onboarding, política de licencias, métricas, VPS, crypto,
  frontend, subapartados de Excel, identidad visual
- `nokfi_api_contract.md` — contrato exacto de cada endpoint (request/response
  shape, códigos de error) extraído directamente del código real, no de la
  planificación. **Es la fuente de verdad** para que frontend y backend no
  se desincronicen — cualquier cambio de endpoint debe reflejarse aquí.
- `nokfi_reparto_beneficios.md` — reparto entre los 3 socios (15% fondo
  común + 85% repartido a partes iguales), no técnico, solo negocio.

**Recomendación para Claude Code:** lee `nokfi_api_contract.md` antes de
tocar cualquier endpoint o cualquier llamada del frontend al backend.

---

## 5. Auditoría de seguridad ya realizada

Se hizo una auditoría de seguridad exhaustiva (OWASP Top 10 + ASVS) sobre
todo el proyecto. **14 hallazgos corregidos en código**, verificados con
`node --check` (sintaxis) y, donde fue posible, con ejecución real en el
VPS. Resumen:

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | XSS vía respuesta HTML de la IA sin sanitizar | ALTA | ✅ Corregido (DOMPurify en `middleware/sanitize.js`, aplicado en Cuestionario.jsx y ExcelSubModule.jsx) |
| 2 | CORS roto (wildcard `*` no funcional) + sin failsafe en prod | MEDIA | ✅ Corregido (`server.js` — rechaza arrancar si `NODE_ENV=production` y `ALLOWED_ORIGINS=*`) |
| 3 | Panel admin sin rate limit propio | BAJA | ✅ Corregido (`adminLimiter` en `server.js`) |
| 4 | Sin validación de fortaleza del ADMIN_SECRET | MEDIA | ✅ Corregido (`routes/admin.js`, mínimo 32 caracteres) |
| 5 | Texto libre sin sanitizar (device_name, notes) | BAJA | ✅ Corregido (`sanitizeFreeText` en auth.js y admin.js) |
| 6 | Límite de tamaño implícito en webhooks | BAJA | ✅ Corregido (límite explícito 512kb) |
| 7 | Sin cuota diaria por licencia (Gemini free tier compartido) | MEDIA | ✅ Corregido (`countAiAnalysesToday`, máx 50/día/licencia) |
| 8 | Sin Content Security Policy en frontend | MEDIA | ✅ Corregido (meta tag en `index.html`) — **⚠️ tiene la IP del VPS hardcodeada en `connect-src`, hay que mantenerla sincronizada manualmente, ya causó un bloqueo real una vez al cambiar de VPS** |
| 9 | Headers de Helmet sin ajustar | BAJA | ✅ Corregido (HSTS 1 año, CORP cross-origin, Referrer-Policy) |
| 10 | Validación implícita/frágil de `periodDays` en SQL | BAJA (deuda) | ✅ Corregido (validación explícita con parseInt + rango) |
| 11 | Vulnerabilidad conocida en `xlsx` (sin parche disponible) | Documentada | Riesgo aceptado y justificado en `frontend/README.md` (procesamiento 100% client-side, impacto limitado a self-DoS) |
| 12 | Clave real de Gemini expuesta accidentalmente en el chat | ALTA | ✅ Rotada por el usuario, confirmada |
| 13 | Formula/CSV Injection en exportación a Excel | MEDIA | ✅ Corregido (`neutralizeFormulaInjection` en `exportUtils.js`) |
| 14 | Sin cabeceras de seguridad en Nginx para frontend estático (clickjacking) | MEDIA | Documentado en `md/nokfi_proyecto.md` sección 17 — **pendiente de aplicar cuando se despliegue Nginx de verdad** |

**Categorías revisadas sin hallazgos** (con análisis explícito, no solo
"parece que sí"): SQL Injection (prepared statements confirmados en todo
`database.js`), SSRF, Command Injection, Path Traversal, subida de archivos
insegura (el backend NO recibe archivos, todo se procesa en el navegador),
fuga de secretos en logs/errores, CSRF (no aplica — sin cookies, token en
header Authorization únicamente), cookies inseguras (no se usan en ningún
sitio del proyecto), generación de tokens (todo usa `crypto.randomBytes`,
nunca `Math.random()`), timing attacks en comparación de tokens de sesión
(analizado y descartado como impráctico dado el espacio de 256 bits).

`npm audit` del **backend**: **0 vulnerabilidades** (confirmado con
ejecución real en el VPS). `npm audit` del **frontend**: 7 avisos
(3 moderate, 3 high, 1 critical) — todos en dependencias transitivas
(`dompurify` vía `jspdf`, `esbuild` vía `vite` solo afecta al dev server,
`xlsx` sin parche) documentados y con riesgo aceptado justificado en
`frontend/README.md`. **No ejecutar `npm audit fix --force`** — forzaría
versiones mayores de `vite`/`jspdf` que podrían romper `vite-plugin-pwa`.

---

## 6. Limitaciones conocidas y documentadas (no son bugs, son alcance pendiente)

1. **Perfil de empresa (onboarding) no persiste en backend** — no existe
   endpoint `/api/profile`. Se guarda en `localStorage` del navegador
   (`frontend/src/hooks/useCompanyProfile.js`), no viaja entre dispositivos.
   Documentado con comentario `LIMITACIÓN CONOCIDA` en el propio código.
2. **Historial de análisis no persiste** — no hay tabla `analyses` ni
   endpoints asociados en el backend. `pages/Historial.jsx` e
   `Informes.jsx` muestran estado vacío. La exportación SÍ funciona justo
   después de generar un análisis, lo que falta es poder recuperarlo más
   tarde.
3. **Gemini free tier** — Google puede usar los prompts para entrenar sus
   modelos (decisión de negocio consciente, documentada en
   `nokfi_proyecto.md` sección 6), y hay límite de ~1.500 peticiones/día
   para todo el proyecto (mitigado parcialmente con el límite de 50/día
   por licencia del hallazgo #7).
4. **Transferencia bancaria descartada** como método de pago (sin webhook,
   incompatible con el flujo 100% automático del sistema de licencias).

---

## 7. Qué se ha probado con ejecución real (y qué no)

### ✅ Probado y funcionando en el VPS real:
- Arranque del servidor con PM2, healthcheck
- Creación de licencias vía panel admin
- Activación de licencia + vinculación de dispositivo (fingerprint)
- Anti-sharing: segundo dispositivo con la misma licencia → bloqueado
  correctamente (`403 device_already_bound`)
- Reseteo de dispositivo completo (request + confirm), incluyendo que la
  sesión antigua queda invalidada tras el reseteo
- Panel de métricas (`/api/admin/stats`) con datos reales
- **Webhook de Stripe end-to-end en modo sandbox**: checkout real → pago
  con tarjeta de prueba → webhook recibido → licencia generada
  automáticamente con el importe correcto → verificado en `/api/admin/stats`
- CORS: verificado con `curl -H "Origin: ..."` que las cabeceras
  `Access-Control-Allow-Origin` se generan correctamente tras la corrección
  de la auditoría
- Headers de Helmet verificados en respuesta real (HSTS, CORP, Referrer-Policy)
- `npm install` completo del frontend (482 paquetes) y arranque de
  `vite dev` sin errores de compilación

### ❌ Pendiente de probar con ejecución real:
- Webhooks de PayPal, Revolut y Coinbase (solo Stripe se probó)
- Envío real de emails con Resend (la API key está configurada pero no se
  ha disparado ningún email de verdad todavía)
- Login/activación completos desde el **navegador** (se llegó a probar
  hasta el punto de que el frontend intentaba conectar, pero se topó con
  el bug de CSP de la IP desactualizada — ver sección 8)
- Los 6 subapartados de Excel con datos reales
- El cuestionario completo generando un informe de IA real desde el
  navegador
- Exportación real a PDF/Excel desde la UI

---

## 8. Última tarea en curso — CONTEXTO IMPORTANTE

**Bug recién descubierto y corregido:** el VPS cambió de IP (`31.76.241.222`
→ `191.44.112.86`) sin que se avisara en su momento. Esto dejó desactualizada
la CSP hardcodeada en `frontend/index.html` (`connect-src`), lo que bloqueaba
TODAS las llamadas del frontend al backend con un error de consola
(`violates the following Content Security Policy directive`). Ya se corrigió
la IP en el `index.html`, pero **verifica que el commit con la corrección
esté realmente en el repo** — el usuario iba a hacer `git push` manualmente
justo antes de migrar a Claude Code, podría no haberse completado.

**Tarea que estaba en curso al migrar a Claude Code (sin terminar):**
El usuario quiere:
1. Coger la imagen `icons/Gemini_Generated_Image_5ob7x05ob7x05ob7.png` del
   repo (logo "N" con flecha ascendente en azul + texto "nokfi")
2. **Separar el icono (la "N" con flecha) del texto "nokfi"**
3. Convertir el icono en un **cuadrado** (elegir dimensiones apropiadas)
4. Generar los iconos de PWA necesarios (192x192, 512x512, favicon) a partir
   de ese icono cuadrado, sustituyendo los placeholders azules lisos
   generados por script que hay ahora en `frontend/public/icons/`
5. **Actualizar `frontend/src/components/Logo.jsx`** para que use la nueva
   imagen del icono en vez del texto renderizado "nok**fi**" — en TODOS los
   sitios donde aparece el logo en el frontend (Sidebar, Login, ResetDevice)

Herramientas disponibles para esto en el entorno: **Python con PIL/Pillow**
y **ImageMagick (`convert`)** están confirmados instalados — usar cualquiera
de los dos para recortar/redimensionar la imagen.

**Importante sobre el color:** el logo de la imagen de Gemini usa un azul
algo distinto (`#1E5FBF` aprox., a ojo) al `#3B82F6` que definimos como
`--accent` en el sistema de diseño (sección 21 de `nokfi_proyecto.md`).
Decidir con el usuario si se ajusta el color de la imagen para que coincida
exactamente con la paleta, o si se adopta el azul de la imagen como el
nuevo `--accent` oficial en `index.css` y `tailwind.config.js` — sería
inconsistente tener dos azules distintos en la marca.

---

## 9. Reglas de trabajo acordadas con el usuario (mantener)

- **Regla de contraste obligatoria** (sección 21 del proyecto): todo
  componente usa variables CSS (`var(--text-primary)`, etc.), nunca colores
  hex fijos, para que el contraste funcione en ambos temas (oscuro/claro).
- **El backend es la fuente de verdad de la API** — antes de tocar el
  frontend, confirmar el contrato real en `nokfi_api_contract.md` o en el
  código del backend directamente, no asumir.
- El usuario prefiere que se le explique **qué se hizo y por qué** en cada
  cambio, especialmente en materia de seguridad (formato ya usado en la
  auditoría: explicación breve + gravedad + código + verificación).
- Verificar SIEMPRE con ejecución real cuando sea posible (Claude Code lo
  permite, a diferencia del chat anterior) — no dar nada por funcionando
  solo por revisión visual del código.
- El `.env` real (con secretos) **nunca se sube al repo** — ya está en
  `.gitignore` tanto en `backend/` como en `frontend/`.

---

## 10. Siguiente pasos sugeridos (orden recomendado)

1. Terminar la tarea del logo (sección 8)
2. Confirmar que el fix de la CSP está en el repo y probar login completo
   desde el navegador de principio a fin
3. Probar los 6 subapartados de Excel y el cuestionario con datos reales
4. Probar envío real de emails (Resend)
5. Probar webhooks de PayPal/Revolut/Coinbase en sandbox
6. Comprar dominio y desplegar Nginx + SSL con las cabeceras de seguridad
   ya documentadas (hallazgo #14)
7. Considerar implementar los endpoints pendientes de las limitaciones de
   la sección 6 (`/api/profile`, historial de análisis) si el negocio lo
   requiere antes de lanzar
