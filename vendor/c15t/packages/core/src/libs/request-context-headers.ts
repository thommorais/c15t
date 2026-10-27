import type { InitRequestParams } from '@c15t/schema/types';

import type { Overrides } from '../options/overrides';

export const DEFAULT_INIT_CREDENTIALS: RequestCredentials = 'same-origin';

export const buildRequestContextHeaders = function buildRequestContextHeaders(
	overrides?: Pick<Overrides, 'country' | 'region' | 'language' | 'gpc'>
): Record<string, string> {
	const headers: Record<string, string> = {};

	if (overrides?.gpc !== undefined) {
		headers['x-c15t-gpc'] = overrides.gpc ? '1' : '0';
	}

	if (overrides?.country) {
		headers['x-c15t-country'] = overrides.country;
	}

	if (overrides?.region) {
		headers['x-c15t-region'] = overrides.region;
	}

	if (overrides?.language) {
		headers['accept-language'] = overrides.language;
	}

	return headers;
};

export const buildRequestContextParams = function buildRequestContextParams(
	overrides?: Pick<Overrides, 'country' | 'region' | 'gpc'>
): Pick<InitRequestParams, 'country' | 'region' | 'gpc'> {
	return {
		...(overrides?.country && { country: overrides.country }),
		...(overrides?.region && { region: overrides.region }),
		...(overrides?.gpc !== undefined && { gpc: overrides.gpc }),
	};
};

export const buildRequestContextSentHeaders =
	function buildRequestContextSentHeaders(
		overrides?: Pick<Overrides, 'language'>
	): Record<string, string> {
		return overrides?.language ? { 'accept-language': overrides.language } : {};
	};
