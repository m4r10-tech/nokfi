/**
 * Términos de uso de Nokfi. Castellano = versión que prevalece; inglés =
 * traducción (se muestra también en fr/it/de/pl con un aviso). Describe solo
 * lo que la aplicación hace de verdad (planes, prueba, cancelación en Stripe,
 * cuota de IA, reclamación de cobros, enlace de gestoría). Si cambia el
 * producto o la facturación, actualizar aquí y la fecha.
 */
export const TERMS = {
  es: {
    title: 'Términos de uso',
    updated: 'Última actualización: 27 de septiembre de 2026',
    intro: 'Estos términos regulan el uso de Nokfi (nokfi.app), una aplicación web de análisis financiero para autónomos y pymes. Al activar una licencia o usar la aplicación los aceptas. Están escritos para entenderse; si algo no queda claro, escríbenos.',
    sections: [
      { h: 'Quién presta el servicio', ps: ['{OWNER}. Soporte: soporte@nokfi.app.'] },
      { h: 'Qué es Nokfi y qué no es', ps: [
        'Nokfi te ayuda a entender tus números: lleva un libro de facturas, estima tus impuestos trimestrales (modelos 303 y 130), sigue tus cobros, prevé tu caja y genera informes con inteligencia artificial.',
        'Nokfi NO es una asesoría fiscal, contable ni jurídica. Las cifras de impuestos, previsiones y comparativas son estimaciones orientativas calculadas con los datos que tú introduces. No presentan ningún modelo ante Hacienda ni sustituyen a tu gestoría. Revisa siempre los resultados antes de tomar decisiones o presentar declaraciones.',
        'Los informes y textos generados por inteligencia artificial pueden contener errores. Nokfi calcula por sí mismo las cifras que puede calcular (notas de salud, totales, impuestos) y la IA las interpreta, pero debes contrastar cualquier recomendación antes de aplicarla.'
      ] },
      { h: 'Tu cuenta', list: [
        'La licencia es personal para tu negocio. Eres responsable de guardar tu clave de licencia y tu contraseña y de lo que se haga con ellas.',
        'Debes ser mayor de edad y usar Nokfi para tu actividad profesional o empresarial.',
        'Los datos que introduces deben ser tuyos o de tu negocio, o tener derecho a tratarlos.'
      ] },
      { h: 'Planes, prueba y pagos', list: [
        'Los planes (Mini, Pro y Max) y sus precios se muestran en nokfi.app/pricing. Se pagan por adelantado cada mes con tarjeta a través de Stripe; Nokfi no ve ni guarda los datos de tu tarjeta.',
        'El plan Mini incluye 14 días de prueba. Si cancelas antes de que termine no se te cobra nada; si no, el día 14 se cobra el primer mes.',
        'Cada plan incluye una cuota diaria de análisis con IA. El asistente de chat tiene sus propios límites de uso razonable.',
        'Puedes cambiar de plan desde Configuración → Gestionar suscripción. El cambio se aplica al final del periodo que ya has pagado, sin cobros ni abonos parciales.',
        'Podemos cambiar los precios avisándote con al menos 30 días de antelación; el nuevo precio se aplicará a partir de la siguiente renovación y podrás cancelar antes.'
      ] },
      { h: 'Cancelación y reembolsos', ps: [
        'Puedes cancelar cuando quieras desde Configuración → Gestionar suscripción. Mantienes el acceso hasta el final del periodo pagado y no se renueva. No se reembolsan periodos ya iniciados, salvo que la ley lo exija o que el servicio no haya funcionado por causa nuestra.',
        'Nokfi es un servicio para profesionales y empresas. Si contratas como consumidor, conservas los derechos que te reconozca la ley; en particular, al empezar a usar el servicio digital durante el plazo de desistimiento con tu consentimiento expreso, este derecho se pierde en la parte ya prestada.'
      ] },
      { h: 'Emails a tus clientes (reclamación automática de cobros)', list: [
        'Si activas la reclamación automática, Nokfi envía recordatorios de pago a las direcciones de email que tú indicas en tus facturas, en nombre de tu empresa y con respuesta directa a tu email. Tú decides activarlo y a quién se envía.',
        'Eres responsable de que esos emails sean legítimos: que la deuda exista y sea exigible, que el email pertenezca a tu cliente y que el contenido sea correcto. Si el cliente ya ha pagado, marca la factura como cobrada para que no reciba más avisos.',
        'Para estos datos de tus clientes tú eres el responsable del tratamiento y Nokfi el encargado, según el contrato de encargo de tratamiento (nokfi.app/encargo-tratamiento), que forma parte de estos términos.'
      ] },
      { h: 'Enlaces para tu gestoría y API', ps: [
        'Los enlaces de solo lectura que creas dan acceso, sin contraseña, a tu libro de facturas y a las estimaciones de impuestos a quien tenga el enlace. Compártelos solo con quien deba verlos; caducan y puedes revocarlos en cualquier momento.',
        'Las claves de API son secretas y dan acceso a tus análisis. Si una clave se filtra, revócala en Configuración.'
      ] },
      { h: 'Uso aceptable', list: [
        'No uses Nokfi para actividades ilegales, para enviar comunicaciones no deseadas ni para tratar datos que no tengas derecho a tratar.',
        'No intentes saltarte los límites de uso, acceder a datos de otros usuarios, compartir tu licencia fuera de tu negocio ni sobrecargar el servicio (por ejemplo, con automatizaciones abusivas).',
        'Podemos suspender una licencia que incumpla estas reglas, avisándote antes salvo en casos graves o urgentes.'
      ] },
      { h: 'Tus datos y tu contenido', ps: [
        'Tus datos son tuyos. Los tratamos solo para prestarte el servicio, como se explica en la política de privacidad (nokfi.app/privacidad). Puedes descargarlos o borrar tu cuenta en cualquier momento desde Configuración → Mis datos.',
        'Los proveedores de inteligencia artificial que usamos no entrenan sus modelos con tus datos.'
      ] },
      { h: 'Disponibilidad y cambios del servicio', ps: [
        'Trabajamos para que Nokfi esté disponible siempre, pero puede haber interrupciones por mantenimiento, fallos o causas ajenas (proveedores de IA, red, pagos). Las funciones de IA dependen de servicios de terceros y pueden no estar disponibles temporalmente.',
        'Podemos mejorar, cambiar o retirar funciones. Si un cambio te perjudica de forma importante, te avisaremos con antelación y podrás cancelar.'
      ] },
      { h: 'Responsabilidad', ps: [
        'Nokfi se presta «tal cual», con la diligencia razonable. No respondemos de decisiones tomadas a partir de las estimaciones, informes o textos de la aplicación, ni de sanciones, recargos o pérdidas derivadas de declaraciones presentadas sin revisar.',
        'En todo caso, nuestra responsabilidad total frente a ti se limita a lo que hayas pagado por Nokfi en los 12 meses anteriores al hecho que la origine, salvo dolo o negligencia grave, o cuando la ley no permita esta limitación.'
      ] },
      { h: 'Cambios en estos términos', ps: ['Si cambiamos estos términos de forma relevante, te avisaremos por email o en la aplicación con al menos 15 días de antelación. Si no estás de acuerdo, puedes cancelar antes de que entren en vigor.'] },
      { h: 'Ley aplicable', ps: ['Estos términos se rigen por la ley española. Para cualquier conflicto, los juzgados del domicilio del titular de Nokfi, salvo que seas consumidor, en cuyo caso los de tu domicilio.'] }
    ]
  },
  en: {
    title: 'Terms of use',
    updated: 'Last updated: 27 September 2026',
    intro: 'These terms govern the use of Nokfi (nokfi.app), a financial analysis web app for freelancers and small businesses. By activating a licence or using the app you accept them. The Spanish version prevails in case of discrepancy.',
    sections: [
      { h: 'Who provides the service', ps: ['{OWNER}. Support: soporte@nokfi.app.'] },
      { h: 'What Nokfi is and is not', ps: [
        'Nokfi helps you understand your numbers: it keeps an invoice ledger, estimates your quarterly Spanish taxes (forms 303 and 130), tracks what you are owed, forecasts your cash and generates AI reports.',
        'Nokfi is NOT a tax, accounting or legal adviser. Tax figures, forecasts and comparisons are approximate estimates based on the data you enter. Nokfi does not file anything with the tax authorities and does not replace your accountant. Always review the results before making decisions or filing returns.',
        'AI-generated reports and texts may contain mistakes. Nokfi computes the figures it can (health scores, totals, taxes) and the AI interprets them, but you must check any recommendation before acting on it.'
      ] },
      { h: 'Your account', list: [
        'The licence is for your business. You are responsible for keeping your licence key and password safe and for anything done with them.',
        'You must be of legal age and use Nokfi for your professional or business activity.',
        'The data you enter must belong to you or your business, or you must have the right to process it.'
      ] },
      { h: 'Plans, trial and payments', list: [
        'Plans (Mini, Pro and Max) and their prices are shown at nokfi.app/pricing. They are paid monthly in advance by card through Stripe; Nokfi never sees or stores your card details.',
        'The Mini plan includes a 14-day trial. If you cancel before it ends you are not charged; otherwise the first month is charged on day 14.',
        'Each plan includes a daily quota of AI analyses. The chat assistant has its own fair-use limits.',
        'You can change plan from Settings → Manage subscription. The change applies at the end of the period already paid, with no partial charges or credits.',
        'We may change prices with at least 30 days’ notice; the new price applies from the next renewal and you may cancel before then.'
      ] },
      { h: 'Cancellation and refunds', ps: [
        'You can cancel at any time from Settings → Manage subscription. You keep access until the end of the paid period and it will not renew. Periods already started are not refunded, unless required by law or the service failed through our fault.',
        'Nokfi is a service for professionals and businesses. If you contract as a consumer you keep your statutory rights; in particular, by starting to use the digital service during the withdrawal period with your express consent, that right is lost for the part already provided.'
      ] },
      { h: 'Emails to your clients (automatic payment reminders)', list: [
        'If you enable automatic reminders, Nokfi sends payment reminders to the email addresses you enter on your invoices, on behalf of your business and with replies going straight to you. You decide to enable it and who receives them.',
        'You are responsible for those emails being legitimate: the debt exists and is due, the address belongs to your client and the content is accurate. If the client has paid, mark the invoice as collected so no more reminders are sent.',
        'For this client data you are the controller and Nokfi the processor, under the data processing agreement (nokfi.app/encargo-tratamiento), which forms part of these terms.'
      ] },
      { h: 'Accountant links and API', ps: [
        'Read-only links you create give anyone who has the link access, without a password, to your invoice ledger and tax estimates. Share them only with whoever needs them; they expire and you can revoke them at any time.',
        'API keys are secret and give access to your analyses. If a key leaks, revoke it in Settings.'
      ] },
      { h: 'Acceptable use', list: [
        'Do not use Nokfi for illegal activities, to send unsolicited communications or to process data you have no right to process.',
        'Do not try to bypass usage limits, access other users’ data, share your licence outside your business or overload the service (for example with abusive automations).',
        'We may suspend a licence that breaches these rules, notifying you first except in serious or urgent cases.'
      ] },
      { h: 'Your data and content', ps: [
        'Your data is yours. We process it only to provide the service, as explained in the privacy policy (nokfi.app/privacidad). You can download it or delete your account at any time from Settings → My data.',
        'The AI providers we use do not train their models with your data.'
      ] },
      { h: 'Availability and changes', ps: [
        'We work to keep Nokfi available, but there may be interruptions for maintenance, failures or external causes (AI providers, network, payments). AI features depend on third-party services and may be temporarily unavailable.',
        'We may improve, change or remove features. If a change significantly harms you, we will notify you in advance and you may cancel.'
      ] },
      { h: 'Liability', ps: [
        'Nokfi is provided “as is”, with reasonable care. We are not liable for decisions based on the app’s estimates, reports or texts, nor for penalties, surcharges or losses from returns filed without review.',
        'In any case, our total liability to you is limited to what you paid for Nokfi in the 12 months before the event giving rise to it, except for wilful misconduct or gross negligence, or where the law does not allow this limitation.'
      ] },
      { h: 'Changes to these terms', ps: ['If we materially change these terms we will notify you by email or in the app at least 15 days in advance. If you disagree, you can cancel before they take effect.'] },
      { h: 'Governing law', ps: ['These terms are governed by Spanish law. Disputes go to the courts of the Nokfi owner’s domicile, unless you are a consumer, in which case those of your domicile.'] }
    ]
  }
};
