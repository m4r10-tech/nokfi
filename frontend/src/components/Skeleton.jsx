/**
 * Skeleton (Tanda S, sesión 3) — bloque de carga con la FORMA del contenido
 * real. Estilo y animación en `.skeleton` (index.css), con variables de tema:
 * funciona en claro/oscuro y respeta prefers-reduced-motion.
 *
 *   <Skeleton className="h-4 w-32" />
 *   <SkeletonText lines={3} />
 *
 * aria-hidden: el contenedor que lo use debe llevar aria-busy / un texto
 * accesible (los lectores no deben leer bloques grises).
 */
export default function Skeleton({ className = '', style }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />;
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-3.5" style={{ width: i === lines - 1 ? '62%' : `${92 - (i % 3) * 7}%` }} />
      ))}
    </div>
  );
}
