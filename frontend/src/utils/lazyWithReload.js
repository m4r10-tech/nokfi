import { lazy } from 'react';

/**
 * C7 — React.lazy con recarga controlada. Tras un deploy, el rsync --delete
 * borra los chunks viejos: una pestaña abierta con el bundle anterior falla al
 * pedir un chunk que ya no existe. En ese caso se recarga UNA vez (marca en
 * sessionStorage con fecha, para no entrar en bucle); si vuelve a fallar, el
 * error sube al ErrorBoundary, que ofrece recargar a mano.
 */
const KEY = 'nokfi_chunk_reload';

export function isChunkError(err) {
  const msg = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(msg);
}

export function reloadOnceForChunkError() {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage bloqueado */ }
  if (Date.now() - last > 30000) {
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* nada */ }
    window.location.reload();
    return true;
  }
  return false;
}

export default function lazyWithReload(importer) {
  return lazy(() => importer().catch((err) => {
    if (isChunkError(err) && reloadOnceForChunkError()) return new Promise(() => {}); // la recarga toma el control
    throw err;
  }));
}
