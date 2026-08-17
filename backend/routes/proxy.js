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
const { audit, countAiAnalysesToday, aiQuotaForPlan, reserveAiSlot, releaseAiSlot, createAnalysis } = require('../db/database');

const MAX_PROMPT_LENGTH = 50000; // protección básica contra abuso/prompts gigantes
const DEFAULT_MAX_TOKENS = 1500;
const HARD_MAX_TOKENS = 4000;

// ⚠️ AUDITORÍA DE SEGURIDAD — límite diario por licencia ATOMICO (Deuda H).
// Protege la cuota compartida de Gemini (~1.500/día para todo el proyecto) de
// que un solo cliente la agote para el resto — es el anti-abuso del plan
// (mini 10 / pro 50 / max 130 análisis/día, ver aiQuotaForPlan en db/database.js).
// La reserva se hace con reserveAiSlot (INSERT en `ai_usage` con PK
// `(license_id, day, slot)`), que es atómica y cierra el TOCTOU: el incremento
// ocurre ANTES del await a Gemini, no después. Si Gemini falla, releaseAiSlot
// devuelve el slot y el análisis fallido NO cuenta contra la cuota.
// Para planes legacy migrados (billing_model='legacy', plan mapeado a 'max')
// aplica la cuota de max.

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
    return res.status(500).json({
      error: 'ai_not_configured',
      message: 'El servicio de análisis no está disponible ahora mismo. Contacta con soporte si esto continúa.'
    });
  }

  const dailyLimit = aiQuotaForPlan(req.license.plan);

  // `gemini-flash-latest` es un alias de Google que siempre resuelve al
  // modelo flash actual. Migración desde gemini-2.5-flash, retirado por
  // Google para nuevas keys el 2026-07 ("no longer available to new users").
  // Usar el alias evita que un futuro retiro de versión concreta vuelva a
  // romper el análisis (bug que dio 502 en /api/proxy/ai). El .env del VPS
  // lleva GEMINI_MODEL=gemini-flash-latest; este es el fallback por si falta.
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';

  // Si la IA falla tras reservar, se libera el slot: el análisis fallido NO
  // cuenta contra la cuota. Declarada aquí (ámbito del handler) para poder hacer
  // el rollback también desde el `catch`, no solo en los caminos de `!aiRes.ok`.
  let releaseUsage = null;

  try {
    // Deuda H — reserva atómica ANTES de llamar a Gemini. reserveAiSlot inserta
    // la fila en `ai_usage` (PK license_id+day+slot); si el slot ya estaba
    // ocupado prueba el siguiente. Devuelve null si no queda ninguno libre hoy
    // (cuota agotada) → 429 sin gastar nada. Al reservar antes del await se
    // elimina la ventana TOCTOU: ninguna petición concurrente puede ver la
    // cuota "más vacía" de lo que está. `usedToday` (qué slot usó) solo sirve
    // del mensaje/auditoría, no para decidir el corte — la reserva decide.
    const reservation = reserveAiSlot(req.license.id, dailyLimit);
    if (!reservation) {
      const usedToday = countAiAnalysesToday(req.license.id);
      audit('AI_LICENSE_DAILY_LIMIT_REACHED', { license_id: req.license.id, ip: req.ip, detail: `used=${usedToday}/${dailyLimit} plan=${req.license.plan}` });
      return res.status(429).json({
        error: 'license_daily_limit_reached',
        message: `Has agotado tu cuota diaria de ${dailyLimit} análisis. Inténtalo de nuevo mañana o mejora tu plan para disponer de más análisis diarios.`
      });
    }
    const { day: usageDay, slot: reservedSlot } = reservation;
    releaseUsage = () => releaseAiSlot(req.license.id, usageDay, reservedSlot);

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
      // → liberar el slot: no es culpa del usuario y no debe gastar su cuota.
      releaseUsage();
      if (aiRes.status === 429) {
        return res.status(503).json({
          error: 'ai_quota_exceeded',
          message: 'El servicio de análisis ha alcanzado su límite diario global. Inténtalo de nuevo en unas horas.'
        });
      }
      return res.status(502).json({
        error: 'ai_provider_error',
        message: 'Ha fallado la conexión con el servicio de análisis. Inténtalo de nuevo en unos minutos.'
      });
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
      releaseUsage(); // respuesta vacía (bloqueo de seguridad) = análisis no generado → devolver el slot
      return res.status(502).json({
        error: 'ai_empty_response',
        message: 'El análisis no pudo generarse ahora mismo (la IA devolvió una respuesta vacía). Inténtalo de nuevo.'
      });
    }

    audit('AI_ANALYSIS_GENERATED', {
      license_id: req.license.id,
      ip: req.ip,
      detail: `prompt_chars=${prompt.length}, provider=gemini`
    });

    // G2 — Historial de análisis (sección 14, pantallas Historial / Informes).
    // Best-effort: un fallo de escritura NUNCA debe bloquear el análisis al
    // usuario — el historial es un nice-to-have, no crítico. kind/title son
    // etiquetas opcionales que aporta el cliente (ExcelSubModule pasa su
    // `title` de subapartado; Cuestionario pasa kind='cuestionario'); el contenido
    // sensible de los datos originales NO se persiste (solo el conteo
    // prompt_chars y el result_html, que el frontend ya rendiza vía
    // sanitizeAiHtml de cualquier modo). El historial queda scopeado a la
    // licencia propia (createAnalysis vincula req.license.id).
    try {
      createAnalysis({
        license_id: req.license.id,
        kind: req.body?.kind,
        title: req.body?.title,
        result_html: text,
        prompt_chars: prompt.length
      });
    } catch (persistErr) {
      console.error('[PROXY AI] No se pudo persistir el análisis en el historial:', persistErr.message);
    }

    res.json({ text });
  } catch (e) {
    // Rollback de la reserva si algo rompió tras reservar (excepción, timeout de
    // Gemini, parseo...) — que un error del servidor/proveedor no consuma la
    // cuota del usuario. releaseUsage es null si aún no se reservó.
    if (releaseUsage) { try { releaseUsage(); } catch (_) { /* el rollback no debe enmascarar el error real */ } }
    console.error('[PROXY AI] Excepción:', e.message);
    res.status(500).json({
      error: 'internal_error',
      message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.'
    });
  }
});

module.exports = router;
