import type { Overrides } from '@c15t/core';

import { extractRelevantHeaders } from './headers';

export const createSSRInitCacheKey = function createSSRInitCacheKey({
	normalizedURL,
	headers,
	overrides,
}: {
	normalizedURL: string;
	headers: Headers;
	overrides?: Overrides;
}): string {
	const relevantHeaders = extractRelevantHeaders(headers);

	const effectiveCountry =
		overrides?.country ?? relevantHeaders['x-c15t-country'] ?? '';
	const effectiveRegion =
		overrides?.region ?? relevantHeaders['x-c15t-region'] ?? '';
	const effectiveLanguage =
		overrides?.language ?? relevantHeaders['accept-language'] ?? '';
	const gpc = relevantHeaders['sec-gpc'] ?? '';

	return JSON.stringify({
		country: effectiveCountry,
		gpc,
		language: effectiveLanguage,
		normalizedURL,
		region: effectiveRegion,
	});
};
