import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class NokfiApi implements ICredentialType {
	name = 'nokfiApi';

	displayName = 'Nokfi API';

	icon: Icon = { light: 'file:../icons/nokfi.svg', dark: 'file:../icons/nokfi.dark.svg' };

	documentationUrl = 'https://nokfi.app/api-docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'nk_live_…',
			description:
				'Create it in Nokfi → Developers → Keys. Available on the Pro and Max plans. Tip: name each key after the client or workflow to see its usage separately.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://nokfi.app',
			description: 'Leave the default unless Nokfi support tells you otherwise',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/usage',
			method: 'GET',
		},
	};
}
