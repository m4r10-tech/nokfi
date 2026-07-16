/** Logo de Nokfi — marca "N" con flecha (azul, fondo transparente) + texto.
 *  Secciones 8 / 21 del proyecto.
 *
 *  - variant "default" / "icon":  usa /favicon.svg (la N azul transparente),
 *    que se adapta al fondo del sidebar / login en ambos temas (oscuro/claro)
 *    y escala nítida a cualquier tamaño por ser vectorial.
 *  - variant "solid": usa el icono PWA (cuadrado azul a sangre + N blanca)
 *    para que la N blanca resalte sobre el fondo accent azul.
 */
export default function Logo({ variant = 'default', size = 'md' }) {
  const sizes = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' };
  const iconPx = { sm: 20, md: 28, lg: 40 };
  const fontSize = sizes[size] || sizes.md;
  const iconSize = iconPx[size] || iconPx.md;

  if (variant === 'icon') {
    // Solo la marca, sin texto (espacios muy reducidos). N azul transparente.
    return (
      <img src="/favicon.svg" alt="Nokfi"
        width={iconSize} height={iconSize}
        style={{ display: 'inline-block' }} />
    );
  }

  if (variant === 'solid') {
    // Marca + texto sobre fondo accent (badges, cabeceras). Usa el icono PWA
    // (cuadrado azul a sangre) para que la N blanca resalte sobre el accent.
    return (
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${fontSize} font-semibold tracking-tight`}
        style={{ background: 'var(--accent)', color: '#FFFFFF' }}>
        <img src="/icons/icon-192.png" alt="Nokfi" width={iconSize} height={iconSize} />
        nokfi
      </div>
    );
  }

  // Default: marca (N azul transparente) + texto. Sidebar, login, reset, etc.
  return (
    <span className={`inline-flex items-center gap-2 ${fontSize} font-semibold tracking-tight select-none`}
      style={{ color: 'var(--text-primary)' }}>
      <img src="/favicon.svg" alt="Nokfi" width={iconSize} height={iconSize} />
      nokfi
    </span>
  );
}
