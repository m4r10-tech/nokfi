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

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Nokfi API',
    version: '1.0.0',
    description: 'API de Nokfi para automatizaciones (n8n, Make, Zapier…). Disponible en los planes Pro y Max. Cada análisis consume 1 de la cuota diaria del plan, igual que en la web.'
  },
  servers: [{ url: 'https://nokfi.app/api/v1' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Clave de API (nk_live_…) creada en Configuración → API.' } },
    schemas: { Report, FileInput }
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
    '/analyses': { get: { summary: 'Listar análisis', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } }], responses: { 200: { description: 'OK' } } } },
    '/analyses/{id}': { get: { summary: 'Obtener un análisis', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 404: { description: 'No encontrado' } } } }
  }
};
