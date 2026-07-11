/** Logo de Nokfi — dos variantes oficiales (sección 21 del proyecto) */
export default function Logo({ variant = 'text', size = 'md' }) {
  const sizes = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' };
  const fontSize = sizes[size] || sizes.md;

  if (variant === 'solid') {
    return (
      <div className={`inline-flex items-center justify-center px-4 py-2 rounded-lg ${fontSize} font-semibold tracking-tight`}
        style={{ background: '#3B82F6', color: '#FFFFFF' }}>
        nokfi
      </div>
    );
  }

  return (
    <span className={`${fontSize} font-semibold tracking-tight select-none`} style={{ color: 'var(--text-primary)' }}>
      nok<span style={{ color: '#3B82F6' }}>fi</span>
    </span>
  );
}
