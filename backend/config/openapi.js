/**
 * config/openapi.js — F4: especificación OpenAPI 3.0 de la API pública v1.
 * Servida en GET /api/v1/openapi.json y documentada en /api-docs (frontend).
 */

'use strict';

const Report = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    key_figures: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, note: { type: 'string' } } } },
    strengths: { type: 'array', items: { type: 'string' } },
    priorities: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, link: { type: 'string', description: 'URL absoluta de la pantalla de Nokfi que lo resuelve (vacío si no hay)' } } } },
    action_plan: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, timeframe: { type: 'string' }, due_in_days: { type: 'integer' }, link: { type: 'string', description: 'URL absoluta de la pantalla de Nokfi que lo resuelve (vacío si no hay)' } } } },
    glossary: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, definition: { type: 'string' } } } }
  }
};

const FileInput = {
  type: 'object',
  description: 'Un archivo: filas (hoja de cálculo) o texto (PDF/documento).',
  properties: {
    name: { type: 'string', example: 'ventas-septiembre.xlsx' },
    rows: { type: 'array', items: { type: 'object' }, description: 'Hasta 80 filas (objetos columna → valor).' },
    total_rows: { type: 'integer' },
    text: { type: 'string', description: 'Texto extraído (máx. 30.000 caracteres).' }
  }
};

// Sesión 7 — facturas extraídas + validaciones deterministas del backend.
const Invoice = {
  type: 'object',
  properties: {
    file_name: { type: 'string' }, is_invoice: { type: 'boolean' },
    issuer_name: { type: 'string' }, issuer_nif: { type: 'string' },
    recipient_name: { type: 'string' }, recipient_nif: { type: 'string' },
    invoice_number: { type: 'string' },
    invoice_date: { type: 'string', format: 'date' }, due_date: { type: 'string', description: 'YYYY-MM-DD o vacío' },
    concept: { type: 'string' }, category: { type: 'string' },
    base: { type: 'number' }, vat_rate: { type: 'number' }, vat_amount: { type: 'number' },
    irpf_rate: { type: 'number' }, irpf_amount: { type: 'number' }, total: { type: 'number' },
    checks: {
      type: 'object',
      description: 'Calculado por Nokfi, no por la IA.',
      properties: {
        totals_ok: { type: 'boolean', description: 'base + IVA − retención = total (±0,05 €)' },
        nif_valid: { type: 'boolean', description: 'NIF/NIE/CIF del emisor con dígito de control correcto' },
        recipient_nif_valid: { type: 'boolean', nullable: true, description: 'null si no aparece' },
        date_valid: { type: 'boolean', description: 'Fecha válida, desde 2000 y no futura' },
        vat_rate_valid: { type: 'boolean', description: 'Tipo de IVA/IGIC habitual (0, 3, 4, 5, 7, 9,5, 10, 15, 21)' }
      }
    },
    warnings: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } }
  }
};

// Sesión 9 — Bloque 2: parámetros comunes, trabajos, webhooks y herramientas sin IA.
const AsyncParams = [
  { name: 'async', in: 'query', schema: { type: 'boolean' }, description: 'true → responde 202 con un trabajo (Job) al momento. Equivale a la cabecera Prefer: respond-async.' },
  { name: 'Prefer', in: 'header', schema: { type: 'string', example: 'respond-async' } },
  { $ref: '#/components/parameters/IdempotencyKey' }
];

const Job = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'job_3f9c…' },
    object: { type: 'string', example: 'job' },
    kind: { type: 'string', enum: ['analyze', 'invoices.extract'] },
    status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed'] },
    livemode: { type: 'boolean' },
    created_at: { type: 'string' }, finished_at: { type: 'string', nullable: true },
    result: { type: 'object', nullable: true, description: 'La misma respuesta que la llamada síncrona. Se guarda 24 h.' },
    result_expired: { type: 'boolean' },
    error: { type: 'object', nullable: true, properties: { code: { type: 'string' }, message: { type: 'string' } } },
    poll_after_seconds: { type: 'integer' }
  }
};

const WebhookEndpoint = {
  type: 'object',
  properties: {
    id: { type: 'integer' }, url: { type: 'string' },
    events: { type: 'array', items: { type: 'string', enum: ['*', 'analysis.completed', 'job.completed', 'job.failed', 'quota.threshold', 'fiscal.deadline'] } },
    description: { type: 'string' }, enabled: { type: 'boolean' }, disabled_reason: { type: 'string', nullable: true },
    secret: { type: 'string', description: 'Solo al crear: whsec_… para comprobar la firma.' }
  }
};

