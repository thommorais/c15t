import { parseAcceptLanguage } from '@c15t/translations';

export const COUNTRY_HEADERS = [
	'x-c15t-country',
	'cf-ipcountry',
	'x-vercel-ip-country',
	'x-amz-cf-ipcountry',
	'x-country-code',
	'x-country',
] as const;

export const REGION_HEADERS = [
	'x-c15t-region',
	'cf-region-code',
	'x-vercel-ip-country-region',
	'x-region-code',
] as const;

export const GPC_HEADERS = ['x-c15t-gpc', 'sec-gpc'] as const;

export const CONSENT_REQUEST_HEADER_NAMES = [
	...COUNTRY_HEADERS,
	...REGION_HEADERS,
	'accept-language',
	...GPC_HEADERS,
] as const;

export interface ConsentRequestHeaderInputs {
	country?: string;
	region?: string;
	language?: string;
	gpc?: boolean;
}

type HeaderSource = Headers | Record<string, string | undefined>;

const getHeader = function getHeader(
	source: HeaderSource,
	name: string
): string | undefined {
	if (typeof (source as Headers).get === 'function') {
		return (source as Headers).get(name) ?? undefined;
	}
	const record = source as Record<string, string | undefined>;
	return record[name] ?? record[name.toLowerCase()];
};

const pickHeader = function pickHeader(
	source: HeaderSource,
	names: readonly string[]
): string | undefined {
	for (const name of names) {
		const value = getHeader(source, name);
		if (value) {
			return value;
		}
	}
	return undefined;
};

export const parseGlobalPrivacyControl = function parseGlobalPrivacyControl(
	value: string | null | undefined
): boolean | undefined {
	if (value === '1') {
		return true;
	}
	if (value === '0') {
		return false;
	}
	return undefined;
};

export const extractConsentRequestInputs = function extractConsentRequestInputs(
	headers: HeaderSource,
	overrides: Partial<ConsentRequestHeaderInputs> = {}
): ConsentRequestHeaderInputs {
	const acceptLanguage = getHeader(headers, 'accept-language');
	return {
		country: overrides.country ?? pickHeader(headers, COUNTRY_HEADERS),
		gpc:
			overrides.gpc ??
			parseGlobalPrivacyControl(pickHeader(headers, GPC_HEADERS)),
		language: overrides.language ?? parseAcceptLanguage(acceptLanguage)[0],
		region: overrides.region ?? pickHeader(headers, REGION_HEADERS),
	};
};

export const consentInputsToOverrides = function consentInputsToOverrides(
	inputs: ConsentRequestHeaderInputs
): Record<string, string | boolean> {
	const overrides: Record<string, string | boolean> = {};
	if (inputs.country) {
		overrides.country = inputs.country;
	}
	if (inputs.region) {
		overrides.region = inputs.region;
	}
	if (inputs.language) {
		overrides.language = inputs.language;
	}
	if (inputs.gpc !== undefined) {
		overrides.gpc = inputs.gpc;
	}
	return overrides;
};

export const headersToRecord = function headersToRecord(
	headers: Headers
): Record<string, string> {
	const record: Record<string, string> = {};
	headers.forEach((value, key) => {
		record[key.toLowerCase()] = value;
	});
	return record;
};

export const getRegionFromHeaders = function getRegionFromHeaders(
	headers: Record<string, string | undefined>
): {
	region?: string;
	country?: string;
} {
	const country = pickHeader(headers, COUNTRY_HEADERS);
	const region = pickHeader(headers, REGION_HEADERS);

	return {
		...(country && { country }),
		...(region && { region }),
	};
};

export {
	DEFAULT_IP_HEADERS_LIST,
	getIpAddress,
	type IpAddressConfig,
	maskIpAddress,
} from './client-ip';

export { getAppScheme } from './app-scheme';
export {
	isOriginTrusted,
	type LoggerLike,
	matchesWildcard,
} from './trusted-origin';
