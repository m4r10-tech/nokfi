/**
 * Idioma de respuesta de la IA. Las instrucciones internas de los prompts
 * siguen en castellano (la IA las entiende igual), pero el INFORME debe salir
 * en el idioma de la app. Al añadir idiomas, añadir aquí su instrucción.
 */
const DIRECTIVES = {
  es: 'Responde en español.',
  en: 'Write the ENTIRE response in English, including every heading. Do not use Spanish.'
};

export function aiLanguageDirective(lang) {
  return DIRECTIVES[lang] || DIRECTIVES.es;
}
