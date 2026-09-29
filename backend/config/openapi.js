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
    priorities: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] } } } },
    action_plan: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, timeframe: { type: 'string' } } } },
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

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Nokfi API',
    version: '1.0.0',
    description: 'API de Nokfi para automatizaciones (n8n, Make, Zapier…). Disponible en los planes Pro y Max. Cada análisis consume 1 de la cuota diaria del plan, igual que en la web.'
  },
  servers: [{ url: 'https://nokfi.app/api/v1' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Clave de API (nk_live_…) creada en Desarrolladores → Claves.' } },
    schemas: { Report, FileInput, Invoice }
  },
  security: [{ bearer: [] }],
  paths: {
    '/usage': {
      get: { summary: 'Cuota de hoy', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { plan: { type: 'string' }, daily_quota: { type: 'integer' }, used_today: { type: 'integer' } } } } } } } }
    },
    '/analyze': {
      post: {
        summary: 'Lanzar un análisis',
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
          400: { description: 'Datos no válidos' },
          401: { description: 'Clave no válida/revocada o plan sin API (api_plan_required)' },
          429: { description: 'Cuota diaria agotada (license_daily_limit_reached) o límite por minuto' }
        }
      }
    },
    '/invoices/extract': {
      post: {
        summary: 'Extraer facturas (PDF, imagen o texto) con validaciones',
        description: 'Hasta 5 documentos por petición; cada petición gasta 1 análisis de la cuota. PDF digital: el texto se extrae en el servidor; PDF escaneado: envíalo como imagen. No se guarda nada (ni el archivo ni los datos).',
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
                      mime: { type: 'string', enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
                      data: { type: 'string', description: 'Archivo en base64 (máx. 5 MB)' },
                      text: { type: 'string', description: 'Alternativa a data: texto ya extraído' }
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
            invoices: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } },
            errors: { type: 'array', items: { type: 'object', properties: { file_name: { type: 'string' }, error: { type: 'string', enum: ['pdf_scanned', 'unsupported_type', 'file_too_large', 'empty_file', 'unreadable_file'] }, message: { type: 'string' } } } }
          } } } } },
          400: { description: 'invalid_input, too_many_files o no_readable_files (sin gastar cuota)' },
          401: { description: 'Clave no válida/revocada o plan sin API' },
          429: { description: 'Cuota diaria agotada o límite por minuto' }
        }
      }
    },
    '/analyses': { get: { summary: 'Listar análisis', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } }], responses: { 200: { description: 'OK' } } } },
    '/analyses/{id}': { get: { summary: 'Obtener un análisis', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 404: { description: 'No encontrado' } } } }
  }
};
