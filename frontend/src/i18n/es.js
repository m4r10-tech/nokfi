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
    requestReset: 'Restablecer contraseña', notFound: 'Email o clave de licencia incorrectos.',
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
    checkoutError: 'No se pudo iniciar el pago. Inténtalo de nuevo.'
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
  footer: { rights: 'Todos los derechos reservados' }
};
