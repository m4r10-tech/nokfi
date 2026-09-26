/**
 * F3 — "Abrir carpeta" (sesión 4).
 *
 *  - Chrome/Edge de escritorio: File System Access API (showDirectoryPicker).
 *    El "handle" se guarda en IndexedDB para ofrecer "Reabrir la última
 *    carpeta" (el navegador vuelve a pedir permiso de lectura).
 *  - Firefox/Safari de escritorio: <input webkitdirectory> (lee la carpeta una vez).
 *  - Móvil (iOS/Android): no hay selección de carpetas → la UI ofrece elegir archivos.
 *
 * Privacidad: los archivos se leen en el navegador; no se suben.
 */

const DB = 'nokfi-folders';
const STORE = 'handles';
const MAX_DEPTH = 3;

export const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
export const supportsDirectoryPicker = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && !isMobile();
export const supportsFolderInput = () => !isMobile() && 'webkitdirectory' in document.createElement('input');
export const canPickFolder = () => supportsDirectoryPicker() || supportsFolderInput();

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  try {
    const db = await idb();
    await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch { /* IndexedDB no disponible: solo se pierde el "reabrir" */ }
}

async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  } catch { return null; }
}

async function readHandle(handle, accept, depth = 0, out = []) {
  for await (const entry of handle.values()) {
    if (entry.kind === 'file') {
      if (accept(entry.name)) out.push(await entry.getFile());
    } else if (entry.kind === 'directory' && depth < MAX_DEPTH) {
      await readHandle(entry, accept, depth + 1, out);
    }
  }
  return out;
}

/** @param {string} slot  'folder' | 'invoices' (cada pantalla recuerda la suya) */
export async function pickFolderWithApi(accept, slot) {
  const handle = await window.showDirectoryPicker({ id: `nokfi-${slot}`, mode: 'read' });
  await idbSet(slot, handle);
  return { name: handle.name, files: await readHandle(handle, accept) };
}

export async function lastFolderName(slot) {
  const h = await idbGet(slot);
  return h?.name || null;
}

export async function reopenLastFolder(accept, slot) {
  const handle = await idbGet(slot);
  if (!handle) return null;
  const perm = await handle.requestPermission?.({ mode: 'read' });
  if (perm && perm !== 'granted') return null;
  return { name: handle.name, files: await readHandle(handle, accept) };
}

/** Resultado de un <input webkitdirectory>: nombre de carpeta + archivos aceptados. */
export function fromFolderInput(fileList, accept) {
  const files = Array.from(fileList).filter(f => accept(f.name));
  const first = fileList[0]?.webkitRelativePath || '';
  return { name: first.split('/')[0] || '', files };
}
