export default {
  common: {
    save: 'Guardar', cancel: 'Cancelar', continue: 'Continuar', back: 'Atrás',
    loading: 'Cargando...', error: 'Ha ocurrido un error', retry: 'Reintentar',
    yes: 'Sí', no: 'No', close: 'Cerrar', copy: 'Copiar', copied: 'Copiado',
    download: 'Descargar', export: 'Exportar', analyze: 'Analizar con IA'
  },
  nav: {
    home: 'Home', questionnaire: 'Cuestionario', excel: 'Análisis Excel',
    history: 'Historial', calculators: 'Calculadoras', reports: 'Informes',
    settings: 'Configuración', logout: 'Cerrar sesión'
  },
  login: {
    title: 'Accede a Nokfi', subtitle: 'Introduce tus datos para continuar',
    email: 'Email', licenseKey: 'Clave de licencia', password: 'Contraseña',
    confirmPassword: 'Repetir contraseña', newPassword: 'Nueva contraseña',
    activateBtn: 'Activar licencia', loginBtn: 'Iniciar sesión',
    firstTime: '¿Primera vez? Activa tu licencia',
    alreadyActivated: '¿Ya activaste tu licencia? Inicia sesión',
    deviceNameOptional: 'Nombre de este dispositivo (opcional)', generator: 'Generar contraseña',
    requestReset: 'Restablecer contraseña', forgotKey: '¿Olvidaste tu clave o contraseña?', notFound: 'Email o clave de licencia incorrectos.',
    invalidCredentials: 'Email, clave o contraseña incorrectos.',
    invalidKeyFormat: 'Formato de clave inválido. Usa XXXX-XXXX-XXXX-XXXX.',
    licenseInactive: 'Esta licencia no está activa. Contacta con soporte.',
    notActivated: 'Esta licencia aún no tiene contraseña. Usa la activación inicial.',
    alreadyActivatedMsg: 'Esta licencia ya tiene contraseña. Inicia sesión o restablécela.',
    passwordMismatch: 'Las contraseñas no coinciden.',
    weakPassword: 'La contraseña debe tener al menos 8 caracteres.',
    noLicense: '¿Aún no tienes licencia? Ver planes y precios'
  },
  resetPassword: {
    title: 'Restablecer contraseña', email: 'Email', licenseKey: 'Clave de licencia',
    submit: 'Enviar enlace', submitConfirm: 'Guardar contraseña',
    sent: 'Si los datos son correctos, recibirás un email con instrucciones.',
    confirmTitle: 'Elige una nueva contraseña',
    success: 'Contraseña restablecida correctamente.', invalidToken: 'Este enlace no es válido o ha expirado.',
    noGeneratorHint: 'Por seguridad, elige tú mismo una contraseña que recuerdes.'
  },
  reveal: {
    title: '¡Pago completado!', subtitle: 'Esta es tu clave de licencia de Nokfi.',
    yourKey: 'Tu clave de licencia', alsoEmailed: 'También te la hemos enviado por email.',
    goLogin: 'Ir a iniciar sesión', notFound: 'No se encontró tu pago. Si crees que es un error, escríbenos.',
    pending: 'Estamos confirmando tu pago, un momento...'
  },
  config: {
    title: 'Configuración',
    appearance: 'Apariencia', theme: 'Tema', dark: 'Oscuro', light: 'Claro',
    language: 'Idioma', profile: 'Perfil de empresa', companyName: 'Nombre', sector: 'Sector',
    session: 'Sesión', planLabel: 'Plan', deviceLabel: 'Dispositivo', logout: 'Cerrar sesión',
    licenseKeySection: 'Mi clave de licencia',
    revealKeyHint: 'Tu clave está oculta. Introduce tu contraseña para verla.',
    showKey: 'Mostrar', hideKey: 'Ocultar',
    changePasswordSection: 'Contraseña', currentPassword: 'Contraseña actual', newPassword: 'Nueva contraseña',
    changePasswordBtn: 'Cambiar contraseña', passwordChanged: 'Contraseña actualizada correctamente.',
    subscriptionSection: 'Suscripción',
    subscriptionPlan: 'Plan actual', subscriptionStatus: 'Estado', subscriptionRenews: 'Próxima renovación',
    subscriptionCancelled: 'Cancelada — acceso hasta el fin de periodo',
    subscriptionNoRenewal: 'Sin renovación programada',
    trialRow: 'Período de prueba',
    trialDaysLeft: 'Quedan {n} días',
    aiQuota: 'Cuota de análisis IA', aiQuotaPerDay: 'análisis/día',
    manageSubscription: 'Gestionar suscripción',
    manageHint: 'Cancela o mejora tu plan desde el portal de Stripe. La mejora se prorratea automáticamente.',
    legacyNote: 'Esta es una licencia legacy (de por vida). No hay suscripción de Stripe que gestionar.',
    portalError: 'No se pudo abrir el portal de gestión. Inténtalo de nuevo más tarde.'
  },
  pricing: {
    title: 'Elige tu plan', subtitle: 'Suscripción mensual. Cancela cuando quieras.',
    perMonth: '/mes', emailPlaceholder: 'Tu email',
    cta: 'Suscribirme', goLogin: 'Ya tengo licencia — iniciar sesión',
    features: {
      mini: ['10 análisis IA al día', 'Diagnóstico completo', '6 análisis Excel', 'Historial'],
      pro: ['50 análisis IA al día', 'Todo lo de Mini', 'Calculadoras avanzadas', 'Informes'],
      max: ['130 análisis IA al día', 'Todo lo de Pro', 'Soporte prioritario', 'Acceso anticipado a novedades']
    },
    aiBadge: 'análisis IA/día',
    trialBadge: '14 días gratis',
    monthSuffix: '/mes',
    invalidEmail: 'Introduce un email válido.',
    checkoutError: 'No se pudo iniciar el pago. Inténtalo de nuevo.',
    plansLoadError: 'No se pudieron cargar los precios. Revisa tu conexión y recarga la página.',
    loading: 'Cargando planes…'
  },
  onboarding: {
    welcome: 'Bienvenido a Nokfi', subtitle: 'Cuéntanos un poco sobre tu negocio para personalizar tus análisis',
    companyName: 'Nombre de la empresa', sector: 'Sector', size: 'Tamaño',
    mainExpenses: 'Principales gastos del negocio', start: 'Empezar a usar Nokfi'
  },
  home: {
    welcomeCard: 'Tu panel está listo. Empieza cuando quieras — no hay un orden obligatorio.',
    startQuestionnaire: 'Hacer el diagnóstico', uploadData: 'Subir mis datos',
    healthScore: 'Salud financiera', activeAlerts: 'Alertas activas', lastAnalysis: 'Último análisis'
  },
  excel: {
    importTitle: 'Importar archivos', importHint: 'Arrastra archivos o haz clic para seleccionar',
    formats: 'Formatos: .xlsx, .xls, .csv, .pdf · Máx 5MB · Hasta 3 archivos',
    contextPlaceholder: 'Añade contexto para que la IA entienda este archivo...',
    recentFiles: 'Archivos recientes', compareMode: 'Modo comparación',
    scannedPdfWarning: 'Este PDF parece ser una imagen escaneada.',
    convertToExcel: 'Convertir a Excel', continueAnyway: 'Continuar igualmente',
    aiAnalysis: 'Análisis de la IA', exportResult: 'Exportar resultado'
  },
  history: {
    title: 'Historial',
    loading: 'Cargando historial...', loadError: 'No se pudo cargar el historial.',
    emptyTitle: 'Aún no has generado ningún análisis',
    emptyDesc: 'Aquí aparecerán tus análisis anteriores (cuestionario y subapartados de Excel) una vez que hagas el primero.',
    emptyCta: 'Ir al cuestionario',
    listDesc: 'Tus análisis anteriores, los más recientes primero.',
    typeCuestionario: 'Cuestionario', typeExcel: 'Excel', typeAnalysis: 'Análisis',
    backToList: 'Volver al historial',
    detailPromptChars: 'Caracteres analizados',
    exportPdf: 'PDF',
    loadDetailError: 'No se pudo cargar este análisis.'
  },
  footer: { rights: 'Todos los derechos reservados' },
  landing: {
    login: 'Iniciar sesión',
    heroTitle: '¿Sabes realmente a dónde va el dinero de tu negocio?',
    heroSubtitle: 'Nokfi analiza tus finanzas con IA y te dice qué cortar, qué reforzar y dónde está el margen. Para autónomos y pymes.',
    heroCta: 'Empezar ahora',
    heroTrialHint: 'Prueba gratis 14 días · Sin permanencia · Cancela cuando quieras',
    aboutHeading: 'Qué es Nokfi',
    aboutBody: 'Diagnóstico financiero y análisis de datos con IA en lenguaje claro, sin instalar nada. Pensado para autónomos, freelancers y pymes que gestionan su negocio en Excel y no quieren perder horas clasificando números.',
    aboutFeatures: [
      { t: 'Cuestionario de diagnóstico', d: '5 bloques de preguntas rápidas; la IA devuelve tu salud financiera y qué priorizar.' },
      { t: '6 análisis de Excel con IA', d: 'Stock, ventas, servicios, entradas, caja y profit total. Sube tu archivo y obtén conclusiones.' },
      { t: 'Informe estilo consultoría', d: 'Recomendaciones concretas accionables, no gráficos sin contexto.' },
      { t: 'Calculadoras e historial', d: 'Punto de equilibrio, margen y ROI; revisa análisis anteriores y expórtalos a PDF o Excel.' }
    ],
    plansHeading: 'Planes y precios',
    choosePlan: 'Suscribirme',
    finalTitle: 'Tu negocio, bajo control.',
    finalCta: 'Empezar ahora',
    finalLogin: 'Ya tengo licencia — iniciar sesión',
    faqHeading: 'Preguntas frecuentes',
    faqItems: [
      { q: '¿Qué es Nokfi?', a: 'Una aplicación web de diagnóstico financiero para autónomos y pymes: un cuestionario guiado, análisis de tus hojas de Excel y PDF con IA, calculadoras financieras e informes exportables a PDF y Excel.' },
      { q: '¿Tengo que instalar algo o subir mis archivos?', a: 'No. Funciona en el navegador, sin instalar nada. Tus archivos Excel y PDF se leen localmente en tu propio dispositivo: nunca se suben a nuestros servidores.' },
      { q: '¿Cómo funciona la prueba gratuita?', a: 'El plan Mini incluye 14 días gratis. Se pide una tarjeta al registrarte, pero no se cobra nada hasta que termina la prueba. Si cancelas antes, no pagas.' },
      { q: '¿Puedo cambiar de plan o cancelar cuando quiera?', a: 'Sí, sin permanencia. Desde Configuración accedes al portal de Stripe para cambiar de plan o cancelar; los cambios se aplican al final del periodo en curso.' },
      { q: '¿En qué se diferencian los planes?', a: 'Todos incluyen las mismas funciones; cambia la cuota diaria de análisis con IA: 10 al día en Mini, 50 en Pro y 130 en Max.' }
    ],
    faqPrivacyLink: '¿Qué hacemos con tus datos? Lee la política de privacidad',
    privacyLink: 'Privacidad'
  },
  notFound: {
    title: 'Página no encontrada',
    desc: 'La página que buscas no existe o ha cambiado de dirección.',
    cta: 'Volver al inicio'
  },
  recovery: {
    title: 'Recuperar acceso',
    stepEmailTitle: '¿Olvidaste tu clave o tu contraseña?',
    stepEmailDesc: 'Introduce el email con el que compraste tu licencia. Te enviaremos un código de verificación de 6 dígitos.',
    emailPlaceholder: 'tu@email.com',
    sendCode: 'Enviar código',
    sentGeneric: 'Si el email corresponde a una cuenta, recibirás un código de verificación en unos minutos.',
    stepCodeTitle: 'Introduce el código',
    stepCodeDesc: 'Te hemos enviado un código de 6 dígitos a tu email. Caduca en 10 minutos.',
    codePlaceholder: 'Código de 6 dígitos',
    verifyCode: 'Verificar código',
    invalidCode: 'El código no es válido o ha expirado.',
    codeBurned: 'Demasiados intentos fallidos. Solicita un nuevo código.',
    requestNewCode: 'Solicitar un nuevo código',
    stepKeysTitle: 'Tus claves de licencia',
    stepKeysDesc: 'Estas son las claves activas asociadas a tu email. Guárdalas en un lugar seguro.',
    copied: '¡Copiada!',
    copy: 'Copiar',
    sendKeysEmail: 'Enviármelas por email',
    keysSent: 'Claves enviadas a tu email.',
    changePwdTitle: '¿También quieres cambiar la contraseña?',
    changePwdDesc: 'Opcional. Elige una contraseña nueva y entrarás directamente a tu cuenta. Solo afecta a la licencia seleccionada.',
    chooseKey: '¿Para qué licencia quieres cambiar la contraseña?',
    newPassword: 'Nueva contraseña',
    confirmPassword: 'Repite la contraseña',
    changePwdBtn: 'Cambiar contraseña y entrar',
    passwordMismatch: 'Las contraseñas no coinciden.',
    goLogin: 'Ir a iniciar sesión',
    backToLogin: 'Volver al inicio de sesión'
  },
  meta: {
    landingTitle: 'Nokfi — Tu negocio, bajo control',
    landingDesc: 'Nokfi — Diagnóstico financiero y análisis de datos con IA para autónomos y pymes.',
    pricingTitle: 'Planes y precios — Nokfi',
    pricingDesc: 'Planes de suscripción de Nokfi: Mini, Pro y Max. Prueba gratis 14 días, sin permanencia.',
    loginTitle: 'Iniciar sesión — Nokfi',
    resetTitle: 'Restablecer contraseña — Nokfi',
    recoveryTitle: 'Recuperar acceso — Nokfi',
    revealTitle: 'Tu licencia — Nokfi',
    notFoundTitle: 'Página no encontrada — Nokfi',
    privacyTitle: 'Política de privacidad — Nokfi',
    privacyDesc: 'Cómo trata Nokfi tus datos: qué guardamos, qué no, y qué servicios intervienen.'
  },
  privacy: {
    title: 'Política de privacidad',
    updated: 'Última actualización: septiembre de 2026',
    intro: 'Esta política describe, sin letra pequeña, qué datos trata Nokfi (nokfi.app), para qué y qué servicios de terceros intervienen. Refleja exactamente cómo funciona la aplicación.',
    sections: [
      { h: 'Responsable y contacto', ps: ['El responsable del tratamiento es Nokfi (nokfi.app). Para cualquier cuestión de privacidad o para ejercer tus derechos, escribe a info@nokfi.app.'] },
      { h: 'Qué datos tratamos', list: [
        'Cuenta: tu email, tu clave de licencia y tu contraseña. La contraseña se almacena únicamente como hash criptográfico (scrypt); nunca en texto plano.',
        'Perfil de empresa (opcional): nombre, sector, tamaño y principales gastos, usados para personalizar los análisis.',
        'Historial de análisis: guardamos el informe generado por la IA y el tamaño del contenido analizado — no el contenido completo de tus archivos.',
        'Suscripción: identificadores de cliente y suscripción de Stripe, plan y estado. Nunca vemos ni almacenamos los datos de tu tarjeta.',
        'Registros técnicos: dirección IP y eventos de seguridad (inicios de sesión, errores) para proteger el servicio.'
      ] },
      { h: 'Tus archivos no se suben a nuestros servidores', ps: [
        'Los archivos Excel y PDF que analizas se leen localmente, en tu propio navegador. Nunca se suben ni se almacenan en nuestros servidores.',
        'Para generar el análisis, el texto extraído de tu archivo se envía, a través de nuestro servidor, al servicio de inteligencia artificial.'
      ] },
      { h: 'Servicios de terceros que intervienen', list: [
        'Stripe: procesa los pagos y gestiona las suscripciones.',
        'Google Gemini: genera los análisis con IA. Con el plan actual de este servicio, Google puede utilizar los contenidos enviados según sus propios términos; evita incluir datos especialmente sensibles en los análisis.',
        'Resend: envía los emails transaccionales (tu clave de licencia, recuperación de contraseña).',
        'Cloudflare: red de distribución y seguridad que protege el acceso a la web.'
      ] },
      { h: 'Cookies y analítica', ps: ['Nokfi no utiliza cookies de seguimiento ni herramientas de analítica de terceros. Tu sesión se guarda en el almacenamiento local de tu navegador.'] },
      { h: 'Conservación y eliminación', ps: ['Conservamos tus datos mientras tu licencia esté activa. Si la licencia se elimina, se borran con ella tu perfil, tu historial de análisis y tus sesiones.'] },
      { h: 'Tus derechos', ps: ['Puedes ejercer tus derechos de acceso, rectificación, supresión, portabilidad y oposición escribiendo a info@nokfi.app. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).'] },
      { h: 'Seguridad', ps: ['Aplicamos HTTPS en todo el servicio, contraseñas hasheadas con scrypt, tokens de sesión y de recuperación almacenados como hash, y copias de seguridad periódicas de la base de datos en el servidor.'] }
    ]
  }
};
