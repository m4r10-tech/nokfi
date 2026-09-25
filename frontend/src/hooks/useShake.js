import { useRef, useCallback } from 'react';

/**
 * Shake sutil de un formulario al fallar (Tanda L). Re-dispara la animación
 * aunque ya se haya aplicado (quitar clase → reflow → poner). Con
 * prefers-reduced-motion la regla global de index.css la anula.
 */
export function useShake() {
  const ref = useRef(null);
  const shake = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('anim-shake');
    void el.offsetWidth; // fuerza reflow para reiniciar la animación
    el.classList.add('anim-shake');
  }, []);
  return [ref, shake];
}

