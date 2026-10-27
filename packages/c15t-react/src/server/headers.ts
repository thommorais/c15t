import {
	CONSENT_REQUEST_HEADER_NAMES,
	extractConsentRequestInputs,
} from '@c15t/schema/types';

const REACT_EXTRA_HEADERS = [
	'x-c15t-version',
	'user-agent',
	'x-forwarded-for',
	'purpose',
	'sec-purpose',
	'next-router-prefetch',
	'x-middleware-prefetch',
] as const;

const FORWARDED_HEADERS = [
	...CONSENT_REQUEST_HEADER_NAMES,
	...REACT_EXTRA_HEADERS,
] as const;

export const CLIENT_FORWARDING_HEADERS = [
	'forwarded',
	'x-forwarded-host',
	'x-forwarded-proto',
] as const;

type ForwardedHeader =
	| (typeof FORWARDED_HEADERS)[number]
	| (typeof CLIENT_FORWARDING_HEADERS)[number];

type RelevantHeaders = Partial<Record<ForwardedHeader, string>>;

export const extractRelevantHeaders = function extractRelevantHeaders(
	headersList: Headers,
	options: { trustForwardedHeaders?: boolean } = {}
): RelevantHeaders {
	const relevantHeaders: RelevantHeaders = {};
	const names: readonly ForwardedHeader[] = options.trustForwardedHeaders
		? [...FORWARDED_HEADERS, ...CLIENT_FORWARDING_HEADERS]
		: FORWARDED_HEADERS;

	for (const headerName of names) {
		const value = headersList.get(headerName);
		if (value) {
			relevantHeaders[headerName] = value;
		}
	}

	const inputs = extractConsentRequestInputs(headersList);
	if (inputs.country) {
		relevantHeaders['x-c15t-country'] = inputs.country;
	}
	if (inputs.region) {
		relevantHeaders['x-c15t-region'] = inputs.region;
	}

	return relevantHeaders;
};
