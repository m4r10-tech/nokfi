/**
 * server.js — Nokfi Backend
 * Node.js + Express + SQLite (better-sqlite3)
 *
 * ORDEN DE MIDDLEWARES — CRÍTICO, no reordenar sin entender por qué:
 *
 *   1. helmet() y cors()              → seguridad base, debe ir primero
 *   2. express.raw() en /api/webhooks/{stripe,coinbase,revolut}
 *                                      → estas tres rutas necesitan el body
 *                                        SIN parsear para verificar la firma
 *                                        HMAC (ver routes/webhooks.js). Si
 *                                        express.json() las tocara antes,
 *                                        el body ya vendría transformado a
 *                                        objeto JS y la firma no coincidiría
 *                                        nunca, rompiendo el webhook por completo.
 *   3. express.json() global          → para TODO lo demás (incluido el
 *                                        webhook de PayPal, que verifica su
 *                                        firma vía API REST, no HMAC local,
 *                                        así que sí puede recibir JSON parseado).
 *   4. Rate limiters                  → después de poder leer el body si hiciera falta
 *   5. Rutas de la aplicación
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const { initDB, cleanExpiredSessions } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

/* ════════════════════════════════════════════════════════════
   1. Seguridad base
════════════════════════════════════════════════════════════ */
app.set('trust proxy', 1); // necesario detrás de Nginx para que req.ip sea el real (sección 17 del proyecto)

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — helmet configurado explícitamente en vez de
 * usar solo los defaults:
 *   - HSTS reforzado a 1 año + subdominios. Los defaults de helmet (180
 *     días, sin includeSubDomains) son razonables pero cortos para un
 *     dominio que va a servir tanto la API (api.nokfi.app) como el resto
 *     de subdominios bajo HTTPS de forma permanente.
 *   - crossOriginResourcePolicy en 'cross-origin': esta API la consume
 *     el frontend desde OTRO origen (app.nokfi.app vs api.nokfi.app), así
 *     que el valor por defecto de helmet ('same-origin') bloquearía en
 *     algunos navegadores la lectura de las respuestas — no es un fallo
 *     de seguridad tenerlo en 'same-origin', pero rompe la funcionalidad
 *     real de este proyecto, así que se ajusta con conocimiento de causa.
 *   - contentSecurityPolicy desactivada aquí a propósito: esta app es una
 *     API JSON pura, no sirve HTML — la CSP real que protege al usuario
 *     vive en el FRONTEND (frontend/index.html), donde sí se renderiza
 *     contenido. Mantener la CSP por defecto de helmet aquí no aporta
 *     protección real y puede interferir con clientes no-navegador.
 */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: false // activar 'preload: true' solo cuando TODOS los subdominios sirvan HTTPS permanentemente
  },
  referrerPolicy: { policy: 'no-referrer' }
}));

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — CORS corregido.
 *
 * Bug original: pasar ALLOWED_ORIGINS="*" producía el array ['*'], y la
 * librería `cors` hace comparación EXACTA de string contra el header
 * Origin real (ej. "http://localhost:5173") — "*" nunca coincide con eso,
 * así que en la práctica CORS bloqueaba silenciosamente todas las
 * peticiones del navegador con ese valor mal usado.
 *
 * Corrección: función de validación explícita que:
 *   - En desarrollo (NODE_ENV !== 'production'): permite "*" literal como
 *     comodín real (conveniente para probar en local).
 *   - En producción: EXIGE una lista concreta de dominios, nunca "*".
 *     Si detecta "*" en producción, rechaza el arranque del servidor —
 *     mejor fallar rápido en el despliegue que servir con CORS abierto
 *     a cualquier origen por un descuido de configuración.
 *   - Peticiones sin header Origin (curl, webhooks de proveedores de pago,
 *     apps móviles) siempre se permiten — esas no las protege CORS, que
 *     es una política exclusivamente del navegador.
 */
const rawOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';
const hasWildcard = rawOrigins.includes('*');

if (isProduction && hasWildcard) {
  console.error('❌ ALLOWED_ORIGINS="*" no está permitido en producción. Configura los dominios exactos separados por coma.');
  process.exit(1);
}

function corsOriginValidator(origin, callback) {
  // Sin header Origin (curl, webhooks, servidor-a-servidor) → permitir
  if (!origin) return callback(null, true);

  // Desarrollo con comodín explícito → permitir cualquier origen
  if (!isProduction && hasWildcard) return callback(null, true);

  if (rawOrigins.includes(origin)) return callback(null, true);

  console.warn(`[CORS] Origen rechazado: ${origin}`);
  return callback(new Error('Origen no permitido por CORS'));
}

