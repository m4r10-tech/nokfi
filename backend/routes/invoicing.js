/**
 * routes/invoicing.js — sesión 11 (tanda 2): Finanzas › Facturas.
 *
 *   GET    /api/invoicing/settings            datos del emisor (+ lo que falta para facturar)
 *   PUT    /api/invoicing/settings
 *   GET    /api/invoicing/customers?q         libreta de clientes
 *   POST   /api/invoicing/customers
 *   PATCH  /api/invoicing/customers/:id
 *   DELETE /api/invoicing/customers/:id
 *   GET    /api/invoicing/invoices?from&to&status&q
 *   POST   /api/invoicing/invoices            emitir (con rectifies_id → rectificativa)
 *   GET    /api/invoicing/invoices/:id        detalle con líneas y eventos
 *   POST   /api/invoicing/invoices/:id/cancel { reason }  anular (nunca se borra)
 *   GET    /api/invoicing/invoices/:id/pdf
 *   POST   /api/invoicing/invoices/:id/send   { to?, message? }  email al cliente con el PDF
 *
 * Todo scopeado por req.license.id (requireLicense).
 */

'use strict';

const express = require('express');
const { requireLicense } = require('../middleware/requireLicense');
const { audit } = require('../db/database');
const D = require('../db/invoicing');
const S = require('../services/invoicing');
const M = require('../services/invoicing/model');
const { renderInvoicePdf } = require('../services/invoicing/pdf');
const { sendInvoiceEmail } = require('../utils/mailer');

const router = express.Router();
router.use(requireLicense);

const idOf = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : 0; };
const send = (res, out) => res.status(out.status).json(out.body);

/* ── Datos del emisor ── */
function settingsBody(license_id) {
  const p = D.getBillingProfile(license_id);
  const { license_id: _l, ...profile } = p;
  return { profile, missing: M.issuerMissing(D.issuerFromProfile(p)) };
}

router.get('/settings', (req, res) => res.json(settingsBody(req.license.id)));

router.put('/settings', (req, res) => {
  const out = D.saveBillingProfile(req.license.id, req.body && typeof req.body === 'object' ? req.body : {});
  if (out.error) return res.status(400).json(out);
  res.json(settingsBody(req.license.id));
});

/* ── Clientes ── */
router.get('/customers', (req, res) => res.json({ customers: D.listCustomers(req.license.id, req.query.q || '') }));

router.post('/customers', (req, res) => {
  const out = D.createCustomer(req.license.id, req.body || {});
  if (out.error) return res.status(400).json({ error: 'invalid_input', field: out.error });
  res.status(201).json(out);
});

router.patch('/customers/:id', (req, res) => {
  const out = D.updateCustomer(req.license.id, idOf(req), req.body || {});
  if (!out) return res.status(404).json({ error: 'not_found' });
  if (out.error) return res.status(400).json({ error: 'invalid_input', field: out.error });
  res.json(out);
});

router.delete('/customers/:id', (req, res) => {
  if (!D.deleteCustomer(req.license.id, idOf(req))) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

/* ── Facturas ── */
router.get('/invoices', (req, res) => res.json({ invoices: D.listInvoices(req.license.id, req.query) }));

router.post('/invoices', (req, res) => send(res, S.issue({ license: req.license, body: req.body || {}, source: 'web', ip: req.ip })));

router.get('/invoices/:id', (req, res) => {
  const inv = D.getInvoice(req.license.id, idOf(req));
  if (!inv) return res.status(404).json({ error: 'not_found' });
  res.json({ invoice: inv, events: D.listEvents(req.license.id, inv.id) });
});

router.post('/invoices/:id/cancel', (req, res) => send(res, S.cancel({ license: req.license, id: idOf(req), reason: req.body?.reason, ip: req.ip })));

function pdfName(inv) {
  return `factura_${inv.number.replace(/[^\w.-]+/g, '_')}.pdf`;
}

router.get('/invoices/:id/pdf', async (req, res) => {
  const inv = D.getInvoice(req.license.id, idOf(req));
  if (!inv) return res.status(404).json({ error: 'not_found' });
  const footer = D.getBillingProfile(req.license.id).footer;
  const pdf = await renderInvoicePdf(inv, { footer });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pdfName(inv)}"`, 'Cache-Control': 'no-store' });
  res.send(pdf);
});

// Tope de envíos por cuenta (evita usar Nokfi para spam): 30 por hora.
const SEND_LIMIT = 30;
const sendLog = new Map();
function allowSend(license_id) {
  const now = Date.now();
  const recent = (sendLog.get(license_id) || []).filter(t => now - t < 3600_000);
  if (recent.length >= SEND_LIMIT) { sendLog.set(license_id, recent); return false; }
  recent.push(now);
  sendLog.set(license_id, recent);
  return true;
}

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

router.post('/invoices/:id/send', async (req, res) => {
  const inv = D.getInvoice(req.license.id, idOf(req));
  if (!inv) return res.status(404).json({ error: 'not_found' });
  if (inv.status !== 'issued') return res.status(409).json({ error: 'invoice_cancelled', message: 'No se envía una factura anulada.' });
  const to = String(req.body?.to || inv.customer?.email || '').trim().toLowerCase();
  if (!EMAIL.test(to)) return res.status(400).json({ error: 'invalid_input', field: 'to', message: 'Falta un email válido del cliente.' });
  if (!allowSend(req.license.id)) return res.status(429).json({ error: 'send_rate_limited', message: `Máximo ${SEND_LIMIT} envíos por hora.` });
  const profile = D.getBillingProfile(req.license.id);
  const replyTo = profile.email || req.license.email;
  try {
    const pdf = await renderInvoicePdf(inv, { footer: profile.footer });
    const r = await sendInvoiceEmail({ to, replyTo, invoice: inv, message: req.body?.message, attachments: [{ filename: pdfName(inv), content: pdf }] });
    if (r?.skipped) return res.status(503).json({ error: 'email_unavailable', message: 'El envío de emails no está disponible ahora mismo.' });
    D.addEvent(req.license.id, inv.id, 'emailed', to);
    audit('INVOICE_EMAILED', { license_id: req.license.id, ip: req.ip, detail: `id=${inv.id}` });
    res.json({ sent: true, to });
  } catch (e) {
    console.error('[INVOICE_SEND]', e.message);
    res.status(502).json({ error: 'email_failed', message: 'No se ha podido enviar el email. Inténtalo de nuevo.' });
  }
});

module.exports = router;
