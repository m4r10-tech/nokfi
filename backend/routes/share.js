/**
 * routes/share.js — enlace de solo lectura para la gestoría (sesión 4).
 *
 *   Con sesión:
 *     GET    /api/share          mis enlaces (sin el token: solo prefijo)
 *     POST   /api/share          {label, days} → crea; devuelve el token UNA vez
 *     DELETE /api/share/:id      revoca
 *   Público (el token es la credencial):
 *     GET    /api/shared/:token?year=YYYY → empresa, impuestos por trimestre y
 *                                           libro del año. Solo lectura, sin
 *                                           emails de clientes, noindex.
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireLicense } = require('../middleware/requireLicense');
const { getCompanyProfile, audit } = require('../db/database');
const S = require('../db/shares');
const F = require('../db/finance');
const { taxSummary, quarterOf } = require('../utils/finance');

const share = express.Router();
const shared = express.Router();

share.get('/', requireLicense, (req, res) => {
  res.json({ links: S.listShareLinks(req.license.id) });
});

share.post('/', requireLicense, (req, res) => {
  const out = S.createShareLink(req.license.id, { label: req.body?.label, days: req.body?.days });
  if (out.error) return res.status(409).json({ error: out.error });
  audit('share_link_created', { license_id: req.license.id, detail: `id=${out.id}` });
  res.status(201).json({ link: out });
});

share.delete('/:id', requireLicense, (req, res) => {
  if (!S.revokeShareLink(req.license.id, Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  audit('share_link_revoked', { license_id: req.license.id, detail: `id=${req.params.id}` });
  res.json({ ok: true });
});

// Límite propio por IP: el token es la credencial, que no se pueda tantear.
const sharedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' }
});

shared.get('/:token', sharedLimiter, (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  const link = S.resolveShareToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'share_not_found' });
  const profile = getCompanyProfile(link.license_id) || {};
  const cq = quarterOf(new Date().toISOString().slice(0, 10));
  const year = Number.isInteger(Number(req.query.year)) && Number(req.query.year) >= 2000 && Number(req.query.year) <= cq.year + 1 ? Number(req.query.year) : cq.year;
  const all = F.allEntries(link.license_id);
  const quarters = [1, 2, 3, 4].map(q => {
    const t = taxSummary(all, { year, quarter: q, legalForm: profile.legal_form, reserve: 0 });
    return { quarter: q, vat: t.vat, irpf130: t.irpf130, total_estimated: t.total_estimated, due_date: t.due_date };
  });
  const entries = all.filter(e => e.invoice_date.startsWith(`${year}-`)).map(e => ({
    invoice_date: e.invoice_date, due_date: e.due_date, type: e.type, invoice_number: e.invoice_number,
    party_name: e.party_name, party_nif: e.party_nif, concept: e.concept, category: e.category,
    base: e.base, vat_rate: e.vat_rate, vat_amount: e.vat_amount, irpf_rate: e.irpf_rate, irpf_amount: e.irpf_amount,
    total: e.total, paid: e.paid
  }));
  const years = [...new Set(all.map(e => Number(e.invoice_date.slice(0, 4))))].sort((a, b) => b - a);
  res.json({
    company: { name: profile.company_name || '', tax_id: profile.tax_id || '', legal_form: profile.legal_form || '', sector: profile.sector || '' },
    label: link.label, expires_at: link.expires_at, year, years: years.length ? years : [cq.year],
    quarters, entries
  });
});

module.exports = { share, shared };
