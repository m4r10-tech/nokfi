import { useEffect, useRef, useState } from 'react';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * useReveal (Tanda H) — marca un elemento como visible la primera vez que
 * entra en el viewport (IntersectionObserver). Añade `.is-visible` al nodo
 * (para las clases CSS .reveal / .grow-bar) y devuelve el booleano (para
 * lógica JS como los contadores). Sin IO o con reduced-motion → visible ya.
 */
export function useReveal({ threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => { el.classList.add('is-visible'); setVisible(true); };
    if (reducedMotion() || !('IntersectionObserver' in window)) { show(); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { show(); io.disconnect(); }
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return [ref, visible];
}

/** Cuenta de 0 a `target` cuando `start` pasa a true (easeOutExpo, ~1.4s). */
export function useCountUp(target, start, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reducedMotion()) { setValue(target); return; }
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, duration]);
  return value;
}
