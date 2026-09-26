/**
 * Errores de lectura de archivos en el navegador con CÓDIGO técnico (§2.3 del
 * plan de la sesión 4). El mensaje humano sale de i18n (`fileErrors.<code>`)
 * y el código se enseña pequeño al lado para soporte.
 */
export class FileReadError extends Error {
  constructor(code, fileName) {
    super(code);
    this.code = code;
    this.fileName = fileName;
  }
}

export const FILE_ERROR_CODES = [
  'ERR_FILE_TOO_BIG', 'ERR_FILE_TYPE', 'ERR_PDF_TIMEOUT', 'ERR_PDF_PASSWORD', 'ERR_PDF_INVALID', 'ERR_PDF_READ',
  'ERR_XLSX_READ', 'ERR_IMAGE_READ', 'ERR_FILE_READ'
];

/** "No se pudo leer X (protegido con contraseña). · ERR_PDF_PASSWORD" */
export function fileErrorMessage(t, err, fallbackName = '') {
  const code = err instanceof FileReadError ? err.code : 'ERR_FILE_READ';
  const name = err?.fileName || fallbackName;
  const msg = t(`fileErrors.${code}`).replace('{name}', name);
  return { message: msg, code };
}
