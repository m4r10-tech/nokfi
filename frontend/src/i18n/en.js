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
    checkoutError: 'Could not start checkout. Please try again.',
    plansLoadError: 'Couldn’t load the prices. Check your connection and reload the page.',
    loading: 'Loading plans…'
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
  history: {
    title: 'History',
    loading: 'Loading history...', loadError: 'Could not load the history.',
    emptyTitle: "You haven't generated any analysis yet",
    emptyDesc: 'Your past analyses (questionnaire and Excel sections) will appear here once you run your first one.',
    emptyCta: 'Go to questionnaire',
    listDesc: 'Your past analyses, most recent first.',
    typeCuestionario: 'Questionnaire', typeExcel: 'Excel', typeAnalysis: 'Analysis',
    backToList: 'Back to history',
    detailPromptChars: 'Characters analyzed',
    exportPdf: 'PDF',
    loadDetailError: 'Could not load this analysis.'
  },
  footer: { rights: 'All rights reserved' },
  landing: {
    login: 'Sign in',
    heroTitle: 'Do you really know where your business money goes?',
    heroSubtitle: 'Nokfi analyses your finances with AI and tells you what to cut, what to reinforce and where the margin is. For freelancers and small businesses.',
    heroCta: 'Get started',
    heroTrialHint: '14-day free trial · No lock-in · Cancel anytime',
    aboutHeading: 'What Nokfi is',
    aboutBody: 'AI-powered financial diagnosis and data analysis in plain language, nothing to install. Built for freelancers and small businesses that run on Excel and don\'t want to spend hours sorting numbers.',
    aboutFeatures: [
      { t: 'Diagnosis questionnaire', d: '5 quick blocks of questions; the AI returns your financial health and what to prioritise.' },
      { t: '6 Excel analyses with AI', d: 'Stock, sales, services, inputs, cash and total profit. Upload your file and get conclusions.' },
      { t: 'Consultancy-style report', d: 'Concrete, actionable recommendations — not contextless charts.' },
      { t: 'Calculators & history', d: 'Break-even, margin and ROI; revisit past analyses and export them to PDF or Excel.' }
    ],
    plansHeading: 'Plans & pricing',
    choosePlan: 'Subscribe',
    finalTitle: 'Your business, under control.',
    finalCta: 'Get started',
    finalLogin: 'I already have a license — sign in',
    faqHeading: 'Frequently asked questions',
    faqItems: [
      { q: 'What is Nokfi?', a: 'A web app for financial diagnosis aimed at freelancers and small businesses: a guided questionnaire, AI analysis of your Excel sheets and PDFs, financial calculators and reports you can export to PDF and Excel.' },
      { q: 'Do I have to install anything or upload my files?', a: 'No. It runs in your browser, nothing to install. Your Excel and PDF files are read locally on your own device: they are never uploaded to our servers.' },
      { q: 'How does the free trial work?', a: 'The Mini plan includes a 14-day free trial. A card is required at sign-up, but nothing is charged until the trial ends. Cancel before it ends and you pay nothing.' },
      { q: 'Can I change plans or cancel anytime?', a: 'Yes, no lock-in. From Settings you open the Stripe portal to switch plans or cancel; changes take effect at the end of the current period.' },
      { q: 'What is the difference between plans?', a: 'All plans include the same features; they differ in the daily AI analysis quota: 10 per day on Mini, 50 on Pro and 130 on Max.' }
    ],
    faqPrivacyLink: 'What do we do with your data? Read the privacy policy',
    privacyLink: 'Privacy'
  },
  notFound: {
    title: 'Page not found',
    desc: 'The page you are looking for does not exist or has moved.',
    cta: 'Back to home'
  },
  meta: {
    landingTitle: 'Nokfi — Your business, under control',
    landingDesc: 'Nokfi — AI-powered financial diagnosis and data analysis for freelancers and small businesses.',
    pricingTitle: 'Plans & pricing — Nokfi',
    pricingDesc: 'Nokfi subscription plans: Mini, Pro and Max. 14-day free trial, no lock-in.',
    loginTitle: 'Sign in — Nokfi',
    resetTitle: 'Reset password — Nokfi',
    revealTitle: 'Your license — Nokfi',
    privacyTitle: 'Privacy policy — Nokfi',
    privacyDesc: 'How Nokfi handles your data: what we store, what we don’t, and which services are involved.'
  },
  privacy: {
    title: 'Privacy policy',
    updated: 'Last updated: September 2026',
    intro: 'This policy describes, in plain terms, which data Nokfi (nokfi.app) processes, why, and which third-party services are involved. It reflects exactly how the application works.',
    sections: [
      { h: 'Controller & contact', ps: ['The data controller is Nokfi (nokfi.app). For any privacy question or to exercise your rights, write to info@nokfi.app.'] },
      { h: 'What data we process', list: [
        'Account: your email, your license key and your password. The password is stored only as a cryptographic hash (scrypt); never in plain text.',
        'Company profile (optional): name, sector, size and main expenses, used to personalise the analyses.',
        'Analysis history: we store the AI-generated report and the size of the analysed content — not the full content of your files.',
        'Subscription: Stripe customer and subscription identifiers, plan and status. We never see or store your card details.',
        'Technical logs: IP address and security events (sign-ins, errors) to protect the service.'
      ] },
      { h: 'Your files are not uploaded to our servers', ps: [
        'The Excel and PDF files you analyse are read locally, in your own browser. They are never uploaded to or stored on our servers.',
        'To produce the analysis, the extracted text from your file is sent, through our server, to the AI service.'
      ] },
      { h: 'Third-party services involved', list: [
        'Stripe: processes payments and manages subscriptions.',
        'Google Gemini: generates the AI analyses. Under the current service plan, Google may use submitted content according to its own terms; avoid including highly sensitive data in analyses.',
        'Resend: sends transactional emails (your license key, password recovery).',
        'Cloudflare: content delivery and security network protecting access to the site.'
      ] },
      { h: 'Cookies & analytics', ps: ['Nokfi does not use tracking cookies or third-party analytics tools. Your session is stored in your browser’s local storage.'] },
      { h: 'Retention & deletion', ps: ['We keep your data while your license is active. If the license is deleted, your profile, analysis history and sessions are deleted with it.'] },
      { h: 'Your rights', ps: ['You can exercise your rights of access, rectification, erasure, portability and objection by writing to info@nokfi.app. You may also lodge a complaint with the Spanish Data Protection Agency (aepd.es).'] },
      { h: 'Security', ps: ['We apply HTTPS across the service, scrypt-hashed passwords, session and recovery tokens stored as hashes, and periodic database backups on the server.'] }
    ]
  }
};
