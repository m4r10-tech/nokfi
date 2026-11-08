/**
 * Interfaz en la que escucha el servidor (S15b, S9 del lote 9).
 * En producción `HOST=127.0.0.1`: solo Nginx (en la misma máquina) llega al
 * backend. Sin `HOST` escucha en todas las interfaces, como siempre (desarrollo y tests).
 */
function listenHost(env = process.env) {
  const h = String(env.HOST || '').trim();
  return h || undefined;
}

module.exports = { listenHost };
