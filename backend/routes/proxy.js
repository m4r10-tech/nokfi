/**
 * routes/proxy.js
 *
 * Proxy hacia la API de Google Gemini. La GEMINI_API_KEY vive solo aquí, en
 * el servidor — el frontend nunca la ve (mismo principio que con Anthropic,
 * sección 6 del proyecto: "Por qué la API key de la IA está en el servidor").
 *
 * ⚠️  DECISIÓN DE NEGOCIO REGISTRADA: se usa el FREE TIER de Gemini en vez
 * de Anthropic. Esto tiene dos implicaciones importantes que quedan
 * documentadas aquí para que no se pierdan de vista:
 *
 *   1. PRIVACIDAD: en el free tier, Google puede usar los prompts (es decir,
 *      los datos financieros de los clientes de Nokfi: facturas, gastos,
 *      ingresos) para entrenar sus modelos. Esto no ocurre en el tier de
 *      pago. Decisión asumida conscientemente por el equipo.
 *   2. CUOTA: el free tier limita a ~1.500 peticiones/día POR PROYECTO
 *      (no por usuario). Si Nokfi crece lo suficiente, este límite se
 *      alcanzará y habrá que activar facturación (lo que hace desaparecer
 *      el free tier por completo en ese proyecto de Google Cloud).
 *
 * Endpoint:
 *   POST /api/proxy/ai
 *   Body: { prompt: string, max_tokens?: number }
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireLicense } = require('../middleware/requireLicense');
const { audit, countAiAnalysesToday } = require('../db/database');

const MAX_PROMPT_LENGTH = 50000; // protección básica contra abuso/prompts gigantes
const DEFAULT_MAX_TOKENS = 1500;
const HARD_MAX_TOKENS = 4000;

// ⚠️ AUDITORÍA DE SEGURIDAD — límite diario por licencia (ver countAiAnalysesToday
// en db/database.js). Protege la cuota compartida de Gemini (~1.500/día para
// todo el proyecto) de que un solo cliente la agote para el resto. 50/día por
// licencia es generoso para el uso esperado (cuestionario + 6 subapartados de
// Excel) y deja margen amplio para decenas de clientes simultáneos sin
// arriesgar la cuota global.
const MAX_AI_CALLS_PER_LICENSE_PER_DAY = 50;

router.post('/ai', requireLicense, async (req, res) => {
  const prompt = req.body?.prompt;
  const requestedMaxTokens = Number(req.body?.max_tokens) || DEFAULT_MAX_TOKENS;
  const max_tokens = Math.min(Math.max(requestedMaxTokens, 100), HARD_MAX_TOKENS);

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'invalid_prompt', message: 'Falta el contenido a analizar.' });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({
      error: 'prompt_too_long',
      message: `El contenido supera el límite permitido (${MAX_PROMPT_LENGTH} caracteres).`
    });
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('⚠️  GEMINI_API_KEY no configurada en el servidor');
    return res.status(500).json({ error: 'ai_not_configured' });
  }

  const usedToday = countAiAnalysesToday(req.license.id);
  if (usedToday >= MAX_AI_CALLS_PER_LICENSE_PER_DAY) {
    audit('AI_LICENSE_DAILY_LIMIT_REACHED', { license_id: req.license.id, ip: req.ip, detail: `used=${usedToday}` });
    return res.status(429).json({
      error: 'license_daily_limit_reached',
      message: 'Has alcanzado el límite diario de análisis de tu licencia. Inténtalo de nuevo mañana.'
    });
  }

  // `gemini-flash-latest` es un alias de Google que siempre resuelve al
  // modelo flash actual. Migración desde gemini-2.5-flash, retirado por
  // Google para nuevas keys el 2026-07 ("no longer available to new users").
  // Usar el alias evita que un futuro retiro de versión concreta vuelva a
  // romper el análisis (bug que dio 502 en /api/proxy/ai). El .env del VPS
  // lleva GEMINI_MODEL=gemini-flash-latest; este es el fallback por si falta.
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';

  try {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: prompt }] }
          ],
          generationConfig: {
            maxOutputTokens: max_tokens
          }
        })
      }
    );

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      console.error('[PROXY AI] Gemini respondió con error:', aiRes.status, errBody);

      // 429 de Gemini casi siempre significa cuota diaria del free tier agotada
      if (aiRes.status === 429) {
        return res.status(503).json({
          error: 'ai_quota_exceeded',
          message: 'El servicio de análisis ha alcanzado su límite diario. Inténtalo de nuevo más tarde.'
        });
      }
      return res.status(502).json({ error: 'ai_provider_error' });
    }

    const data = await aiRes.json();

    // Forma real de la respuesta de Gemini: data.candidates[0].content.parts[].text
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('');

    if (!text) {
      // Puede ocurrir si el contenido fue bloqueado por los filtros de seguridad de Gemini
      // (data.candidates[0].finishReason === 'SAFETY', por ejemplo)
      console.error('[PROXY AI] Gemini devolvió respuesta vacía. finishReason:', data.candidates?.[0]?.finishReason);
      return res.status(502).json({ error: 'ai_empty_response' });
    }

    audit('AI_ANALYSIS_GENERATED', {
      license_id: req.license.id,
      fingerprint: req.session.fingerprint,
      ip: req.ip,
      detail: `prompt_chars=${prompt.length}, provider=gemini`
    });

    res.json({ text });
  } catch (e) {
    console.error('[PROXY AI] Excepción:', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
