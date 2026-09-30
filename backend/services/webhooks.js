/**
 * services/webhooks.js — sesión 9 (API, Bloque 2): eventos y webhooks
 * salientes firmados.
 *
 *   emit(license_id, type, data)   crea el evento y un envío por endpoint suscrito
 *   Firma:  Nokfi-Signature: t=<unix>,v1=<HMAC-SHA256(secret, "<t>.<cuerpo>") en hex>
 *   Reintentos: 7 intentos en ~20 h (1 min, 5 min, 30 min, 2 h, 6 h, 12 h).
 *   Un envío cuenta como entregado con cualquier 2xx en menos de 10 s.
 *   Tras 20 envíos seguidos fallidos del todo, el endpoint se desactiva.
 *
 * Seguridad (SSRF): solo https, sin credenciales en la URL, y se rechazan las
 * direcciones privadas, de loopback o link-local tanto al registrar la URL
 * como al conectar (la comprobación va en el `lookup` del socket, así que un
 * cambio de DNS entre medias no sirve para colarse). No se siguen
 * redirecciones.
 *
 * Eventos: analysis.completed, job.completed, job.failed, quota.threshold
 * (80 % y 100 % de la cuota del día) y fiscal.deadline (7 y 1 días antes de
 * cada plazo del calendario fiscal). "ping" solo se envía con "Enviar prueba".
 */

'use strict';

const crypto = require('crypto');
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const { getDB, getCompanyProfile } = require('../db/database');
const W = require('../db/webhooks');
const { upcoming } = require('../utils/fiscalCalendar');
const { API_PLANS } = require('../middleware/requireApiKey');

const BACKOFF_S = [60, 300, 1800, 7200, 21600, 43200];
const MAX_ATTEMPTS = BACKOFF_S.length + 1;
const TIMEOUT_MS = 10000;
const DISABLE_AFTER = 20;
const FISCAL_LEADS = [7, 1];

const allowPrivate = () => process.env.WEBHOOKS_ALLOW_PRIVATE === '1';
const allowHttp = () => process.env.WEBHOOKS_ALLOW_HTTP === '1';

/* ── Direcciones no permitidas ── */
const blocked = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(a, p, 'ipv4');
// Ojo: no se añade ::ffff:0:0/96 porque BlockList lo aplica también a TODAS
// las IPv4; las IPv4 mapeadas (::ffff:a.b.c.d) se comprueban aparte abajo.
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['64:ff9b::', 96]]) blocked.addSubnet(a, p, 'ipv6');

function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) return blocked.check(ip, 'ipv4');
  if (v === 6) {
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(ip)) return true; // mapeada en hex: no se admite
    return blocked.check(ip, 'ipv6');
  }
  return true;
}

/** Valida la URL de un endpoint. Devuelve { url } o { error, message }. */
function validateUrl(raw) {
  const bad = (message) => ({ error: 'invalid_url', message });
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return bad('La URL no es válida.'); }
  if (u.href.length > 500) return bad('La URL es demasiado larga (máximo 500 caracteres).');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && allowHttp())) return bad('La URL debe empezar por https://.');
  if (u.username || u.password) return bad('La URL no puede llevar usuario ni contraseña.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate() && (/^localhost$/i.test(host) || /\.(localhost|local|internal)$/i.test(host) || (net.isIP(host) && isPrivateIp(host)))) {
    return bad('La URL apunta a una red privada: usa una dirección pública (en n8n, la "Production URL" del webhook).');
  }
  u.hash = '';
  return { url: u.href };
}

function guardedLookup(hostname, options, cb) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return cb(err);
    const list = Array.isArray(address) ? address : [{ address, family }];
    if (!allowPrivate() && list.some(a => isPrivateIp(a.address))) {
      const e = new Error('blocked_address'); e.code = 'EBLOCKED';
      return cb(e);
    }
    cb(null, address, family);
  });
}

/** POST con tope de tiempo total, sin seguir redirecciones. Nunca lanza. */
function httpPost(urlStr, body, headers) {
  return new Promise((resolve) => {
    const started = Date.now();
    const done = (r) => { clearTimeout(timer); resolve({ ...r, ms: Date.now() - started }); };
    let u;
    try { u = new URL(urlStr); } catch { return resolve({ error: 'invalid_url', ms: 0 }); }
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !allowPrivate() && isPrivateIp(host)) return resolve({ error: 'blocked_address', ms: 0 });
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'Nokfi-Webhooks/1.0', ...headers },
      lookup: guardedLookup
    }, (res) => {
      res.resume();
      res.on('end', () => done({ status: res.statusCode }));
      res.on('error', () => done({ status: res.statusCode }));
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), TIMEOUT_MS);
    req.on('error', (e) => done({ error: e.code === 'EBLOCKED' ? 'blocked_address' : e.code === 'ETIMEOUT' ? 'timeout' : (e.code || 'network_error').toLowerCase() }));
    req.end(body);
  });
}

