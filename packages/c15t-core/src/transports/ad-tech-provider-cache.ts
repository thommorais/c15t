import {
	adTechProviderFetchSignal,
	adTechProviderListUrl,
	normalizeAdTechProviderIds,
	parseAdTechProviderList,
} from '@c15t/schema/types';
import type {
	AdTechProvider,
	ConsentManifest,
	ConsentManifestAdditionalConsent,
	InitOutput,
} from '@c15t/schema/types';

interface CachedProviders {
	providers: AdTechProvider[] | undefined;
	expiresAt: number;
	staleUntil: number;
}

export type AdTechProviderCache = Map<string, CachedProviders>;

export interface FetchCachedAdTechProvidersOptions {
	reference: ConsentManifestAdditionalConsent;
	fetch: typeof globalThis.fetch;
	headers?: Record<string, string>;
	now?: number;
	cache?: AdTechProviderCache;
}

const TTL_MS = 86_400_000;
const STALE_TTL_MS = 30 * TTL_MS;
const FAILURE_BACKOFF_MS = 60_000;
const MAX_ENTRIES = 32;
const sharedCache: AdTechProviderCache = new Map();
let relativeCaches = new WeakMap<
	typeof globalThis.fetch,
	AdTechProviderCache
>();
const inflightByCache = new WeakMap<
	AdTechProviderCache,
	Map<string, Promise<AdTechProvider[] | undefined>>
>();

const isAbsoluteUrl = (url: string): boolean =>
	/^[a-z][a-z\d+.-]*:/iu.test(url);

const cacheFor = function cacheFor(
	options: FetchCachedAdTechProvidersOptions
): AdTechProviderCache {
	if (options.cache) {
		return options.cache;
	}
	if (isAbsoluteUrl(options.reference.url)) {
		return sharedCache;
	}
	let cache = relativeCaches.get(options.fetch);
	if (!cache) {
		cache = new Map();
		relativeCaches.set(options.fetch, cache);
	}
	return cache;
};

const remember = function remember(
	cache: AdTechProviderCache,
	key: string,
	entry: CachedProviders
): void {
	cache.delete(key);
	cache.set(key, entry);
	while (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) {
			break;
		}
		cache.delete(oldest);
	}
};

const inflightFor = function inflightFor(cache: AdTechProviderCache) {
	let inflight = inflightByCache.get(cache);
	if (!inflight) {
		inflight = new Map();
		inflightByCache.set(cache, inflight);
	}
	return inflight;
};

export const clearAdTechProviderCache = function clearAdTechProviderCache(
	cache?: AdTechProviderCache
): void {
	if (cache) {
		cache.clear();
		inflightByCache.delete(cache);
		return;
	}
	sharedCache.clear();
	inflightByCache.delete(sharedCache);
	relativeCaches = new WeakMap();
};

export const fetchCachedAdTechProviders = function fetchCachedAdTechProviders(
	options: FetchCachedAdTechProvidersOptions
): Promise<AdTechProvider[] | undefined> {
	const ids = normalizeAdTechProviderIds(options.reference.providers);
	if (ids.length === 0) {
		return Promise.resolve([]);
	}
	const cache = cacheFor(options);
	const inflight = inflightFor(cache);
	const now = options.now ?? Date.now();
	const key = `${options.reference.url}|${ids.join(',')}`;
	const cached = cache.get(key);
	if (cached && cached.expiresAt > now) {
		return Promise.resolve(cached.providers);
	}
	const stale =
		cached && cached.staleUntil > now ? cached.providers : undefined;
	if (cached && !stale) {
		cache.delete(key);
	}
	const pending = inflight.get(key);
	if (pending) {
		return pending;
	}
	const backOff = () => {
		const staleUntil = stale && cached ? cached.staleUntil : 0;
		remember(cache, key, {
			expiresAt: stale
				? Math.min(now + FAILURE_BACKOFF_MS, staleUntil)
				: now + FAILURE_BACKOFF_MS,
			providers: stale,
			staleUntil,
		});
		return stale;
	};
	const run = (async () => {
		try {
			const response = await options.fetch(
				adTechProviderListUrl(options.reference.url, ids),
				{
					headers: options.headers,
					method: 'GET',
					signal: adTechProviderFetchSignal(),
				}
			);
			const providers = response.ok
				? parseAdTechProviderList(await response.json(), ids)
				: null;
			if (!providers) {
				return backOff();
			}
			remember(cache, key, {
				expiresAt: now + TTL_MS,
				providers,
				staleUntil: now + STALE_TTL_MS,
			});
			return providers;
		} catch {
			return backOff();
		} finally {
			inflight.delete(key);
		}
	})();
	inflight.set(key, run);
	return run;
};

export const loadManifestAdTechProviders = function loadManifestAdTechProviders(
	manifest: ConsentManifest,
	output: InitOutput,
	load: (
		reference: ConsentManifestAdditionalConsent
	) => Promise<AdTechProvider[] | undefined>
): Promise<AdTechProvider[] | undefined> {
	if (
		manifest.iab?.enabled !== true ||
		output.policyResolution?.status !== 'matched' ||
		output.policyResolution.policy.model !== 'iab'
	) {
		return Promise.resolve(undefined);
	}
	const reference = manifest.iab.additionalConsent;
	return reference ? load(reference) : Promise.resolve([]);
};
