import * as v from 'valibot';

export const adTechProviderSchema = v.object({
	id: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	policyUrl: v.pipe(v.string(), v.regex(/^https?:\/\//iu)),
});

export type AdTechProvider = v.InferOutput<typeof adTechProviderSchema>;

export const AD_TECH_PROVIDER_PURPOSES = [1, 3, 4] as const;

export const AD_TECH_PROVIDERS_URL = 'https://gvl.inth.app/additional-consent';

export const ADDITIONAL_CONSENT_V2_PATTERN =
	/^2~(?:[1-9]\d*(?:\.[1-9]\d*)*)?~dv(?:\.(?:[1-9]\d*(?:\.[1-9]\d*)*)?)?$/u;

export const MAX_AD_TECH_PROVIDER_QUERY_IDS = 500;

export const AD_TECH_PROVIDER_FETCH_TIMEOUT_MS = 5000;

export const adTechProviderFetchSignal = function adTechProviderFetchSignal():
	| AbortSignal
	| undefined {
	if (
		typeof AbortSignal !== 'undefined' &&
		typeof AbortSignal.timeout === 'function'
	) {
		return AbortSignal.timeout(AD_TECH_PROVIDER_FETCH_TIMEOUT_MS);
	}
	if (typeof AbortController === 'undefined') {
		return undefined;
	}
	const controller = new AbortController();
	setTimeout(() => controller.abort(), AD_TECH_PROVIDER_FETCH_TIMEOUT_MS);
	return controller.signal;
};

export const normalizeAdTechProviderIds = function normalizeAdTechProviderIds(
	ids: readonly number[]
): number[] {
	return [...new Set(ids)]
		.filter((id) => Number.isSafeInteger(id) && id > 0)
		.sort((a, b) => a - b);
};

export const adTechProviderListUrl = function adTechProviderListUrl(
	url: string,
	ids: readonly number[]
): string {
	if (ids.length === 0 || ids.length > MAX_AD_TECH_PROVIDER_QUERY_IDS) {
		return url;
	}
	const query = new URLSearchParams({ providerIds: ids.join(',') });
	return `${url}${url.includes('?') ? '&' : '?'}${query}`;
};

const readProvider = function readProvider(
	value: unknown
): AdTechProvider | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const { id, name, policyUrl } = value as Record<string, unknown>;
	if (
		typeof id !== 'number' ||
		!Number.isSafeInteger(id) ||
		id < 1 ||
		typeof name !== 'string' ||
		name.trim() === '' ||
		typeof policyUrl !== 'string' ||
		!/^https?:\/\//iu.test(policyUrl)
	) {
		return null;
	}
	return { id, name: name.trim(), policyUrl };
};

export const parseAdTechProviderList = function parseAdTechProviderList(
	payload: unknown,
	ids: readonly number[]
): AdTechProvider[] | null {
	const listed =
		payload && typeof payload === 'object' && 'providers' in payload
			? (payload as { providers: unknown }).providers
			: null;
	if (!listed || typeof listed !== 'object') {
		return null;
	}
	const byId = new Map<number, AdTechProvider>();
	for (const entry of Object.values(listed)) {
		const provider = readProvider(entry);
		if (provider) {
			byId.set(provider.id, provider);
		}
	}
	return ids.flatMap((id) => {
		const provider = byId.get(id);
		return provider ? [provider] : [];
	});
};
