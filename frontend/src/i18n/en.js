export default {
  common: {
    save: 'Save', cancel: 'Cancel', continue: 'Continue', back: 'Back',
    loading: 'Loading...', error: 'An error occurred', retry: 'Retry',
    yes: 'Yes', no: 'No', close: 'Close', copy: 'Copy', copied: 'Copied',
    download: 'Download', export: 'Export', analyze: 'Analyze with AI'
  },
  nav: {
    home: 'Home', questionnaire: 'Questionnaire', excel: 'Excel Analysis',
    history: 'History', calculators: 'Calculators', reports: 'Reports',
    settings: 'Settings', logout: 'Log out'
  },
  login: {
    title: 'Access Nokfi', subtitle: 'Enter your details to continue',
    email: 'Email', licenseKey: 'License key', password: 'Password',
    confirmPassword: 'Confirm password', newPassword: 'New password',
    activateBtn: 'Activate license', loginBtn: 'Log in',
    firstTime: 'First time? Activate your license',
    alreadyActivated: 'Already activated? Log in',
    deviceNameOptional: 'Name of this device (optional)', generator: 'Generate password',
    requestReset: 'Reset password', notFound: 'Incorrect email or license key.',
    invalidCredentials: 'Incorrect email, license key or password.',
    invalidKeyFormat: 'Invalid key format. Use XXXX-XXXX-XXXX-XXXX.',
    licenseInactive: 'This license is not active. Contact support.',
    notActivated: 'This license has no password yet. Use the initial activation.',
    alreadyActivatedMsg: 'This license already has a password. Log in or reset it.',
    passwordMismatch: 'Passwords do not match.',
    weakPassword: 'Password must be at least 8 characters.',
    noLicense: 'No license yet? See plans and pricing'
  },
  resetPassword: {
    title: 'Reset password', email: 'Email', licenseKey: 'License key',
    submit: 'Send link', submitConfirm: 'Save password',
    sent: 'If the details are correct, you will receive an email with instructions.',
    confirmTitle: 'Choose a new password',
    success: 'Password reset successfully.', invalidToken: 'This link is invalid or has expired.',
    noGeneratorHint: 'For security, pick your own password that you will remember.'
  },
  reveal: {
    title: 'Payment complete!', subtitle: 'This is your Nokfi license key.',
    yourKey: 'Your license key', alsoEmailed: 'We have also emailed it to you.',
    goLogin: 'Go to login', notFound: 'We could not find your payment. If you believe this is an error, contact us.',
    pending: 'We are confirming your payment, one moment...'
  },
  config: {
    title: 'Settings',
    appearance: 'Appearance', theme: 'Theme', dark: 'Dark', light: 'Light',
    language: 'Language', profile: 'Company profile', companyName: 'Name', sector: 'Sector',
    session: 'Session', planLabel: 'Plan', deviceLabel: 'Device', logout: 'Log out',
    licenseKeySection: 'My license key',
    revealKeyHint: 'Your key is hidden. Enter your password to reveal it.',
    showKey: 'Show', hideKey: 'Hide',
    changePasswordSection: 'Password', currentPassword: 'Current password', newPassword: 'New password',
    changePasswordBtn: 'Change password', passwordChanged: 'Password updated successfully.',
    subscriptionSection: 'Subscription',
    subscriptionPlan: 'Current plan', subscriptionStatus: 'Status', subscriptionRenews: 'Next renewal',
    subscriptionCancelled: 'Cancelled — access until end of period',
    subscriptionNoRenewal: 'No renewal scheduled',
    trialRow: 'Trial period',
    trialDaysLeft: '{n} days left',
    aiQuota: 'AI analysis quota', aiQuotaPerDay: 'analyses/day',
    manageSubscription: 'Manage subscription',
    manageHint: 'Cancel or upgrade your plan from the Stripe portal. Upgrades are prorated automatically.',
    legacyNote: 'This is a legacy (lifetime) license. There is no Stripe subscription to manage.',
    portalError: 'Could not open the management portal. Please try again later.'
  },
  pricing: {
    title: 'Choose your plan', subtitle: 'Monthly subscription. Cancel anytime.',
    perMonth: '/mo', emailPlaceholder: 'Your email',
    cta: 'Subscribe', goLogin: 'I already have a license — log in',
    features: {
      mini: ['10 AI analyses per day', 'Full diagnosis', '6 Excel analyses', 'History'],
      pro: ['50 AI analyses per day', 'Everything in Mini', 'Advanced calculators', 'Reports'],
      max: ['130 AI analyses per day', 'Everything in Pro', 'Priority support', 'Early access to new features']
    },
    aiBadge: 'AI analyses/day',
    trialBadge: '14-day free trial',
    monthSuffix: '/mo',
    invalidEmail: 'Please enter a valid email.',
    checkoutError: 'Could not start checkout. Please try again.'
  },
  onboarding: {
    welcome: 'Welcome to Nokfi', subtitle: 'Tell us a bit about your business to personalize your analyses',
    companyName: 'Company name', sector: 'Sector', size: 'Size',
    mainExpenses: 'Main business expenses', start: 'Start using Nokfi'
  },
  home: {
    welcomeCard: 'Your dashboard is ready. Start whenever you like — there is no required order.',
    startQuestionnaire: 'Run diagnosis', uploadData: 'Upload my data',
    healthScore: 'Financial health', activeAlerts: 'Active alerts', lastAnalysis: 'Last analysis'
  },
  excel: {
    importTitle: 'Import files', importHint: 'Drag files here or click to select',
    formats: 'Formats: .xlsx, .xls, .csv, .pdf · Max 5MB · Up to 3 files',
    contextPlaceholder: 'Add context so the AI understands this file...',
    recentFiles: 'Recent files', compareMode: 'Compare mode',
    scannedPdfWarning: 'This PDF looks like a scanned image.',
    convertToExcel: 'Convert to Excel', continueAnyway: 'Continue anyway',
    aiAnalysis: 'AI analysis', exportResult: 'Export result'
  },
  footer: { rights: 'All rights reserved' }
};
