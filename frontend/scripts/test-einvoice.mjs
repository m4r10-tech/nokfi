/**
 * Prueba del lector de facturas electrónicas (Facturae, UBL, CII) con las
 * facturas de test/fixtures/einvoice. Uso: npm run test:einvoice
 */
import { build } from 'esbuild';
import { DOMParser } from '@xmldom/xmldom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules/.cache/einvoice.test.mjs');
await build({ entryPoints: [path.join(root, 'src/middleware/einvoice.js')], bundle: true, format: 'esm', platform: 'node', external: ['pdfjs-dist', './pdfExtract'], outfile: out, logLevel: 'error' });
const { parseEInvoiceXml } = await import(pathToFileURL(out).href);
const fx = (f) => fs.readFileSync(path.join(root, 'test/fixtures/einvoice', f), 'utf8');

const cases = [
  ['facturae.xml', { source_format: 'Facturae', issuer_nif: 'B12345678', invoice_number: 'A-0042', base: 200, vat_amount: 42, irpf_amount: 30, total: 212, due_date: '2026-10-15' }],
  ['ubl.xml', { source_format: 'UBL', issuer_nif: 'B99887766', invoice_number: 'INV-2026-77', base: 50, vat_amount: 10.5, total: 60.5 }],
  ['cii.xml', { source_format: 'Factur-X', issuer_nif: 'A11223344', invoice_date: '2026-09-11', base: 100, vat_amount: 21, total: 121 }]
];
let fail = 0;
for (const [file, expected] of cases) {
  const inv = parseEInvoiceXml(fx(file), file, new DOMParser())?.[0];
  const bad = Object.entries(expected).filter(([k, v]) => inv?.[k] !== v);
  if (bad.length || !inv?.check_ok) { fail++; console.log(`❌ ${file}`, bad, inv); } else console.log(`✅ ${file}`);
}
if (parseEInvoiceXml('<a>hola</a>', 'x.xml', new DOMParser()) !== null) { fail++; console.log('❌ XML desconocido debería devolver null'); } else console.log('✅ XML no soportado → null');
process.exit(fail ? 1 : 0);
