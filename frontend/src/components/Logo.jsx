/** Logo de Nokfi — usa el icono "N" con flecha + texto (sección 21 del proyecto) */
export default function Logo({ variant = 'default', size = 'md' }) {
  const sizes = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' };
  const iconPx = { sm: 20, md: 28, lg: 40 };
  const fontSize = sizes[size] || sizes.md;
  const iconSize = iconPx[size] || iconPx.md;

  if (variant === 'icon') {
    // Solo el icono, sin texto (para favicon-like o espacios muy reducidos)
    return (
      <img src="/icons/icon-192.png" alt="Nokfi"
        width={iconSize} height={iconSize}
        style={{ display: 'inline-block' }} />
    );
  }

  if (variant === 'solid') {
    // Icono + texto sobre fondo accent (badges, cabeceras, etc.)
    return (
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${fontSize} font-semibold tracking-tight`}
        style={{ background: 'var(--accent)', color: '#FFFFFF' }}>
        <img src="/icons/icon-192.png" alt="Nokfi" width={iconSize} height={iconSize} />
        nokfi
      </div>
    );
  }

  // Default: icono + texto en color primario (sidebar, login, reset, etc.)
  return (
    <span className={`inline-flex items-center gap-2 ${fontSize} font-semibold tracking-tight select-none`}
      style={{ color: 'var(--text-primary)' }}>
      <img src="/icons/icon-192.png" alt="Nokfi" width={iconSize} height={iconSize} />
      nokfi
    </span>
  );
}