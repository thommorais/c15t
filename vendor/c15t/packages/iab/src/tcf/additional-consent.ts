import type { AdTechProvider } from '@c15t/core';
import {
	AD_TECH_PROVIDER_PURPOSES,
	AD_TECH_PROVIDERS_URL,
	adTechProviderFetchSignal,
	adTechProviderListUrl,
	normalizeAdTechProviderIds,
	parseAdTechProviderList,
} from '@c15t/schema/types';

export const AD_TECH_PROVIDERS_ENDPOINT = AD_TECH_PROVIDERS_URL;

export { AD_TECH_PROVIDER_PURPOSES };

export interface AdditionalConsentSignal {
	consented: number[];
	disclosed: number[];
}

const isProviderId = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const sortedIds = (ids: Iterable<number>): number[] =>
	[...new Set(ids)].filter(isProviderId).sort((a, b) => a - b);

export const encodeAdditionalConsent = function encodeAdditionalConsent(
	signal: AdditionalConsentSignal
): string {
	const consented = sortedIds(signal.consented);
	const consentedSet = new Set(consented);
	const disclosedOnly = sortedIds(signal.disclosed).filter(
		(id) => !consentedSet.has(id)
	);
	return `2~${consented.join('.')}~dv.${disclosedOnly.join('.')}`;
};

const parseIds = (part: string): number[] | null => {
	if (part === '') {
		return [];
	}
	const ids = part.split('.').map(Number);
	return ids.every(isProviderId) ? ids : null;
};

export const decodeAdditionalConsent = function decodeAdditionalConsent(
	value: string
): AdditionalConsentSignal | null {
	const parts = value.split('~');
	if (parts.length !== 3 || parts[0] !== '2') {
		return null;
	}
	const consented = parseIds(parts[1] ?? '');
	const disclosedPart = parts[2] ?? '';
	if (disclosedPart !== 'dv' && !disclosedPart.startsWith('dv.')) {
		return null;
	}
	const disclosedOnly = parseIds(disclosedPart.slice(3));
	if (!consented || !disclosedOnly) {
		return null;
	}
	return {
		consented: sortedIds(consented),
		disclosed: sortedIds([...consented, ...disclosedOnly]),
	};
};

export const additionalConsentFor = function additionalConsentFor(
	choices: Readonly<Record<string, boolean>>,
	purposeConsents: Readonly<Record<number, boolean>>
): string | undefined {
	const disclosed = Object.keys(choices).map(Number).filter(isProviderId);
	if (disclosed.length === 0) {
		return undefined;
	}
	const purposesGranted = AD_TECH_PROVIDER_PURPOSES.every(
		(purpose) => purposeConsents[purpose] === true
	);
	return encodeAdditionalConsent({
		consented: purposesGranted
			? disclosed.filter((id) => choices[String(id)] === true)
			: [],
		disclosed,
	});
};

const inflight = new Map<string, Promise<AdTechProvider[]>>();

export const fetchAdTechProviders = function fetchAdTechProviders(
	providerIds: readonly number[],
	endpoint: string = AD_TECH_PROVIDERS_ENDPOINT
): Promise<AdTechProvider[]> {
	const ids = normalizeAdTechProviderIds(providerIds);
	if (ids.length === 0) {
		return Promise.resolve([]);
	}
	const base = new URL(
		endpoint,
		typeof window === 'undefined' ? undefined : window.location.href
	).toString();
	const requestUrl = adTechProviderListUrl(base, ids);
	const key = `${requestUrl}|${ids.join(',')}`;
	const existing = inflight.get(key);
	if (existing) {
		return existing;
	}
	const request = (async () => {
		try {
			const response = await fetch(requestUrl, {
				signal: adTechProviderFetchSignal(),
			});
			if (!response.ok) {
				throw new Error(
					`Failed to fetch ad tech providers: ${response.status} ${response.statusText}`
				);
			}
			const providers = parseAdTechProviderList(await response.json(), ids);
			if (!providers) {
				throw new Error('Invalid ad tech provider list: missing providers');
			}
			return providers;
		} finally {
			inflight.delete(key);
		}
	})();
	inflight.set(key, request);
	return request;
};
