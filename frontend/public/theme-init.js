/* Sesión 12: aplica el tema guardado antes del primer pintado (sin destello
   oscuro en las páginas prerenderizadas). Archivo propio: la CSP no admite
   scripts en línea. ThemeContext hace lo mismo después, con React. */
try {
  if (localStorage.getItem('nokfi_theme') === 'light') {
    document.documentElement.classList.remove('theme-dark');
    document.documentElement.classList.add('theme-light');
  }
} catch (e) { /* storage bloqueado: tema oscuro por defecto */ }
