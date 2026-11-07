import { useEffect, useRef, useState } from 'react';

/**
 * S15b (A1) — foco de los diálogos (Modal, hoja «Más», asistente en móvil):
 *   - Tab y Shift+Tab dan la vuelta dentro de `ref` (si `trap`), sin salir al menú de detrás.
 *   - Escape llama a `onEscape`.
 *   - Al cerrar, el foco vuelve al elemento que lo tenía al abrir (el botón que lo abrió);
 *     si ya no está en la página, a `fallback()` si se da.
 * Con varios diálogos abiertos (un ConfirmModal sobre un Modal), solo actúa el de arriba.
 */
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
const stack = [];

export function useFocusTrap(ref, { onEscape, trap = true, fallback } = {}) {
  // El que tenía el foco se lee al pintar por primera vez: en los efectos ya
  // podría estar dentro (un campo con autoFocus se enfoca antes).
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  const opts = useRef({});
  opts.current = { onEscape, trap, fallback };

  useEffect(() => {
    const id = {};
    stack.push(id);
    const onKey = (e) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') { opts.current.onEscape?.(e); return; }
      if (e.key !== 'Tab' || !opts.current.trap) return;
      const root = ref.current;
      if (!root) return;
      const items = [...root.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); root.focus(); return; }
      const first = items[0], last = items[items.length - 1], cur = document.activeElement;
      if (!root.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && (cur === first || cur === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      const target = opener && opener !== document.body && opener.isConnected ? opener : opts.current.fallback?.();
      // Solo si el foco se ha quedado en el diálogo que se cierra o en <body> (no se lo quitamos a otro sitio).
      const cur = document.activeElement;
      if (target?.focus && (!cur || cur === document.body || !cur.isConnected || ref.current?.contains(cur))) target.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
