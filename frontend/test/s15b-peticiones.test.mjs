/**
 * S15b · lote 1 (peticiones del usuario): pruebas de lógica y textos del frontend.
 * Uso: node test/s15b-peticiones.test.mjs
 *   U6  planes de menor a mayor precio (también en el móvil)
 *   U7  «el equipo de Nokfi», nunca «Mario»
 *   U10 textos de sociedad sin «130» ni «IRPF» en los 6 idiomas
 * (U8, la imagen al compartir cuadrada, la comprueba `npm run check:seo`.)
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(os.tmpdir(), `nokfi-s15b-peticiones-${process.pid}.test.mjs`);
const LANGS = ['es', 'en', 'fr', 'de', 'it', 'pl'];
const entry = `
export { toPlans } from './src/hooks/usePlans.js';
${LANGS.map(l => `export { default as ${l} } from './src/i18n/${l}.js';`).join('\n')}
`;
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node',
  define: { 'import.meta.env': '{}' }, outfile: out, logLevel: 'error'
});
const mod = await import(pathToFileURL(out).href);
fs.rmSync(out, { force: true });
const dict = Object.fromEntries(LANGS.map(l => [l, mod[l]]));
const get = (l, key) => key.split('.').reduce((v, k) => v?.[k], dict[l]);

let fail = 0;
const check = (label, ok) => { if (ok) console.log('✅', label); else { fail++; console.log('❌', label); } };

// U6
const raw = [{ id: 'max', name: 'Max', price_eur: 50 }, { id: 'pro', name: 'Pro', price_eur: 20 }, { id: 'mini', name: 'Mini', price_eur: 5, trial: true }];
check('U6: usePlans ordena de menor a mayor (Mini → Pro → Max) aunque la API los dé en otro orden', mod.toPlans(raw).map(p => p.id).join() === 'mini,pro,max');
const cards = fs.readFileSync(path.join(root, 'src/components/PlanCards.jsx'), 'utf8');
check('U6: PlanCards no sube el plan destacado al principio en el móvil (sin order-first)', !/order-first/.test(cards));

// U7
for (const l of LANGS) {
  const src = fs.readFileSync(path.join(root, `src/i18n/${l}.js`), 'utf8');
  check(`U7 (${l}): ningún texto dice «Mario» y help.person habla del equipo de Nokfi`, !/Mario/.test(src) && /Nokfi/.test(get(l, 'help.person')));
}
const legal = fs.readdirSync(path.join(root, 'src/legal')).map(f => fs.readFileSync(path.join(root, 'src/legal', f), 'utf8')).join('\n');
check('U7: los textos legales no nombran a «Mario»', !/Mario/.test(legal));

// U10
const KEYS = ['finance.taxes.companyNote', 'finance.taxes.companyWarning', 'finance.taxes.companyTitle', 'finance.forecast.flow_tax_company',
  'finance.forecast.companyNote', 'finance.calendar.kind_quarterly_vat', 'home.mTaxCompanyHint'];
for (const l of LANGS) {
  const vals = KEYS.map(k => get(l, k));
  check(`U10 (${l}): textos de sociedad presentes y sin «130» ni «IRPF»`, vals.every(v => typeof v === 'string' && v && !/130|IRPF/.test(v)));
}
check('U10: el texto de sociedad avisa de que IS/202/111/115 aún no se calculan', ['200', '202', '111', '115'].every(m => get('es', 'finance.taxes.companyNote').includes(m)));

process.exit(fail ? 1 : 0);
