/**
 * Guías públicas (/guias/<slug> y /en/guides/<slug>). Los textos están en
 * seo/content/{es,en}.js bajo guides[id]; aquí solo los slugs, para que el
 * registro de rutas no cargue el contenido.
 */
export const GUIDE_SLUGS = [
  { id: 'm303', es: 'modelo-303-iva-trimestral', en: 'form-303-quarterly-vat-return' },
  { id: 'm130', es: 'modelo-130-pago-fraccionado-irpf', en: 'form-130-income-tax-installment' },
  { id: 'apartar', es: 'cuanto-apartar-para-impuestos', en: 'how-much-to-set-aside-for-taxes' },
  { id: 'compensar', es: 'iva-a-compensar', en: 'vat-to-offset-in-spain' },
  { id: 'gastos', es: 'gastos-deducibles-autonomos', en: 'tax-deductible-expenses-self-employed' },
  { id: 'factura', es: 'como-hacer-una-factura', en: 'how-to-issue-an-invoice-in-spain' },
  { id: 'verifactu', es: 'factura-electronica-y-verifactu', en: 'e-invoicing-and-verifactu' },
  { id: 'reclamar', es: 'reclamar-factura-impagada', en: 'chasing-an-unpaid-invoice' }
];