app.use(cors({
  origin: corsOriginValidator,
  credentials: false, // no usamos cookies de sesión — el token va en Authorization header, nunca ambient credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — análisis de CSRF (Cross-Site Request Forgery).
 * CSRF explota "ambient credentials" — cookies o autenticación HTTP básica
 * que el navegador adjunta AUTOMÁTICAMENTE a cualquier petición hacia un
 * dominio, incluso iniciada por una página maliciosa de otro origen.
 *
 * Este backend NO usa cookies para autenticación en ningún endpoint — la
 * sesión viaja exclusivamente en la cabecera `Authorization: Bearer <token>`,
 * que un navegador NUNCA adjunta automáticamente a peticiones cross-origin;
 * solo se envía si el código JavaScript de la propia página lo añade
 * explícitamente (confirmado en frontend/src/middleware/api.js). Por tanto,
 * una página maliciosa en otro dominio no puede forjar una petición
 * autenticada contra esta API sin conocer ya el token — que vive en
 * memoria/sessionStorage del origen legítimo y no es accesible desde otro
 * origen por la Same-Origin Policy del navegador.
 * Conclusión: CSRF no es aplicable a este diseño y no se implementan
 * tokens anti-CSRF (serían redundantes). Si en el futuro se introdujera
 * autenticación por cookies (ej. para simplificar el frontend), esta
 * conclusión dejaría de ser válida y habría que añadir protección CSRF
 * (cookie SameSite=Strict + token anti-CSRF) en ese momento.
 */


app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ════════════════════════════════════════════════════════════
   2. Body parsing — RAW primero para los webhooks que lo requieren
════════════════════════════════════════════════════════════ */
// Límite explícito (antes se confiaba en el default de Express de 100kb sin
// documentarlo — un payload de webhook legítimo nunca supera unos pocos KB).
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '512kb' }));
app.use('/api/webhooks/coinbase', express.raw({ type: 'application/json', limit: '512kb' }));
app.use('/api/webhooks/revolut', express.raw({ type: 'application/json', limit: '512kb' }));

/* 3. JSON global para el resto (incluye /api/webhooks/paypal) */
app.use(express.json({ limit: '2mb' }));

/* ════════════════════════════════════════════════════════════
   4. Rate limiting
════════════════════════════════════════════════════════════ */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Demasiadas peticiones. Inténtalo en unos minutos.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // sección 5 del proyecto: "máximo 5 intentos fallidos... bloqueo temporal" — 10 de margen total (éxitos+fallos).
  // En desarrollo/test se relaja (probar el flujo de auth manualmente con npm run dev choca
  // enseguida contra 10/15min); en producción se mantiene estricto como defensa anti-fuerza-bruta.
  max: isProduction ? 10 : 1000,
  message: { error: 'rate_limited', message: 'Demasiados intentos. Espera 15 minutos.' }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'rate_limited', message: 'Límite de análisis alcanzado. Espera un momento.' }
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // generoso: los webhooks vienen del proveedor de pago, no de usuarios finales
  message: { error: 'rate_limited' }
});

/**
 * ⚠️ AUDITORÍA DE SEGURIDAD — rate limit dedicado para el panel admin.
 * Antes compartía el límite general (200/15min) con el resto de la API.
 * Aunque ADMIN_SECRET es inviable de fuerza bruta (64 hex = 256 bits),
 * es buena práctica de defensa en profundidad que la superficie más
 * sensible tenga un límite propio, más estricto, y separado del tráfico
 * normal de usuarios — así un pico de tráfico legítimo en la app no
 * "gasta" cuota que debería proteger el panel, y viceversa.
 */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Demasiadas peticiones al panel admin. Espera unos minutos.' }
});

app.use('/api/auth/', authLimiter);
app.use('/api/proxy/', aiLimiter);
app.use('/api/webhooks/', webhookLimiter);
app.use('/api/admin/', adminLimiter);
app.use('/api/', generalLimiter);

/* ════════════════════════════════════════════════════════════
   5. Rutas
════════════════════════════════════════════════════════════ */
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const proxyRoutes = require('./routes/proxy');
const paymentsRoutes = require('./routes/payments');
const webhooksRoutes = require('./routes/webhooks');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/payments', paymentsRoutes);   // checkout: /api/payments/{stripe,paypal,coinbase,revolut}/...
app.use('/api/webhooks', webhooksRoutes);   // confirmación: /api/webhooks/{stripe,paypal,coinbase,revolut}

/* ════════════════════════════════════════════════════════════
   Health check — usado por monitorización externa si se añade en el futuro
════════════════════════════════════════════════════════════ */
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

/* ════════════════════════════════════════════════════════════
   404 y manejador de errores — SIEMPRE al final
════════════════════════════════════════════════════════════ */
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, _req, res, _next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: 'internal_error' });
});

/* ════════════════════════════════════════════════════════════
   Arranque
════════════════════════════════════════════════════════════ */
initDB()
  .then(() => {
    // Limpieza periódica de sesiones expiradas — cada hora
    setInterval(() => {
      const removed = cleanExpiredSessions();
      if (removed > 0) console.log(`[CLEANUP] ${removed} sesiones expiradas eliminadas`);
    }, 60 * 60 * 1000);

    app.listen(PORT, () => {
      console.log(`\n✅  Nokfi Backend corriendo en puerto ${PORT}`);
      console.log(`    Health check: http://localhost:${PORT}/health\n`);
    });
  })
  .catch(err => {
    console.error('❌ Error fatal al inicializar la base de datos:', err);
    process.exit(1);
  });

module.exports = app;
