/**
 * S15b T4 (lote 13): aviso en el build si falta VITE_API_URL.
 *
 * Sin la variable, src/middleware/api.js (y track.js, LangContext.jsx, errorReporter.js)
 * usan el valor de desarrollo `http://localhost:3001/api`: un `dist` así, subido al VPS,
 * llamaría al ordenador de cada visitante y la app no funcionaría. El valor por defecto
 * de desarrollo NO cambia (npm run dev sigue igual); solo se avisa al construir.
 * Producción: `VITE_API_URL=/api npm run build` (mismo origen, Nginx proxyea /api).
 */
export function apiUrlWarning(env = {}) {
  if (String(env.VITE_API_URL || '').trim()) return null;
  return [
    '',
    '⚠️  VITE_API_URL no está definida: este build llamará a http://localhost:3001/api (valor de desarrollo).',
    '   Para producción: VITE_API_URL=/api npm run build  (ver frontend/README.md y docs/deploy.md).',
    ''
  ].join('\n');
}

/** Plugin de Vite: avisa una vez por build del cliente (no en el de SSR del prerender). */
export function warnMissingApiUrl() {
  return {
    name: 'nokfi-warn-missing-api-url',
    apply: 'build',
    configResolved(config) {
      if (config.build.ssr) return;
      const msg = apiUrlWarning(config.env);
      if (msg) config.logger.warn(msg);
    }
  };
}
