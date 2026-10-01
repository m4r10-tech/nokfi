/**
 * Contrato de encargo de tratamiento (art. 28 RGPD) entre el usuario
 * (responsable) y Nokfi (encargado) para los datos de TERCEROS que el usuario
 * mete en Nokfi: clientes y proveedores de sus facturas (nombre, NIF, email) y
 * personas mencionadas en los archivos que analiza. Se acepta junto con los
 * términos de uso. {OWNER} y {HOSTING} se sustituyen desde legal/owner.js.
 * Si cambia un subencargado, actualizar la lista y la fecha (y avisar a los
 * usuarios con antelación, cláusula 6).
 */
export const DPA = {
  es: {
    title: 'Contrato de encargo de tratamiento',
    updated: 'Última actualización: 2 de octubre de 2026',
    intro: 'Cuando usas Nokfi tratas datos personales de terceros (por ejemplo, el nombre, NIF y email de tus clientes y proveedores). Para esos datos tú eres el responsable del tratamiento y Nokfi actúa como encargado, conforme al artículo 28 del Reglamento General de Protección de Datos (RGPD) y a la Ley Orgánica 3/2018. Este contrato forma parte de los términos de uso y se acepta al activar la licencia.',
    sections: [
      { h: '1. Partes', list: [
        'Responsable: el titular de la licencia de Nokfi (autónomo o empresa).',
        'Encargado: {OWNER}.'
      ] },
      { h: '2. Objeto, duración y finalidad', ps: [
        'Nokfi trata los datos solo para prestarte el servicio contratado: emitir tus facturas con su registro de facturación y su factura electrónica, guardar tu libro de facturas, calcular impuestos, cobros y previsiones, generar informes, enviar los recordatorios de cobro que actives y mostrar los enlaces de solo lectura que crees.',
        'El encargo dura lo mismo que tu licencia. Nokfi no usa estos datos para fines propios, no los vende ni los cede, y los proveedores de inteligencia artificial que intervienen no entrenan modelos con ellos.'
      ] },
      { h: '3. Datos e interesados', list: [
        'Interesados: tus clientes, proveedores y, en su caso, otras personas que aparezcan en los documentos que analizas.',
        'Datos: identificativos y de contacto (nombre o razón social, NIF, dirección, email) y económicos (número, fecha, conceptos, importes, impuestos y estado de pago de las facturas).',
        'No debes introducir categorías especiales de datos (salud, ideología, etc.). Nokfi no las necesita para funcionar.'
      ] },
      { h: '4. Obligaciones de Nokfi como encargado', list: [
        'Tratar los datos solo siguiendo tus instrucciones, que son las que das al usar la aplicación. Si alguna instrucción infringe la normativa, te lo diremos.',
        'Garantizar la confidencialidad: solo accede a los datos el personal que lo necesite para mantener el servicio, sujeto a deber de secreto.',
        'Aplicar las medidas de seguridad de la cláusula 5.',
        'Ayudarte a atender los derechos de los interesados (acceso, rectificación, supresión, oposición, portabilidad…): puedes editar o borrar cualquier dato desde la aplicación, y si nos llega una solicitud te la remitiremos.',
        'Notificarte sin dilación indebida, y como máximo en 48 horas desde que la conozcamos, cualquier brecha de seguridad que afecte a tus datos, con la información disponible para que puedas cumplir tus obligaciones.',
        'Ayudarte, en lo razonable, con evaluaciones de impacto y consultas a la autoridad de control.',
        'Poner a tu disposición la información necesaria para demostrar el cumplimiento de este contrato y permitir auditorías razonables, con preaviso y sin comprometer la seguridad ni los datos de otros usuarios.'
      ] },
      { h: '5. Medidas de seguridad', list: [
        'Cifrado HTTPS en todas las comunicaciones y protección de red por Cloudflare.',
        'Contraseñas guardadas con scrypt; tokens de sesión, de recuperación, claves de API y enlaces compartidos guardados solo como hash.',
        'Separación de datos por licencia en todas las consultas; límites de peticiones frente a abusos.',
        'Los archivos que analizas se leen en tu navegador y no se guardan en nuestros servidores.',
        'API: el registro de llamadas no guarda el contenido (90 días); los resultados de los trabajos asíncronos y el contenido de los webhooks se borran a las 24 h. Los webhooks solo envían datos a las URL que tú configuras, firmados con HMAC y solo a direcciones públicas por https.',
        'Las facturas emitidas, sus líneas y sus registros de facturación no se pueden modificar ni borrar (bloqueo en la base de datos y huella encadenada, Real Decreto 1007/2023).',
        'Copias de seguridad periódicas de la base de datos y registro de eventos de seguridad.'
      ] },
      { h: '6. Subencargados', ps: [
        'Autorizas a Nokfi a usar los siguientes subencargados, que han asumido obligaciones de protección de datos equivalentes a las de este contrato:'
      ], list: [
        '{HOSTING}',
        'Cloudflare, Inc.: red de distribución y seguridad y generación de análisis con IA (Workers AI). Transferencias internacionales amparadas por el Marco de Privacidad de Datos UE-EE. UU. y cláusulas contractuales tipo.',
        'Groq, Inc.: generación de análisis con IA, junto con Cloudflare; sin entrenamiento con los datos y con retención cero. EE. UU., con cláusulas contractuales tipo.',
        'Cerebras Systems, Inc.: generación de análisis con IA como respaldo, solo si Groq y Cloudflare no están disponibles; sin entrenamiento con los datos. EE. UU., con cláusulas contractuales tipo.',
        'Resend (Plus Five Five, Inc.): envío de emails, incluidos los recordatorios de cobro a tus clientes. EE. UU., con cláusulas contractuales tipo.'
      ], after: [
        'Si incorporamos o sustituimos un subencargado (por ejemplo, otro proveedor de IA que no entrene con los datos), lo publicaremos en esta página y te avisaremos con al menos 15 días de antelación; podrás oponerte cancelando tu licencia.',
        'Stripe trata los datos de pago de tu propia suscripción como responsable independiente; no accede a los datos de tus clientes.',
        'Si activas el envío de registros a la Agencia Tributaria (VERI*FACTU), los registros de tus facturas, con los datos de tus clientes que contienen, se comunicarán a la AEAT por obligación legal: la AEAT es destinataria por ley, no subencargada. Ese envío está desactivado por ahora.'
      ] },
      { h: '7. Tus obligaciones como responsable', list: [
        'Tener una base legal para tratar los datos de tus clientes y proveedores (normalmente, la relación comercial y el interés legítimo en cobrar las facturas) e informarles cuando corresponda.',
        'Asegurarte de que los datos son correctos y de que los recordatorios de cobro que activas son procedentes.',
        'No introducir datos innecesarios ni categorías especiales.'
      ] },
      { h: '8. Fin del encargo', ps: [
        'Al borrar tu cuenta (Configuración → Mis datos) se eliminan de inmediato tus datos y los de tus clientes y proveedores de la base de datos activa. Las copias de seguridad se sobrescriben en su ciclo normal, como máximo en 30 días. Antes de borrarla puedes descargar todos tus datos. Se borran también las facturas que hayas emitido y sus registros: la obligación de conservarlas durante el plazo legal es tuya, así que descárgalas antes.'
      ] },
      { h: '9. Contacto', ps: ['Para cualquier cuestión sobre este contrato: info@nokfi.app.'] }
    ]
  },
  en: {
    title: 'Data processing agreement',
    updated: 'Last updated: 2 October 2026',
    intro: 'When you use Nokfi you process personal data of third parties (for example, the name, tax ID and email of your clients and suppliers). For that data you are the controller and Nokfi acts as processor, under Article 28 of the General Data Protection Regulation (GDPR). This agreement is part of the terms of use and is accepted when you activate your licence. The Spanish version prevails in case of discrepancy.',
    sections: [
      { h: '1. Parties', list: [
        'Controller: the Nokfi licence holder (freelancer or company).',
        'Processor: {OWNER}.'
      ] },
      { h: '2. Subject, duration and purpose', ps: [
        'Nokfi processes the data only to provide the service: issuing your invoices with their billing record and e-invoice, storing your invoice ledger, computing taxes, receivables and forecasts, generating reports, sending the payment reminders you enable and serving the read-only links you create.',
        'The processing lasts as long as your licence. Nokfi does not use this data for its own purposes, does not sell or share it, and the AI providers involved do not train models with it.'
      ] },
      { h: '3. Data and data subjects', list: [
        'Data subjects: your clients, suppliers and any other people appearing in the documents you analyse.',
        'Data: identification and contact (name or company name, tax ID, address, email) and financial (invoice number, date, items, amounts, taxes and payment status).',
        'You must not enter special categories of data (health, beliefs, etc.). Nokfi does not need them.'
      ] },
      { h: '4. Nokfi’s obligations as processor', list: [
        'Process the data only on your instructions, which are the ones you give by using the app. We will tell you if an instruction infringes data protection law.',
        'Ensure confidentiality: only staff who need it to maintain the service access the data, under a duty of secrecy.',
        'Apply the security measures in clause 5.',
        'Help you respond to data subjects’ rights: you can edit or delete any data in the app, and we will forward any request we receive.',
        'Notify you without undue delay, and within 48 hours of becoming aware, of any personal data breach affecting your data, with the information available.',
        'Reasonably assist you with impact assessments and prior consultations.',
        'Make available the information needed to demonstrate compliance and allow reasonable audits, with notice and without compromising security or other users’ data.'
      ] },
      { h: '5. Security measures', list: [
        'HTTPS encryption for all communications and network protection by Cloudflare.',
        'Passwords stored with scrypt; session, recovery, API and share-link tokens stored only as hashes.',
        'Data separated per licence in every query; rate limits against abuse.',
        'Files you analyse are read in your browser and not stored on our servers.',
        'API: the call log never stores content (90 days); async job results and webhook contents are deleted after 24 h. Webhooks only send data to the URLs you configure, HMAC-signed and only to public https addresses.',
        'Issued invoices, their lines and their billing records cannot be changed or deleted (database lock and chained fingerprint, Royal Decree 1007/2023).',
        'Regular database backups and security event logging.'
      ] },
      { h: '6. Sub-processors', ps: ['You authorise Nokfi to use the following sub-processors, bound by data protection obligations equivalent to this agreement:'], list: [
        '{HOSTING}',
        'Cloudflare, Inc.: content delivery and security network and AI analyses (Workers AI). International transfers covered by the EU-US Data Privacy Framework and standard contractual clauses.',
        'Groq, Inc.: AI analyses, together with Cloudflare; no training on the data and zero data retention. US, under standard contractual clauses.',
        'Cerebras Systems, Inc.: backup AI analyses, used only if Groq and Cloudflare are unavailable; no training on the data. US, under standard contractual clauses.',
        'Resend (Plus Five Five, Inc.): email delivery, including payment reminders to your clients. USA, with standard contractual clauses.'
      ], after: [
        'If we add or replace a sub-processor (for example another AI provider that does not train on data), we will publish it here and notify you at least 15 days in advance; you may object by cancelling your licence.',
        'Stripe processes the payment data of your own subscription as an independent controller; it has no access to your clients’ data.',
        'If you turn on sending records to the Spanish Tax Agency (VERI*FACTU), the records of your invoices, with the client data they contain, will be communicated to the AEAT under a legal obligation: the AEAT is a recipient by law, not a sub-processor. Sending is turned off for now.'
      ] },
      { h: '7. Your obligations as controller', list: [
        'Have a legal basis to process your clients’ and suppliers’ data (usually the business relationship and the legitimate interest in collecting invoices) and inform them where required.',
        'Make sure the data is accurate and that the payment reminders you enable are justified.',
        'Do not enter unnecessary data or special categories.'
      ] },
      { h: '8. End of processing', ps: ['When you delete your account (Settings → My data), your data and your clients’ and suppliers’ data are removed immediately from the live database. Backups are overwritten in their normal cycle, within 30 days at most. You can download all your data before deleting it. The invoices you issued and their records are deleted too: keeping them for the legal period is your obligation, so download them first.'] },
      { h: '9. Contact', ps: ['For any question about this agreement: info@nokfi.app.'] }
    ]
  }
};