const WEBHOOKS_DOC = [
  '**Webhooks.** Nokfi envía un POST JSON `{ id, type, created_at, livemode, data }` a tus endpoints.',
  'Eventos: `analysis.completed` (informe terminado, también los de la web), `job.completed`, `job.failed`,',
  '`quota.threshold` (80 % y 100 % de la cuota del día) y `fiscal.deadline` (7 días y 1 día antes de cada plazo).',
  'Firma: cabecera `Nokfi-Signature: t=<unix>,v1=<hex>` con v1 = HMAC-SHA256(secreto, "<t>.<cuerpo tal cual>"); rechaza firmas de más de 5 min.',
  'Otras cabeceras: `Nokfi-Event`, `Nokfi-Event-Id` (úsalo para descartar duplicados) y `Nokfi-Delivery`.',
  'Responde 2xx en menos de 10 s; si no, se reintenta 6 veces en ~20 h (1 min, 5 min, 30 min, 2 h, 6 h, 12 h). Solo https y direcciones públicas.'
].join(' ');

const num = { type: 'number' };
const taxOk = (desc) => ({ 200: { description: desc }, 400: { description: 'invalid_input (con el motivo en message)' } });

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Nokfi API',
    version: '1.1.0',
    description: 'API de Nokfi para automatizaciones (n8n, Make, Zapier…). Claves reales (nk_live_) en los planes Pro y Max; cada análisis o extracción consume 1 de la cuota diaria del plan, igual que en la web. Claves de prueba (nk_test_) en todos los planes: devuelven datos de ejemplo con la misma forma, validan la entrada igual y no gastan cuota. Las herramientas fiscales (/tax/*) no usan IA ni gastan cuota. Todos los POST admiten Idempotency-Key (24 h): un reintento con la misma clave devuelve la misma respuesta sin ejecutarse ni cobrarse dos veces. ' + WEBHOOKS_DOC
  },
  servers: [{ url: 'https://nokfi.app/api/v1' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Clave de API (nk_live_… o nk_test_…) creada en Desarrolladores → Claves.' } },
    parameters: {
      IdempotencyKey: { name: 'Idempotency-Key', in: 'header', schema: { type: 'string', maxLength: 255 }, description: 'Hasta 255 caracteres. Misma clave + mismo cuerpo → misma respuesta (Idempotent-Replayed: true). Otro cuerpo → 422 idempotency_key_reused; aún en curso → 409.' }
    },
    schemas: { Report, FileInput, Invoice, Job, WebhookEndpoint }
  },
  security: [{ bearer: [] }],
  paths: {
    '/usage': {
      get: { summary: 'Cuota de hoy', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { plan: { type: 'string' }, daily_quota: { type: 'integer' }, used_today: { type: 'integer' } } } } } } } }
    },
    '/analyze': {
      post: {
        summary: 'Lanzar un análisis',
        parameters: AsyncParams,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'data'],
                properties: {
                  type: { type: 'string', enum: ['excel', 'compare', 'folder', 'cuestionario'] },
                  lang: { type: 'string', enum: ['es', 'en', 'fr', 'it', 'de', 'pl'], default: 'es' },
                  title: { type: 'string' },
                  data: {
                    type: 'object',
                    description: 'excel: { module: stock|ventas|servicios|entradas|caja|total, context?, files: FileInput[] } · compare: { module, periodA: { label, files }, periodB: { label, files }, stats? } · folder: { instruction, folder_name?, files: FileInput[] } · cuestionario: { answers: { <id>: true|false } }'
                  }
                }
              },
              example: { type: 'excel', lang: 'es', title: 'Ventas de septiembre', data: { module: 'ventas', files: [{ name: 'ventas.csv', rows: [{ producto: 'A', unidades: 12, importe: 240 }] }] } }
            }
          }
        },
        responses: {
          200: { description: 'Informe', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, type: { type: 'string' }, title: { type: 'string' }, report: { $ref: '#/components/schemas/Report' } } } } } },
          202: { description: 'Trabajo en cola (?async=true)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          400: { description: 'Datos no válidos' },
          401: { description: 'Clave no válida/revocada o plan sin API (api_plan_required)' },
          429: { description: 'Cuota diaria agotada (license_daily_limit_reached) o límite por minuto' }
        }
      }
    },
    '/invoices/extract': {
      post: {
        summary: 'Extraer facturas (PDF, imagen, texto o factura electrónica XML) con validaciones',
        description: 'Hasta 5 documentos por petición. Las facturas electrónicas (Facturae 3.2.x/.xsig, UBL 2.x Invoice/CreditNote, CII y Factur-X/ZUGFeRD con el XML embebido en el PDF) se leen tal cual, sin IA: el resultado es exacto, lleva source_format y no gasta cuota (ai_used: false). Si hay algún documento que necesita la IA, la petición gasta 1 análisis de la cuota. PDF digital: el texto se extrae en el servidor; PDF escaneado: envíalo como imagen. No se guarda el archivo; en modo asíncrono el resultado se guarda 24 h para que puedas recogerlo.',
        parameters: AsyncParams,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['files'],
                properties: {
                  files: {
                    type: 'array', maxItems: 5,
                    items: { type: 'object', properties: {
                      name: { type: 'string' },
                      mime: { type: 'string', enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'] },
                      data: { type: 'string', description: 'Archivo en base64 (máx. 5 MB)' },
                      text: { type: 'string', description: 'Alternativa a data: texto ya extraído o el XML de la factura electrónica' }
                    } }
                  },
                  lang: { type: 'string', enum: ['es', 'en', 'fr', 'it', 'de', 'pl'] }
                }
              },
              example: { files: [{ name: 'factura-017.pdf', mime: 'application/pdf', data: 'JVBERi0xLjQK…' }] }
            }
          }
        },
        responses: {
          200: { description: 'Facturas y documentos no leídos', content: { 'application/json': { schema: { type: 'object', properties: {
            invoices: { type: 'array', items: { allOf: [{ $ref: '#/components/schemas/Invoice' }, { type: 'object', properties: { source_format: { type: 'string', enum: ['Facturae', 'UBL', 'Factur-X'], description: 'Solo en facturas electrónicas leídas sin IA' } } }] } },
            errors: { type: 'array', items: { type: 'object', properties: { file_name: { type: 'string' }, error: { type: 'string', enum: ['pdf_scanned', 'unsupported_type', 'unsupported_xml', 'file_too_large', 'empty_file', 'unreadable_file'] }, message: { type: 'string' } } } },
            ai_used: { type: 'boolean', description: 'false si todo eran facturas electrónicas: no se ha gastado cuota' }
          } } } } },
          202: { description: 'Trabajo en cola (?async=true)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          400: { description: 'invalid_input, too_many_files o no_readable_files (sin gastar cuota)' },
          401: { description: 'Clave no válida/revocada o plan sin API' },
          429: { description: 'Cuota diaria agotada o límite por minuto' }
        }
      }
    },
    '/analyses': { get: { summary: 'Listar análisis', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } }], responses: { 200: { description: 'OK' } } } },
    '/analyses/{id}': { get: { summary: 'Obtener un análisis', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 404: { description: 'No encontrado' } } } },

    '/jobs': { get: { summary: 'Últimos trabajos (sin el resultado)', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } }], responses: { 200: { description: 'OK' } } } },
    '/jobs/{id}': {
      get: {
        summary: 'Estado y resultado de un trabajo',
        description: 'Consulta cada pocos segundos (poll_after_seconds) o, mejor, suscríbete a job.completed / job.failed.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } }, 404: { description: 'No encontrado' } }
      }
    },

    '/webhooks': {
      get: { summary: 'Listar webhooks', responses: { 200: { description: 'OK' } } },
      post: {
        summary: 'Crear un webhook',
        description: WEBHOOKS_DOC,
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
        requestBody: { required: true, content: { 'application/json': {
          schema: { type: 'object', required: ['url'], properties: { url: { type: 'string', example: 'https://n8n.midominio.com/webhook/abc' }, events: { oneOf: [{ type: 'string', example: '*' }, { type: 'array', items: { type: 'string' } }] }, description: { type: 'string' } } },
          example: { url: 'https://n8n.midominio.com/webhook/abc', events: ['analysis.completed', 'fiscal.deadline'] }
        } } },
        responses: { 201: { description: 'Creado (con el secreto)', content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookEndpoint' } } } }, 400: { description: 'invalid_url, invalid_events o too_many_endpoints (máx. 10)' } }
      }
    },
    '/webhooks/{id}': {
      get: { summary: 'Obtener un webhook', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 404: { description: 'No encontrado' } } },
      patch: { summary: 'Cambiar url, eventos, descripción o activarlo', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      delete: { summary: 'Borrar un webhook', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Borrado' } } }
    },
    '/webhooks/{id}/test': { post: { summary: 'Enviar un evento ping de prueba', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '{ ok, status, error, ms }' } } } },

    '/tax/nif': {
      get: {
        summary: 'Validar NIF, NIE o CIF (sin IA, no gasta cuota)',
        description: 'Formato y dígito de control, tipo de entidad (por la letra del CIF) y NIF-IVA intracomunitario. No consulta el censo de la AEAT ni VIES.',
        parameters: [{ name: 'value', in: 'query', required: true, schema: { type: 'string', example: 'B12345674' } }],
        responses: taxOk('{ value, normalized, valid, type: nif|nie|cif|null, entity, vat_number, reason: null|format|check_digit }')
      }
    },
    '/tax/vat': {
      post: {
        summary: 'Calcular IVA y recargo de equivalencia (sin IA)',
        requestBody: { required: true, content: { 'application/json': {
          schema: { type: 'object', required: ['amount'], properties: { amount: num, rate: { type: 'number', enum: [0, 4, 5, 10, 21], default: 21 }, includes_vat: { type: 'boolean' }, equivalence_surcharge: { type: 'boolean', description: 'Recargo: 5,2 / 1,4 / 0,62 / 0,5 %' } } },
          example: { amount: 1210, includes_vat: true }
        } } },
        responses: taxOk('{ base, vat_rate, vat_amount, surcharge_rate, surcharge_amount, total }')
      }
    },
    '/tax/withholding': {
      post: {
        summary: 'Calcular la retención de IRPF de una factura (sin IA)',
        requestBody: { required: true, content: { 'application/json': {
          schema: { type: 'object', required: ['base'], properties: { base: num, type: { type: 'string', enum: ['professional', 'new_professional', 'rental', 'agricultural', 'modules'], default: 'professional' }, rate: { type: 'number', description: 'Tipo propio (sustituye a type)' }, vat_rate: { type: 'number', default: 21 } } },
          example: { base: 1000, type: 'professional' }
        } } },
        responses: taxOk('{ base, withholding_rate, withholding_amount, vat_rate, vat_amount, total_invoice }')
      }
    },
    '/tax/model-130': {
      post: {
        summary: 'Estimar el modelo 130 (sin IA)',
        description: '20 % del rendimiento neto acumulado del año − pagos fraccionados anteriores − retenciones. Con source "ledger" se calcula con tu libro de Nokfi.',
        requestBody: { required: true, content: { 'application/json': {
          schema: { type: 'object', properties: { year: { type: 'integer' }, quarter: { type: 'integer', minimum: 1, maximum: 4 }, source: { type: 'string', enum: ['input', 'ledger'] }, income: num, expenses: num, previous_payments: num, withholdings: num } },
          example: { year: 2026, quarter: 3, income: 42000, expenses: 18500, previous_payments: 2900, withholdings: 600 }
        } } },
        responses: taxOk('{ income, expense, net, gross, previous_payments, withholdings, result, due_date }')
      }
    },
    '/tax/quarter': {
      get: {
        summary: 'Resumen del trimestre desde tu libro: 303 y 130 (sin IA)',
        parameters: [{ name: 'year', in: 'query', schema: { type: 'integer' } }, { name: 'quarter', in: 'query', schema: { type: 'integer' } }],
        responses: taxOk('{ vat, irpf130, total_estimated, reserved, missing, vat_refund, due_date }')
      }
    },
    '/tax/calendar': {
      get: {
        summary: 'Calendario fiscal: próximos plazos (sin IA)',
        parameters: [
          { name: 'legal_form', in: 'query', schema: { type: 'string', enum: ['autonomo', 'sociedad'] }, description: 'Por defecto, la de tu perfil' },
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 24 } },
          { name: 'year', in: 'query', schema: { type: 'integer' }, description: 'Todos los plazos de ese año' }
        ],
        responses: taxOk('{ deadlines: [{ key, date, days_left, models, period, kind, conditional }] }')
      }
    }
  }
};
