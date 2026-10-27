import { c15tProtocolHeaders } from './version-header';

export const createManifestRequestInit = function createManifestRequestInit(
	options: {
		credentials?: RequestCredentials;
		headers?: Record<string, string>;
	} = {}
): RequestInit & { headers: Record<string, string> } {
	const init: RequestInit & { headers: Record<string, string> } = {
		headers: {
			accept: 'application/json',
			...c15tProtocolHeaders,
			...options.headers,
		},
		method: 'GET',
	};
	if (options.credentials !== undefined) {
		init.credentials = options.credentials;
	}
	return init;
};
