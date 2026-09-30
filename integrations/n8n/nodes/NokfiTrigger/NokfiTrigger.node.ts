import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError } from 'n8n-workflow';

const TOLERANCE_S = 300;

/** Nokfi-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")> */
function validSignature(secret: string, header: string, rawBody: string): boolean {
	const parts: Record<string, string> = {};
	for (const p of header.split(',')) {
		const [k, v] = p.split('=');
		if (k && v) parts[k.trim()] = v.trim();
	}
	const t = Number(parts.t);
	if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
	const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
	const got = Buffer.from(parts.v1);
	return expected.length === got.length && timingSafeEqual(expected, got);
}

export class NokfiTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nokfi Trigger',
		name: 'nokfiTrigger',
		icon: { light: 'file:nokfi.svg', dark: 'file:nokfi.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Nokfi finishes an analysis or a job, when your quota reaches 80 % or 100 %, or when a Spanish tax deadline is near',
		defaults: { name: 'Nokfi Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'nokfiApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: [
					{ name: 'Analysis Completed', value: 'analysis.completed', description: 'A report finished (from the API or the web app)' },
					{ name: 'Fiscal Deadline', value: 'fiscal.deadline', description: 'A tax deadline (303, 130, 111…) is 7 days or 1 day away' },
					{ name: 'Job Completed', value: 'job.completed', description: 'An async job (?async=true) finished; the result is included' },
					{ name: 'Job Failed', value: 'job.failed', description: 'An async job failed' },
					{ name: 'Quota Threshold', value: 'quota.threshold', description: 'You reached 80 % or 100 % of today’s quota' },
				],
				default: ['analysis.completed'],
			},
			{
				displayName: 'Only Live Events',
				name: 'onlyLive',
				type: 'boolean',
				default: false,
				description: 'Whether to ignore test events (sent when you use an nk_test_ key)',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.webhookId) return false;
				try {
					await nokfiApi.call(this, 'GET', `/webhooks/${data.webhookId}`);
					return true;
				} catch {
					delete data.webhookId;
					delete data.secret;
					return false;
				}
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const res = await nokfiApi.call(this, 'POST', '/webhooks', {
					url,
					events,
					description: `n8n · ${this.getWorkflow().name || 'workflow'}`.slice(0, 120),
				});
				const data = this.getWorkflowStaticData('node');
				data.webhookId = res.id;
				data.secret = res.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.webhookId) {
					try {
						await nokfiApi.call(this, 'DELETE', `/webhooks/${data.webhookId}`);
					} catch (error) {
						this.logger.warn(`Nokfi: could not delete webhook ${data.webhookId}: ${(error as Error).message}`);
						return false;
					}
				}
				delete data.webhookId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const secret = String(this.getWorkflowStaticData('node').secret || '');
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
		const rawBody = raw ? raw.toString('utf8') : JSON.stringify(req.body);
		const header = String(req.headers['nokfi-signature'] || '');
		if (!secret || !validSignature(secret, header, rawBody)) {
			const res = this.getResponseObject();
			res.status(401).json({ error: 'invalid_signature' });
			return { noWebhookResponse: true };
		}
		const event = req.body as IDataObject;
		const events = this.getNodeParameter('events') as string[];
		const onlyLive = this.getNodeParameter('onlyLive') as boolean;
		// "ping" (Enviar prueba) y eventos no elegidos: se aceptan (200) pero no arrancan el flujo.
		if (!events.includes(String(event.type)) || (onlyLive && event.livemode === false)) return {};
		return { workflowData: [this.helpers.returnJsonArray(event)] };
	}
}

async function nokfiApi(this: IHookFunctions, method: IHttpRequestMethods, path: string, body?: IDataObject): Promise<IDataObject> {
	const credentials = await this.getCredentials('nokfiApi');
	const baseUrl = String(credentials.baseUrl || 'https://nokfi.app').replace(/\/+$/, '');
	const options: IHttpRequestOptions = { method, url: `${baseUrl}/api/v1${path}`, json: true };
	if (body) options.body = body;
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'nokfiApi', options)) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as never);
	}
}
