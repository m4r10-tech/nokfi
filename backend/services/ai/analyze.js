/**
 * services/ai/analyze.js — ejecutor ÚNICO de análisis de Nokfi (F2).
 *
 * Lo usan la web (routes/ai.js) y la API pública (routes/v1.js, F4): mismo
 * contrato, mismas plantillas, misma cuota. Devuelve { status, body } para
 * que cada ruta solo tenga que responder.
 *
 * Tareas:
 *   cuestionario  { answers }                                   → informe + nota de salud (C1)
 *   excel         { module, context, files }                    → informe
 *   compare       { module, context, periodA, periodB, stats }  → informe (C3)
 *   folder_map    { instruction, files, total_batches }         → notas de un lote (F3, job)
 *   folder        { instruction, folder_name, files|notes, file_count } → informe (F3)
 *   invoices      { files, total_batches }                      → facturas extraídas (V1, job)
 */

'use strict';

const { AiError } = require('./gemini');
const { generate, providerOrder } = require('./providers');
const P = require('./prompts');
const { acquire, QuotaError, quotaMessage } = require('./quota');
const { computeHealth, cleanAnswers } = require('../../utils/healthScore');
const { audit, createAnalysis, getCompanyProfile } = require('../../db/database');
const { createActionsForAnalysis, listActionsForAnalysis } = require('../../db/actions');

const REPORT_TASKS = ['cuestionario', 'excel', 'compare', 'folder'];
const ALL_TASKS = [...REPORT_TASKS, 'folder_map', 'invoices'];

const MAX_FOLDER_BATCHES = 12;     // tope técnico por petición (≈ 200 documentos)
const MAX_INVOICE_BATCHES = 12;    // 12 lotes × 5 = 60 facturas por petición
const MAX_INVOICES_PER_CALL = 5;
const MAX_INLINE_BYTES = 7 * 1024 * 1024; // base64 total por llamada
// Los PDF escaneados se convierten a imagen en el navegador (los modelos
// abiertos no leen PDF inline); se admite PDF solo si Gemini está activo.
const INLINE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const DEFAULT_TITLES = {
  cuestionario: 'Diagnóstico de negocio',
  excel: 'Análisis Excel',
  compare: 'Comparación de periodos',
  folder: 'Resumen de carpeta'
};

function bad(code, message, status = 400) {
  return { status, body: { error: code, message } };
}

const AI_ERROR_RESPONSES = {
  ai_not_configured: [500, 'El servicio de análisis no está disponible ahora mismo. Contacta con soporte si esto continúa.'],
  ai_quota_exceeded: [503, 'El servicio de análisis ha alcanzado su límite diario global. Inténtalo de nuevo en unas horas.'],
  ai_provider_error: [502, 'Ha fallado la conexión con el servicio de análisis. Inténtalo de nuevo en unos minutos.'],
  ai_empty_response: [502, 'El análisis no pudo generarse ahora mismo (la IA devolvió una respuesta vacía). Inténtalo de nuevo.'],
  ai_bad_output: [502, 'La IA devolvió una respuesta incompleta. Inténtalo de nuevo: no se ha descontado de tu cuota.']
};

