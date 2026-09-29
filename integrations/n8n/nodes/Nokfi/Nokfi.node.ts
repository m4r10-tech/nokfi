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

export class Nokfi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nokfi',
		name: 'nokfi',
		icon: { light: 'file:nokfi.svg', dark: 'file:nokfi.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Extract and validate invoices, and run financial analyses for small businesses with Nokfi',
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
							'Read invoices (PDF, JPG, PNG, WebP or text) and return structured data with validation checks',
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

		const api = async (method: IHttpRequestMethods, path: string, body?: IDataObject, itemIndex = 0) => {
			const options: IHttpRequestOptions = { method, url: `${baseUrl}/api/v1${path}`, json: true };
			if (body) options.body = body;
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
			const res = await api('POST', '/analyze', body);
			return [[{ json: res, pairedItem: items.map((_, i) => ({ item: i })) }]];
		}

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'usage') {
					out.push({ json: await api('GET', '/usage', undefined, i), pairedItem: { item: i } });
					if (i === 0) break; // la cuota no depende del ítem
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
					out.push({ json: await api('POST', '/analyze', body, i), pairedItem: { item: i } });
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
							if (mime === 'application/pdf' || IMAGE_TYPES.includes(mime)) {
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
						const res = await api('POST', '/invoices/extract', { files: readable, lang }, i);
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
