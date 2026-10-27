import {
	appendInitParams,
	appendJourneyParams,
	applyInitParamsToHeaders,
} from '@c15t/schema/types';

import {
	buildRequestContextHeaders,
	buildRequestContextParams,
	buildRequestContextSentHeaders,
	DEFAULT_INIT_CREDENTIALS,
} from '../libs/request-context-headers';
import type { InitContext } from '../types';
import { trimSlash } from './hosted-records';
import { c15tProtocolParams } from './version-header';

export interface HostedInitRequest {
	url: string;
	requestHeaders: Record<string, string>;
	init: RequestInit & { headers: Record<string, string> };
}

export const createHostedInitRequest =
	function createHostedInitRequest(options: {
		backendURL: string;
		initURL?: string;
		credentials?: RequestCredentials;
		headers?: Record<string, string>;
		overrides: InitContext['overrides'];
		experiment?: InitContext['experiment'];
		journey?: InitContext['journey'];
	}): HostedInitRequest {
		const base = options.initURL ?? `${trimSlash(options.backendURL)}/init`;
		const params = appendInitParams(base, {
			...c15tProtocolParams,
			...buildRequestContextParams(options.overrides),
			experiment: options.experiment,
		});
		const url = options.journey
			? appendJourneyParams(params, {
					id: options.journey.id,
					scope: options.journey.scope,
					storedChoice: options.journey.storedChoice,
				})
			: params;
		const requestHeaders = Object.fromEntries(
			applyInitParamsToHeaders(
				url,
				new Headers({
					...options.headers,
					...buildRequestContextHeaders(options.overrides),
				})
			)
		);
		return {
			init: {
				credentials: options.credentials ?? DEFAULT_INIT_CREDENTIALS,
				headers: {
					accept: 'application/json',
					...options.headers,
					...buildRequestContextSentHeaders(options.overrides),
				},
				method: 'GET',
			},
			requestHeaders,
			url,
		};
	};