/** Valida la entrada y prepara la llamada. Devuelve { error } o { plan }. */
function prepare(task, input, profile) {
  input = input && typeof input === 'object' ? input : {};
  switch (task) {
    case 'cuestionario': {
      const answers = cleanAnswers(input.answers);
      if (Object.keys(answers).length < 10) return { error: bad('invalid_input', 'Faltan respuestas del cuestionario.') };
      const health = computeHealth(answers);
      const { text, chars } = P.buildQuestionnaire({ answers, health });
      return { plan: { parts: [{ text }], chars, schema: P.REPORT_SCHEMA, meta: { answers, health }, family: 'single' } };
    }
    case 'excel': {
      if (!P.EXCEL_MODULES[input.module]) return { error: bad('invalid_input', 'Módulo de análisis desconocido.') };
      const files = P.sanitizeFiles(input.files, 3);
      if (!files.length) return { error: bad('invalid_input', 'Falta el contenido a analizar.') };
      const { text, chars } = P.buildExcel({ module: input.module, context: input.context, files });
      return { plan: { parts: [{ text }], chars, schema: P.REPORT_SCHEMA, meta: { module: input.module }, family: 'single' } };
    }
    case 'compare': {
      const module = P.EXCEL_MODULES[input.module] ? input.module : 'total';
      const a = { label: input.periodA?.label, files: P.sanitizeFiles(input.periodA?.files, 3) };
      const b = { label: input.periodB?.label, files: P.sanitizeFiles(input.periodB?.files, 3) };
      if (!a.files.length || !b.files.length) return { error: bad('invalid_input', 'Faltan los datos de alguno de los dos periodos.') };
      const { text, chars } = P.buildCompare({ module, context: input.context, periodA: a, periodB: b, stats: input.stats });
      return { plan: { parts: [{ text }], chars, schema: P.REPORT_SCHEMA, meta: { module, stats: input.stats || null }, family: 'single' } };
    }
    case 'folder_map': {
      const files = P.sanitizeFiles(input.files, 60);
      if (!files.length) return { error: bad('invalid_input', 'El lote no tiene documentos legibles.') };
      const { text, chars } = P.buildFolderMap({ instruction: input.instruction, files });
      const batches = Math.min(Math.max(Number(input.total_batches) || 1, 1), MAX_FOLDER_BATCHES);
      return { plan: { parts: [{ text }], chars, schema: null, family: 'folder', calls: batches + 1, maxTokens: 4096 } };
    }
    case 'folder': {
      const notes = Array.isArray(input.notes) ? input.notes.slice(0, MAX_FOLDER_BATCHES).map(n => String(n || '')) : null;
      const files = notes ? [] : P.sanitizeFiles(input.files, 60);
      if (!notes && !files.length) return { error: bad('invalid_input', 'La carpeta no tiene documentos legibles.') };
      const fileCount = Math.min(Number(input.file_count) || files.length, 1000);
      const { text, chars } = P.buildFolder({ instruction: input.instruction, folderName: input.folder_name, files, notes, fileCount });
      return {
        plan: {
          parts: [{ text }], chars, schema: P.REPORT_SCHEMA, family: 'folder',
          meta: { folder_name: P.clean(input.folder_name, 80), instruction: P.clean(input.instruction, 500), file_count: fileCount }
        }
      };
    }
    case 'invoices': {
      const raw = Array.isArray(input.files) ? input.files.slice(0, MAX_INVOICES_PER_CALL) : [];
      const files = [];
      let inlineBytes = 0;
      for (const f of raw) {
        const name = P.clean(f?.name, 120) || `factura-${files.length + 1}`;
        if (typeof f?.data === 'string' && f.data) {
          if (!INLINE_MIMES.includes(f.mime)) return { error: bad('invalid_input', `Formato no soportado en "${name}".`) };
          inlineBytes += f.data.length;
          files.push({ name, mime: f.mime, data: f.data });
        } else if (typeof f?.text === 'string' && f.text.trim()) {
          files.push({ name, text: f.text });
        }
      }
      if (!files.length) return { error: bad('invalid_input', 'No hay facturas legibles en el lote.') };
      if (inlineBytes > MAX_INLINE_BYTES) return { error: bad('prompt_too_long', 'Las imágenes del lote pesan demasiado. Prueba con menos facturas por lote.') };
      const { parts, chars } = P.buildInvoices({ files });
      const batches = Math.min(Math.max(Number(input.total_batches) || 1, 1), MAX_INVOICE_BATCHES);
      return { plan: { parts, chars, schema: P.INVOICE_SCHEMA, family: 'invoices', calls: batches, files, inline: true } };
    }
    default:
      return { error: bad('invalid_task', 'Tipo de análisis desconocido.') };
  }
}

/**
 * @param {object} o
 * @param {object} o.license
 * @param {string} o.task
 * @param {object} o.input
 * @param {string} [o.lang]
 * @param {string} [o.title]
 * @param {string} [o.jobId]
 * @param {string} [o.ip]
 * @param {string} [o.source]  'web' | 'api'
 */
