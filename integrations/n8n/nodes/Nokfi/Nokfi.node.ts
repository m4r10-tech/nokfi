import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const MAX_DOCS_PER_REQUEST = 5;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const XML_TYPES = ['application/xml', 'text/xml'];

export class Nokfi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nokfi',
		name: 'nokfi',
		icon: { light: 'file:nokfi.svg', dark: 'file:nokfi.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Extract and validate invoices, run financial analyses and Spanish tax calculations for small businesses with Nokfi',
		defaults: { name: 'Nokfi' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'nokfiApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Invoice', value: 'invoice' },
					{ name: 'Analysis', value: 'analysis' },
					{ name: 'Tax', value: 'tax' },
					{ name: 'Usage', value: 'usage' },
				],
				default: 'invoice',
			},

			// ── Invoice ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['invoice'] } },
				options: [
					{
						name: 'Extract',
						value: 'extract',
						action: 'Extract invoice data',
						description:
							'Read invoices (PDF, JPG, PNG, WebP, text or e-invoice XML) and return structured data with validation checks',
					},
				],
				default: 'extract',
			},
			{
				displayName: 'Input',
				name: 'inputMode',
				type: 'options',
				displayOptions: { show: { resource: ['invoice'], operation: ['extract'] } },
				options: [
					{ name: 'Binary File(s)', value: 'binary', description: 'E.g. email attachments or files from Drive.' },
					{ name: 'Text', value: 'text', description: 'Text you already extracted from the invoice' },
				],
				default: 'binary',
			},
			{
				displayName: 'Input Binary Field(s)',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: { show: { resource: ['invoice'], operation: ['extract'], inputMode: ['binary'] } },
				default: 'data',
				hint: 'Comma-separated names, or * to use every binary field of the item (e.g. all email attachments)',
				description: 'Name of the binary field(s) that contain the invoices',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				displayOptions: { show: { resource: ['invoice'], operation: ['extract'], inputMode: ['text'] } },
				default: '',
				description: 'Invoice text',
			},
			{
				displayName: 'Output',
				name: 'splitOutput',
				type: 'options',
				displayOptions: { show: { resource: ['invoice'], operation: ['extract'] } },
				options: [
					{ name: 'One Item per Invoice', value: true },
					{ name: 'Single Item with All Invoices', value: false },
				],
				default: true,
			},

			// ── Analysis ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['analysis'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create an analysis', description: 'Run an AI financial analysis and get a structured report' },
					{ name: 'Get', value: 'get', action: 'Get an analysis', description: 'Get a report by ID' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many analyses', description: 'List your latest analyses' },
				],
				default: 'create',
			},
			{
				displayName: 'Type',
				name: 'analysisType',
				type: 'options',
				displayOptions: { show: { resource: ['analysis'], operation: ['create'] } },
				options: [
					{ name: 'Spreadsheet (Excel/CSV Rows)', value: 'excel' },
					{ name: 'Compare Two Periods', value: 'compare' },
					{ name: 'Documents Folder', value: 'folder' },
					{ name: 'Business Questionnaire', value: 'cuestionario' },
				],
				default: 'excel',
			},
			{
				displayName: 'Module',
				name: 'module',
				type: 'options',
				displayOptions: { show: { resource: ['analysis'], operation: ['create'], analysisType: ['excel'] } },
				options: [
					{ name: 'Cash', value: 'caja' },
					{ name: 'Incoming Stock (Purchases)', value: 'entradas' },
					{ name: 'Profit After Taxes and Costs', value: 'total' },
					{ name: 'Sales', value: 'ventas' },
					{ name: 'Services', value: 'servicios' },
					{ name: 'Stock', value: 'stock' },
				],
				default: 'ventas',
			},
			{
				displayName: 'Data Source',
				name: 'dataSource',
				type: 'options',
				displayOptions: { show: { resource: ['analysis'], operation: ['create'], analysisType: ['excel'] } },
				options: [
					{ name: 'All Input Items as Rows', value: 'items', description: 'E.g. the output of a Google Sheets or Excel node.' },
					{ name: 'JSON', value: 'json' },
				],
				default: 'items',
			},
			{
				displayName: 'Data (JSON)',
				name: 'data',
				type: 'json',
				displayOptions: { show: { resource: ['analysis'], operation: ['create'] }, hide: { dataSource: ['items'] } },
				default: '{}',
				description: 'The "data" object of POST /api/v1/analyze. See https://nokfi.app/api-docs.',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				displayOptions: { show: { resource: ['analysis'], operation: ['create'] } },
				default: '',
				placeholder: 'September sales',
			},
			{
				displayName: 'Analysis ID',
				name: 'analysisId',
				type: 'number',
				required: true,
				displayOptions: { show: { resource: ['analysis'], operation: ['get'] } },
				default: 0,
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				displayOptions: { show: { resource: ['analysis'], operation: ['getAll'] } },
				default: 50,
				description: 'Max number of results to return',
			},

			// ── Tax (sin IA, no gasta cuota) ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['tax'] } },
				options: [
					{ name: 'Calculate VAT', value: 'vat', action: 'Calculate VAT', description: 'Spanish VAT (IVA) with or without VAT included, and the equivalence surcharge' },
					{ name: 'Calculate Withholding', value: 'withholding', action: 'Calculate IRPF withholding', description: 'IRPF withholding for an invoice and the total to collect' },
					{ name: 'Estimate Modelo 130', value: 'model130', action: 'Estimate modelo 130', description: 'Quarterly IRPF payment, from your figures or from your Nokfi ledger' },
					{ name: 'Get Fiscal Calendar', value: 'calendar', action: 'Get upcoming tax deadlines', description: 'Upcoming Spanish tax deadlines with days left' },
					{ name: 'Validate Tax ID', value: 'taxId', action: 'Validate a spanish tax ID', description: 'NIF, NIE or CIF check digit, entity type and EU VAT number' },
				],
				default: 'taxId',
			},
			{
				displayName: 'Tax ID',
				name: 'taxId',
				type: 'string',
				required: true,
				displayOptions: { show: { resource: ['tax'], operation: ['taxId'] } },
				default: '',
				placeholder: 'B12345674',
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				typeOptions: { numberPrecision: 2 },
				required: true,
				displayOptions: { show: { resource: ['tax'], operation: ['vat', 'withholding'] } },
				default: 0,
				description: 'For VAT: the amount (net, or gross if VAT is included). For withholding: the invoice base.',
			},
			{
				displayName: 'VAT Rate',
				name: 'vatRate',
				type: 'options',
				displayOptions: { show: { resource: ['tax'], operation: ['vat', 'withholding'] } },
				options: [
					{ name: '0 %', value: 0 },
					{ name: '10 %', value: 10 },
					{ name: '21 %', value: 21 },
					{ name: '4 %', value: 4 },
					{ name: '5 %', value: 5 },
				],
				default: 21,
			},
			{
				displayName: 'Amount Includes VAT',
				name: 'includesVat',
				type: 'boolean',
				displayOptions: { show: { resource: ['tax'], operation: ['vat'] } },
				default: false,
			},
			{
				displayName: 'Equivalence Surcharge',
				name: 'equivalenceSurcharge',
				type: 'boolean',
				displayOptions: { show: { resource: ['tax'], operation: ['vat'] } },
				default: false,
				description: 'Whether to add the recargo de equivalencia (5.2 / 1.4 / 0.62 / 0.5 %)',
			},
			{
				displayName: 'Withholding Type',
				name: 'withholdingType',
				type: 'options',
				displayOptions: { show: { resource: ['tax'], operation: ['withholding'] } },
				options: [
					{ name: 'Agricultural (2 %)', value: 'agricultural' },
					{ name: 'Modules (1 %)', value: 'modules' },
					{ name: 'New Professional (7 %)', value: 'new_professional' },
					{ name: 'Professional (15 %)', value: 'professional' },
					{ name: 'Rental (19 %)', value: 'rental' },
				],
				default: 'professional',
			},
			{
				displayName: 'Source',
				name: 'source',
				type: 'options',
				displayOptions: { show: { resource: ['tax'], operation: ['model130'] } },
				options: [
					{ name: 'My Figures', value: 'input' },
					{ name: 'My Nokfi Ledger', value: 'ledger' },
				],
				default: 'input',
			},
			{
				displayName: 'Year',
				name: 'year',
				type: 'number',
				displayOptions: { show: { resource: ['tax'], operation: ['model130'] } },
				default: 2026,
			},
			{
				displayName: 'Quarter',
				name: 'quarter',
				type: 'options',
				displayOptions: { show: { resource: ['tax'], operation: ['model130'] } },
				options: [
					{ name: 'Q1', value: 1 },
					{ name: 'Q2', value: 2 },
					{ name: 'Q3', value: 3 },
					{ name: 'Q4', value: 4 },
				],
				default: 1,
			},
			{
				displayName: 'Figures (Year to Date)',
				name: 'figures',
				type: 'collection',
				placeholder: 'Add Figure',
				displayOptions: { show: { resource: ['tax'], operation: ['model130'], source: ['input'] } },
				default: {},
				options: [
					{ displayName: 'Expenses', name: 'expenses', type: 'number', typeOptions: { numberPrecision: 2 }, default: 0 },
					{ displayName: 'Income', name: 'income', type: 'number', typeOptions: { numberPrecision: 2 }, default: 0 },
					{ displayName: 'Previous Payments', name: 'previous_payments', type: 'number', typeOptions: { numberPrecision: 2 }, default: 0 },
					{ displayName: 'Withholdings', name: 'withholdings', type: 'number', typeOptions: { numberPrecision: 2 }, default: 0 },
				],
			},
			{
				displayName: 'Legal Form',
				name: 'legalForm',
				type: 'options',
				displayOptions: { show: { resource: ['tax'], operation: ['calendar'] } },
				options: [
					{ name: 'From My Nokfi Profile', value: '' },
					{ name: 'Autónomo (Self-Employed)', value: 'autonomo' },
					{ name: 'Sociedad (Company)', value: 'sociedad' },
				],
				default: '',
			},
			{
				displayName: 'Limit',
				name: 'calendarLimit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 24 },
				displayOptions: { show: { resource: ['tax'], operation: ['calendar'] } },
				default: 6,
				description: 'Max number of results to return',
			},

			// ── Usage ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['usage'] } },
				options: [{ name: 'Get', value: 'get', action: 'Get today s usage', description: 'Plan, daily quota and analyses used today' }],
				default: 'get',
			},

			// ── Common ──
			{
				displayName: 'Run in Background',
				name: 'async',
				type: 'boolean',
				displayOptions: { show: { resource: ['analysis', 'invoice'], operation: ['create', 'extract'] } },
				default: false,
				description: 'Whether to return a job right away instead of waiting. Get the result with the Nokfi Trigger (Job Completed event) or GET /api/v1/jobs/{ID}.',
			},
			{
				displayName: 'Report Language',
				name: 'lang',
				type: 'options',
				displayOptions: { show: { resource: ['analysis', 'invoice'], operation: ['create', 'extract'] } },
				options: [
					{ name: 'English', value: 'en' },
					{ name: 'French', value: 'fr' },
					{ name: 'German', value: 'de' },
					{ name: 'Italian', value: 'it' },
					{ name: 'Polish', value: 'pl' },
					{ name: 'Spanish', value: 'es' },
				],
				default: 'es',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const credentials = await this.getCredentials('nokfiApi');
		const baseUrl = String(credentials.baseUrl || 'https://nokfi.app').replace(/\/+$/, '');
		const out: INodeExecutionData[] = [];
		let idem = 0;
		const asyncQs = (i: number) => (resource !== 'tax' && resource !== 'usage' && this.getNodeParameter('async', i, false) ? '?async=true' : '');

		const api = async (method: IHttpRequestMethods, path: string, body?: IDataObject, itemIndex = 0) => {
			const options: IHttpRequestOptions = { method, url: `${baseUrl}/api/v1${path}`, json: true };
			if (body) options.body = body;
			// Reintentos seguros: n8n puede repetir la petición (Retry On Fail) sin cobrarla dos veces.
			if (method === 'POST') options.headers = { 'Idempotency-Key': `n8n-${this.getExecutionId()}-${this.getNode().id}-${itemIndex}-${path}-${idem++}` };
			try {
				return (await this.helpers.httpRequestWithAuthentication.call(this, 'nokfiApi', options)) as IDataObject;
			} catch (error) {
				const data = (error as { response?: { body?: IDataObject } })?.response?.body;
				const message = typeof data?.message === 'string' ? data.message : (error as Error).message;
				throw new NodeOperationError(this.getNode(), message, {
					itemIndex,
					description: typeof data?.error === 'string' ? `Nokfi error code: ${data.error}` : undefined,
				});
			}
		};

		// Analysis › Create with all input items as rows: a single request for the whole input.
		if (resource === 'analysis' && operation === 'create' && this.getNodeParameter('analysisType', 0) === 'excel'
			&& this.getNodeParameter('dataSource', 0) === 'items') {
			const rows = items.map((i) => i.json).slice(0, 5000);
			const body: IDataObject = {
				type: 'excel',
				lang: this.getNodeParameter('lang', 0) as string,
				title: (this.getNodeParameter('title', 0) as string) || undefined,
				data: { module: this.getNodeParameter('module', 0) as string, files: [{ name: 'n8n', rows, total_rows: items.length }] },
			};
			const res = await api('POST', `/analyze${asyncQs(0)}`, body);
			return [[{ json: res, pairedItem: items.map((_, i) => ({ item: i })) }]];
		}

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'usage') {
					out.push({ json: await api('GET', '/usage', undefined, i), pairedItem: { item: i } });
					if (i === 0) break; // la cuota no depende del ítem
				} else if (resource === 'tax') {
					let res: IDataObject;
					if (operation === 'taxId') {
						res = await api('GET', `/tax/nif?value=${encodeURIComponent(this.getNodeParameter('taxId', i) as string)}`, undefined, i);
					} else if (operation === 'vat') {
						res = await api('POST', '/tax/vat', {
							amount: this.getNodeParameter('amount', i), rate: this.getNodeParameter('vatRate', i),
							includes_vat: this.getNodeParameter('includesVat', i), equivalence_surcharge: this.getNodeParameter('equivalenceSurcharge', i),
						}, i);
					} else if (operation === 'withholding') {
						res = await api('POST', '/tax/withholding', {
							base: this.getNodeParameter('amount', i), type: this.getNodeParameter('withholdingType', i), vat_rate: this.getNodeParameter('vatRate', i),
						}, i);
					} else if (operation === 'model130') {
						const source = this.getNodeParameter('source', i) as string;
						res = await api('POST', '/tax/model-130', {
							source, year: this.getNodeParameter('year', i), quarter: this.getNodeParameter('quarter', i),
							...(source === 'input' ? (this.getNodeParameter('figures', i, {}) as IDataObject) : {}),
						}, i);
					} else {
						const lf = this.getNodeParameter('legalForm', i) as string;
						const limit = this.getNodeParameter('calendarLimit', i) as number;
						res = await api('GET', `/tax/calendar?limit=${limit}${lf ? `&legal_form=${lf}` : ''}`, undefined, i);
						for (const d of (res.deadlines as IDataObject[]) || []) out.push({ json: d, pairedItem: { item: i } });
						continue;
					}
					out.push({ json: res, pairedItem: { item: i } });
				} else if (resource === 'analysis' && operation === 'get') {
					const id = this.getNodeParameter('analysisId', i) as number;
					out.push({ json: await api('GET', `/analyses/${encodeURIComponent(String(id))}`, undefined, i), pairedItem: { item: i } });
				} else if (resource === 'analysis' && operation === 'getAll') {
					const limit = this.getNodeParameter('limit', i) as number;
					const res = await api('GET', `/analyses?limit=${limit}`, undefined, i);
					for (const a of (res.analyses as IDataObject[]) || []) out.push({ json: a, pairedItem: { item: i } });
				} else if (resource === 'analysis' && operation === 'create') {
					const raw = this.getNodeParameter('data', i);
					const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
					const body: IDataObject = {
						type: this.getNodeParameter('analysisType', i) as string,
						lang: this.getNodeParameter('lang', i) as string,
						title: (this.getNodeParameter('title', i) as string) || undefined,
						data,
					};
					if (body.type === 'excel' && data && !data.module) (data as IDataObject).module = this.getNodeParameter('module', i);
					out.push({ json: await api('POST', `/analyze${asyncQs(i)}`, body, i), pairedItem: { item: i } });
				} else if (resource === 'invoice' && operation === 'extract') {
					const lang = this.getNodeParameter('lang', i) as string;
					const split = this.getNodeParameter('splitOutput', i) as boolean;
					const docs: IDataObject[] = [];
					if (this.getNodeParameter('inputMode', i) === 'text') {
						docs.push({ name: `item-${i + 1}.txt`, text: this.getNodeParameter('text', i) as string });
					} else {
						const wanted = (this.getNodeParameter('binaryPropertyName', i) as string).trim();
						const binary = items[i].binary || {};
						const names = wanted === '*' ? Object.keys(binary) : wanted.split(',').map((s) => s.trim()).filter(Boolean);
						if (!names.length) throw new NodeOperationError(this.getNode(), 'The item has no binary data', { itemIndex: i });
						for (const name of names) {
							const meta = this.helpers.assertBinaryData(i, name);
							const mime = (meta.mimeType || '').toLowerCase();
							const buffer = await this.helpers.getBinaryDataBuffer(i, name);
							const fileName = meta.fileName || name;
							if (XML_TYPES.includes(mime) || /\.(xml|xsig)$/i.test(fileName)) {
								// E-invoice (Facturae, UBL, CII): read exactly, no AI, no quota.
								docs.push({ name: fileName, mime: 'application/xml', data: buffer.toString('base64') });
							} else if (mime === 'application/pdf' || IMAGE_TYPES.includes(mime)) {
								docs.push({ name: fileName, mime, data: buffer.toString('base64') });
							} else if (mime.startsWith('text/')) {
								docs.push({ name: fileName, text: buffer.toString('utf8') });
							} else {
								docs.push({ name: fileName, mime: mime || 'application/octet-stream', data: '' });
							}
						}
					}
					const invoices: IDataObject[] = [];
					const errors: IDataObject[] = [];
					for (let k = 0; k < docs.length; k += MAX_DOCS_PER_REQUEST) {
						const batch = docs.slice(k, k + MAX_DOCS_PER_REQUEST);
						const readable = batch.filter((d) => d.text || d.data);
						for (const d of batch.filter((x) => !x.text && !x.data)) {
							errors.push({ file_name: d.name, error: 'unsupported_type', message: `Unsupported file type: ${d.mime}` });
						}
						if (!readable.length) continue;
						const res = await api('POST', `/invoices/extract${asyncQs(i)}`, { files: readable, lang }, i);
						if (res.object === 'job') { invoices.push(res); continue; }
						invoices.push(...((res.invoices as IDataObject[]) || []));
						errors.push(...((res.errors as IDataObject[]) || []));
					}
					if (split) {
						for (const inv of invoices) out.push({ json: inv, pairedItem: { item: i } });
						for (const err of errors) out.push({ json: { ...err, is_invoice: false }, pairedItem: { item: i } });
					} else {
						out.push({ json: { invoices, errors }, pairedItem: { item: i } });
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}
