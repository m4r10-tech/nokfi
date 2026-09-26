/**
 * routes/chat.js — C5: asistente integrado.
 *
 *   POST /api/chat  { messages:[{role,content}], analysis_id?, lang? }
 *     → { reply, provider }
 *   No consume la cuota de análisis; límite anti-abuso por minuto y licencia.
 *   La conversación NO se guarda.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireLicense } = require('../middleware/requireLicense');
const { getAnalysis, getCompanyProfile } = require('../db/database');
const { chat, allowMessage, sanitizeMessages } = require('../services/ai/chat');
const { reportToText } = require('../services/ai/prompts');

router.post('/', requireLicense, async (req, res) => {
  const messages = sanitizeMessages(req.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'invalid_input', message: 'Escribe una pregunta.' });
  }
  if (!allowMessage(req.license.id)) {
    return res.status(429).json({ error: 'chat_rate_limited', message: 'Vas muy rápido. Espera un minuto y vuelve a preguntar.' });
  }

  let analysisContext = '';
  const aid = Number(req.body?.analysis_id);
  if (Number.isInteger(aid) && aid > 0) {
    const a = getAnalysis(req.license.id, aid);
    if (a) {
      analysisContext = a.result_json
        ? `${a.title}\n${reportToText(a.result_json)}`
        : `${a.title}\n${String(a.result_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')}`;
    }
  }

  try {
    const { text, provider } = await chat({
      profile: getCompanyProfile(req.license.id),
      lang: req.body?.lang,
      analysisContext,
      messages
    });
    res.json({ reply: text, provider });
  } catch (e) {
    if (e.code === 'chat_unavailable') {
      return res.status(503).json({ error: 'chat_unavailable', message: 'El asistente está saturado. Prueba en un minuto.' });
    }
    console.error('[CHAT] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
