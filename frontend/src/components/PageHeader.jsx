/**
 * Cabecera estándar de las pantallas de /app (sesión 3): mismo tamaño de
 * título, mismo ritmo vertical y hueco para acciones a la derecha (que en
 * móvil bajan debajo del título).
 */
export default function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        {description && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{description}</p>}
        {children}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
