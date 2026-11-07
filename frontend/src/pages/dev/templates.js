/**
 * Sesión 7 — plantillas de n8n listas para importar (public/templates/n8n).
 * Usan el nodo HTTP Request con una credencial Bearer (funcionan sin instalar
 * nada); cuando n8n-nodes-nokfi esté publicado, se podrán cambiar por el nodo.
 */
export const N8N_TEMPLATES = [
  {
    id: 'gmail', file: '/templates/n8n/facturas-gmail-sheets.json',
    credentials: ['Gmail OAuth2', 'Google Sheets OAuth2', 'Bearer Auth (Nokfi)']
  },
  {
    id: 'drive', file: '/templates/n8n/carpeta-drive-resumen-mensual.json',
    credentials: ['Google Drive OAuth2', 'Gmail OAuth2', 'Bearer Auth (Nokfi)']
  },
  {
    id: 'weekly', file: '/templates/n8n/informe-semanal-caja-telegram.json',
    credentials: ['Google Sheets OAuth2', 'Telegram API', 'Bearer Auth (Nokfi)']
  }
];

/** S15b: copia con los nombres de los nodos traducidos (public/templates/n8n/<idioma>/); el castellano es la original. */
export function templateFile(tpl, lang) {
  return lang && lang !== 'es' ? tpl.file.replace('/templates/n8n/', `/templates/n8n/${lang}/`) : tpl.file;
}
