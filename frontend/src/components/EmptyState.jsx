/**
 * Estado vacío genérico (sesión 3): icono, título, texto y acciones. Sustituye
 * al antiguo pages/EmptyState.jsx (solo historial, y enlazaba con <a href>,
 * que recargaba la SPA entera).
 */
export default function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="card anim-fade p-8 md:p-12 flex flex-col items-center text-center gap-3">
      {Icon && (
        <div className="rounded-2xl p-3.5 mb-1" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
          <Icon size={24} />
        </div>
      )}
      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {description && <p className="text-sm max-w-md" style={{ color: 'var(--text-secondary)' }}>{description}</p>}
      {children && <div className="flex flex-col sm:flex-row gap-2 mt-2 w-full sm:w-auto">{children}</div>}
    </div>
  );
}
