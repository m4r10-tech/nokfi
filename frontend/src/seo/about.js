/**
 * Qué es Nokfi, en una frase y en una lista corta (es y en) — fuente ÚNICA.
 *
 * Lo usan los datos estructurados (Organization.description, useSeo.js) y
 * /llms.txt (scripts/prerender.mjs), el resumen que leen los asistentes de IA
 * (ChatGPT, Gemini, Perplexity, Claude…). Solo hechos comprobables de lo que
 * hay en producción: nada de «el mejor». Sin precios: salen del catálogo
 * (GET /api/payments/plans). Si cambia una función, se cambia aquí.
 */
export const ABOUT = {
  es: {
    summary: 'Nokfi es una app web de facturas, impuestos y finanzas para autónomos y pequeños negocios en España: lee tus facturas con IA, calcula los modelos 303 y 130, emite facturas con VERI*FACTU y te avisa de cobros y plazos fiscales.',
    audience: 'Autónomos y pequeños negocios (pymes) de España que quieren llevar sus facturas e impuestos sin hojas de cálculo.',
    features: [
      'Lee facturas con IA (PDF, fotos y facturas electrónicas) y las apunta en el libro de facturas.',
      'Calcula el IVA del trimestre (modelo 303) y el pago fraccionado del IRPF (modelo 130), y dice cuánto apartar. Da las cifras; la presentación ante Hacienda la hace el usuario.',
      'Emite facturas con VERI*FACTU (registros encadenados y código QR) y factura electrónica (UBL, Facturae, Factur-X).',
      'Controla los cobros pendientes y ayuda a reclamar las facturas impagadas.',
      'Calendario fiscal con avisos por email antes de cada plazo.',
      'Analiza hojas de Excel con IA y genera informes en PDF y Excel.',
      'App en español, inglés, francés, alemán, italiano y polaco.',
      'API pública, servidor MCP y nodo de n8n para automatizaciones.'
    ]
  },
  en: {
    summary: 'Nokfi is a web app for invoices, taxes and finances for freelancers and small businesses in Spain: it reads your invoices with AI, works out forms 303 and 130, issues VERI*FACTU invoices and reminds you of payments due and tax deadlines.',
    audience: 'Freelancers (autónomos) and small businesses in Spain who want to keep invoices and taxes under control without spreadsheets.',
    features: [
      'Reads invoices with AI (PDFs, photos and e-invoices) and records them in the invoice book.',
      'Works out quarterly VAT (form 303) and the income tax instalment (form 130), and how much to set aside. It gives the figures; filing with the tax office is done by the user.',
      'Issues VERI*FACTU invoices (chained records and QR code) and e-invoices (UBL, Facturae, Factur-X).',
      'Tracks unpaid invoices and helps to chase them.',
      'Tax calendar with email reminders before each deadline.',
      'Analyses Excel sheets with AI and produces PDF and Excel reports.',
      'App in Spanish, English, French, German, Italian and Polish.',
      'Public API, MCP server and n8n node for automations.'
    ]
  }
};