function sign(secret, t, body) {
  return crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

/** Para quien recibe (y para los tests): comprueba la cabecera Nokfi-Signature. */
function verifySignature(secret, header, body, toleranceS = 300, nowS = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=')).filter(p => p.length === 2));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(nowS - t) > toleranceS) return false;
  const expected = Buffer.from(sign(secret, t, body));
  const got = Buffer.from(parts.v1);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

/* ── Envíos ── */
const inflight = new Set();
function track(p) { inflight.add(p); p.finally(() => inflight.delete(p)); return p; }
/** Espera a que terminen los envíos en curso (tests y apagado). */
function idle() { return Promise.all([...inflight]); }

/** Un intento de envío. Toma el envío con un "arrendamiento" de 5 min para que nadie lo envíe a la vez. */
async function attempt(deliveryId) {
  const db = getDB();
  const leased = db.prepare(`UPDATE webhook_deliveries SET next_attempt_at = datetime('now', '+5 minutes')
    WHERE id = ? AND status = 'pending' AND next_attempt_at <= datetime('now')`).run(deliveryId).changes;
  if (!leased) return null;
  const d = db.prepare(`SELECT d.*, e.url, e.secret, e.enabled FROM webhook_deliveries d
    JOIN webhook_endpoints e ON e.id = d.endpoint_id WHERE d.id = ?`).get(deliveryId);
  if (!d) return null;
  const fail = (error) => db.prepare("UPDATE webhook_deliveries SET status = 'failed', last_error = ?, next_attempt_at = NULL WHERE id = ?").run(error, deliveryId);
  if (!d.payload_json) { fail('payload_expired'); return { ok: false, error: 'payload_expired' }; }
  if (!d.enabled) { fail('endpoint_disabled'); return { ok: false, error: 'endpoint_disabled' }; }

  const t = Math.floor(Date.now() / 1000);
  const r = await httpPost(d.url, d.payload_json, {
    'Nokfi-Signature': `t=${t},v1=${sign(d.secret, t, d.payload_json)}`,
    'Nokfi-Event': d.event_type,
    'Nokfi-Event-Id': d.event_id,
    'Nokfi-Delivery': String(d.id)
  });
  const attempts = d.attempts + 1;
  const ok = !r.error && r.status >= 200 && r.status < 300;
  const error = ok ? '' : (r.error || `http_${r.status}`);
  if (ok) {
    db.prepare(`UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, last_status = ?, last_error = '', last_ms = ?,
      delivered_at = datetime('now'), next_attempt_at = NULL WHERE id = ?`).run(attempts, r.status, r.ms, deliveryId);
    db.prepare('UPDATE webhook_endpoints SET failure_streak = 0 WHERE id = ?').run(d.endpoint_id);
  } else if (attempts >= MAX_ATTEMPTS || d.event_type === 'ping') {
    db.prepare(`UPDATE webhook_deliveries SET status = 'failed', attempts = ?, last_status = ?, last_error = ?, last_ms = ?,
      next_attempt_at = NULL WHERE id = ?`).run(attempts, r.status ?? null, error, r.ms, deliveryId);
    if (d.event_type !== 'ping') {
      db.prepare('UPDATE webhook_endpoints SET failure_streak = failure_streak + 1 WHERE id = ?').run(d.endpoint_id);
      db.prepare(`UPDATE webhook_endpoints SET enabled = 0, disabled_reason = 'too_many_failures'
        WHERE id = ? AND enabled = 1 AND failure_streak >= ?`).run(d.endpoint_id, DISABLE_AFTER);
    }
  } else {
    db.prepare(`UPDATE webhook_deliveries SET attempts = ?, last_status = ?, last_error = ?, last_ms = ?,
      next_attempt_at = datetime('now', ?) WHERE id = ?`).run(attempts, r.status ?? null, error, r.ms, `+${BACKOFF_S[attempts - 1]} seconds`, deliveryId);
  }
  return { ok, status: r.status ?? null, error: error || null, ms: r.ms };
}

function newEvent(type, data, livemode) {
  return { id: 'evt_' + crypto.randomBytes(12).toString('hex'), type, created_at: new Date().toISOString(), livemode: !!livemode, data };
}

/**
 * Emite un evento a los endpoints suscritos (y lo envía ya, en segundo plano).
 * Nunca lanza: un fallo aquí no puede tumbar un análisis.
 */
function emit(license_id, type, data, { livemode = true } = {}) {
  try {
    const eps = W.endpointsFor(license_id, type);
    if (!eps.length) return null;
    // Los eventos reales solo salen con la API contratada (Pro/Max); en Mini,
    // un webhook creado con una clave de prueba recibe solo eventos de prueba.
    if (livemode) {
      const lic = getDB().prepare('SELECT plan, status FROM licenses WHERE id = ?').get(license_id);
      if (!lic || lic.status !== 'active' || !API_PLANS.includes(lic.plan)) return null;
    }
    const event = newEvent(type, data, livemode);
    for (const e of eps) {
      const id = W.insertDelivery({ endpoint_id: e.id, license_id, event });
      track(attempt(id).catch(err => console.error('[WEBHOOKS] envío:', err.message)));
    }
    return event;
  } catch (e) {
    console.error('[WEBHOOKS] emit:', e.message);
    return null;
  }
}

/** "Enviar prueba": evento ping solo a ese endpoint, esperando el resultado. */
async function sendTest(license_id, endpoint_id) {
  const ep = W.getEndpointRow(license_id, endpoint_id);
  if (!ep) return null;
  const event = newEvent('ping', { message: 'Evento de prueba de Nokfi. Si lo ves, el webhook funciona.', endpoint_id }, false);
  const id = W.insertDelivery({ endpoint_id, license_id, event });
  if (!ep.enabled) getDB().prepare("UPDATE webhook_deliveries SET status = 'failed', last_error = 'endpoint_disabled' WHERE id = ?").run(id);
  const r = ep.enabled ? await track(attempt(id)) : { ok: false, error: 'endpoint_disabled' };
  return { delivery_id: id, event_id: event.id, ...r };
}

/** Reenvía un envío anterior (mismo evento y mismo id de evento), esperando el resultado. */
async function resend(license_id, delivery_id) {
  const d = W.getDeliveryRow(license_id, delivery_id);
  if (!d) return { error: 'not_found' };
  if (!d.payload_json) return { error: 'payload_expired' };
  const info = getDB().prepare(`INSERT INTO webhook_deliveries (endpoint_id, license_id, event_id, event_type, livemode, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)`).run(d.endpoint_id, license_id, d.event_id, d.event_type, d.livemode, d.payload_json);
  const id = Number(info.lastInsertRowid);
  const r = await track(attempt(id));
  return { delivery_id: id, ...(r || { ok: false, error: 'not_sent' }) };
}

/** Envíos pendientes cuyo reintento ya toca. */
async function processDue(limit = 50) {
  const ids = getDB().prepare("SELECT id FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= datetime('now') ORDER BY id LIMIT ?")
    .all(limit).map(r => r.id);
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.all(ids.slice(i, i + 5).map(id => track(attempt(id)).catch(() => null)));
  }
  return ids.length;
}

/* ── Eventos de negocio ── */

/** quota.threshold: una vez al día por umbral (80 % y 100 %). Lo llama la cuota tras reservar. */
function quotaThreshold(license, used, limit) {
  try {
    if (!limit || !W.endpointsFor(license.id, 'quota.threshold').length) return;
    const day = new Date().toISOString().slice(0, 10);
    for (const threshold of [80, 100]) {
      if (used * 100 < threshold * limit) continue;
      if (!W.markOnce(license.id, `quota:${day}:${threshold}`)) continue;
      emit(license.id, 'quota.threshold', { threshold, used_today: used, daily_quota: limit, plan: license.plan, day });
    }
  } catch (e) { console.error('[WEBHOOKS] quota.threshold:', e.message); }
}

/** fiscal.deadline: 7 días y 1 día antes de cada plazo (según la forma jurídica del perfil). */
function runFiscalEvents(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  let n = 0;
  for (const license_id of W.licensesSubscribedTo('fiscal.deadline')) {
    const lic = getDB().prepare("SELECT status FROM licenses WHERE id = ?").get(license_id);
    if (!lic || lic.status !== 'active') continue;
    const legalForm = getCompanyProfile(license_id)?.legal_form || undefined;
    for (const d of upcoming(legalForm, today, 6)) {
      const lead = d.days_left <= 1 ? 1 : d.days_left <= 7 ? 7 : null;
      if (!lead || !FISCAL_LEADS.includes(lead)) continue;
      if (!W.markOnce(license_id, `fiscal:${d.key}:${lead}`)) continue;
      emit(license_id, 'fiscal.deadline', {
        key: d.key, date: d.date, days_left: d.days_left, models: d.models, period: d.period,
        kind: d.kind, conditional: d.conditional, legal_form: legalForm || null,
        note: 'Plazo orientativo (fin de semana corrido, sin festivos). Confírmalo en la sede de la AEAT.'
      });
      n++;
    }
  }
  return n;
}

/** Programador: reintentos cada 30 s; eventos fiscales y limpieza cada hora. */
function startApiScheduler() {
  if (process.env.NODE_ENV === 'test') return;
  setInterval(() => { processDue().catch(e => console.error('[WEBHOOKS] reintentos:', e.message)); }, 30 * 1000).unref();
  const hourly = () => {
    try { runFiscalEvents(); } catch (e) { console.error('[WEBHOOKS] fiscal:', e.message); }
    try { W.purgeWebhookData(); } catch (e) { console.error('[WEBHOOKS] limpieza:', e.message); }
  };
  setTimeout(hourly, 90 * 1000).unref();
  setInterval(hourly, 60 * 60 * 1000).unref();
}

module.exports = {
  validateUrl, isPrivateIp, sign, verifySignature, emit, sendTest, resend, processDue, idle, attempt,
  quotaThreshold, runFiscalEvents, startApiScheduler, BACKOFF_S, MAX_ATTEMPTS
};