async function runAnalysis({ license, task, input, lang, title, jobId, ip, source = 'web' }) {
  if (!ALL_TASKS.includes(task)) return bad('invalid_task', 'Tipo de análisis desconocido.');
  if (!providerOrder().length) {
    console.error('⚠️  Ningún proveedor de IA configurado (GROQ_API_KEY / CF_ACCOUNT_ID+CF_AI_TOKEN)');
    return { status: 500, body: { error: 'ai_not_configured', message: AI_ERROR_RESPONSES.ai_not_configured[1] } };
  }

  const profile = getCompanyProfile(license.id);
  const { error, plan } = prepare(task, input, profile);
  if (error) return error;
  if (!plan.inline && plan.chars > P.MAX_INPUT_CHARS) {
    return bad('prompt_too_long', `El contenido supera el límite permitido (${P.MAX_INPUT_CHARS} caracteres).`);
  }

  let permit;
  try {
    permit = acquire(license, { jobId, family: plan.family, calls: plan.calls || 1, ip });
  } catch (e) {
    if (e instanceof QuotaError) return { status: 429, body: { error: 'license_daily_limit_reached', message: quotaMessage(e.limit) } };
    if (e.code === 'invalid_job') return bad('invalid_job', 'El trabajo de análisis ha caducado. Vuelve a lanzarlo.', 409);
    throw e;
  }
  const jobOut = permit.job ? { job: permit.job.id } : {};

  let result;
  try {
    result = await generate({
      system: P.systemPrompt({ profile, lang }),
      parts: plan.parts,
      schema: plan.schema,
      maxTokens: plan.maxTokens || 8000
    });
  } catch (e) {
    permit.onFailure();
    if (e instanceof AiError && AI_ERROR_RESPONSES[e.code]) {
      const [status, message] = AI_ERROR_RESPONSES[e.code];
      return { status, body: { error: e.code, message } };
    }
    console.error('[AI] Excepción:', e.message);
    return { status: 500, body: { error: 'internal_error', message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.' } };
  }
  permit.onSuccess();

  audit('AI_ANALYSIS_GENERATED', {
    license_id: license.id, ip,
    detail: `task=${task}, chars=${plan.chars}, source=${source}, provider=${result.model}`
  });

  if (task === 'folder_map') {
    return { status: 200, body: { notes: P.clean(result.text, 12000), ...jobOut } };
  }
  if (task === 'invoices') {
    return { status: 200, body: { invoices: P.normalizeInvoices(result.json, plan.files), ...jobOut } };
  }

  const report = P.normalizeReport(result.json);
  if (!report.summary && !report.priorities.length) {
    return { status: 502, body: { error: 'ai_bad_output', message: AI_ERROR_RESPONSES.ai_bad_output[1] } };
  }
  const finalTitle = P.clean(title, 120) || DEFAULT_TITLES[task];
  const kind = task === 'compare' ? 'excel' : task;
  const meta = { ...(plan.meta || {}), task, lang: P.normLang(lang), source };

  // Historial: best-effort (un fallo de escritura NUNCA bloquea el análisis).
  let analysisId = null;
  let actions = [];
  try {
    analysisId = createAnalysis({
      license_id: license.id, kind, title: finalTitle,
      result_json: report, meta, prompt_chars: plan.chars
    });
    createActionsForAnalysis(license.id, analysisId, report.action_plan);
    actions = listActionsForAnalysis(license.id, analysisId);
  } catch (persistErr) {
    console.error('[AI] No se pudo persistir el análisis en el historial:', persistErr.message);
  }

  return {
    status: 200,
    body: {
      analysis_id: analysisId,
      kind,
      title: finalTitle,
      format: 'json',
      report,
      meta: { ...meta, answers: undefined },
      health: plan.meta?.health || null,
      actions,
      ...jobOut
    }
  };
}

module.exports = { runAnalysis, REPORT_TASKS, ALL_TASKS, MAX_INVOICES_PER_CALL, MAX_FOLDER_BATCHES, MAX_INVOICE_BATCHES };
