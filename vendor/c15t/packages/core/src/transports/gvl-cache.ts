import type { GlobalVendorList } from '@c15t/schema/types';

import { parseCacheDirectiveSeconds } from '../libs/cache-directive';
import { failedResponseError } from '../libs/failed-response';

export interface CachedGvl {
	gvl: GlobalVendorList | null;
	expiresAt: number;
}

export type GvlCache = Map<string, CachedGvl>;

export interface FetchCachedGvlOptions {
	url: string;
	language: string;
	fetch: typeof globalThis.fetch;
	headers?: Record<string, string>;
	label?: string;
	now?: number;
	cache?: GvlCache;
}

const DEFAULT_TTL_SECONDS = 86_400;

const defaultGvlCache: GvlCache = new Map();
const inflightByCache = new WeakMap<
	GvlCache,
	Map<string, Promise<GlobalVendorList | null>>
>();

const getInflight = function getInflight(cache: GvlCache) {
	let inflight = inflightByCache.get(cache);
	if (!inflight) {
		inflight = new Map();
		inflightByCache.set(cache, inflight);
	}
	return inflight;
};

const ttlFromHeaders = function ttlFromHeaders(headers: Headers): number {
	const cacheControl = headers.get('cache-control');
	if (
		cacheControl
			?.split(',')
			.some((part) =>
				['no-store', 'no-cache', 'private'].includes(
					part.trim().split('=')[0]?.toLowerCase() ?? ''
				)
			)
	) {
		return 0;
	}
	const ttl =
		parseCacheDirectiveSeconds(cacheControl, 's-maxage') ??
		parseCacheDirectiveSeconds(cacheControl, 'max-age') ??
		DEFAULT_TTL_SECONDS;
	const age = Number(headers.get('age') ?? 0);
	return Math.max(0, ttl - (Number.isFinite(age) && age > 0 ? age : 0));
};

export const clearGvlCache = function clearGvlCache(
	cache: GvlCache = defaultGvlCache
): void {
	cache.clear();
	inflightByCache.delete(cache);
};

export const fetchCachedGvl = function fetchCachedGvl(
	options: FetchCachedGvlOptions
): Promise<GlobalVendorList | null> {
	const cache = options.cache ?? defaultGvlCache;
	const now = options.now ?? Date.now();
	const key = `${options.url}|${options.language}`;
	const cached = cache.get(key);
	if (cached && cached.expiresAt > now) {
		return Promise.resolve(cached.gvl);
	}

	const inflight = getInflight(cache);
	const pending = inflight.get(key);
	if (pending) {
		return pending;
	}

	const label = options.label ?? 'c15t';
	const run = (async () => {
		try {
			const response = await options.fetch(options.url, {
				headers: { 'accept-language': options.language, ...options.headers },
				method: 'GET',
			});
			if (!response.ok && response.status !== 204) {
				if (cached) {
					return cached.gvl;
				}
				throw await failedResponseError(`${label}: GVL`, response);
			}
			const gvl =
				response.status === 204
					? null
					: ((await response.json()) as GlobalVendorList);
			if (inflightByCache.get(cache) === inflight) {
				const ttl = ttlFromHeaders(response.headers);
				if (ttl > 0) {
					cache.set(key, { expiresAt: now + ttl * 1000, gvl });
				} else {
					cache.delete(key);
				}
			}
			return gvl;
		} finally {
			inflight.delete(key);
		}
	})();
	inflight.set(key, run);
	return run;
};
