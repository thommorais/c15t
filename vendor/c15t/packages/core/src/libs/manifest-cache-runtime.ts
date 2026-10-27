import type { ConsentManifest } from '@c15t/schema/types';
import { CONSENT_REQUEST_HEADER_NAMES } from '@c15t/schema/types';

import { c15tProtocolHeaders } from '../transports/version-header';
import { parseCacheDirectiveSeconds } from './cache-directive';
import { failedResponseError } from './failed-response';

export { parseCacheDirectiveSeconds } from './cache-directive';

export type ManifestFetch = (
	input: string | URL | Request,
	init?: RequestInit
) => Promise<Response>;

export interface CachedManifestResponse {
	manifest: ConsentManifest;
	headers: Record<string, string>;
	sMaxAge: number;
	expiresAt: number;
	staleUntil: number;
	fetchedAt: number;
	upstreamAge: number;
}

export const getManifestAge = function getManifestAge(
	entry: Pick<CachedManifestResponse, 'fetchedAt' | 'upstreamAge'>,
	now: number = Date.now()
): number {
	return (
		entry.upstreamAge + Math.max(0, Math.floor((now - entry.fetchedAt) / 1000))
	);
};

export interface ManifestCache {
	get: (cacheKey: string) => CachedManifestResponse | undefined;
	set: (cacheKey: string, entry: CachedManifestResponse) => unknown;
	delete: (cacheKey: string) => unknown;
	clear: () => void;
}

export interface ManifestCacheOptions {
	maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 128;

export const createManifestCache = function createManifestCache(
	options: ManifestCacheOptions = {}
): ManifestCache {
	const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
	const entries = new Map<string, CachedManifestResponse>();

	const makeRoom = function makeRoom(): void {
		if (entries.size < maxEntries) {
			return;
		}
		const now = Date.now();
		for (const [key, entry] of entries) {
			if (entry.staleUntil <= now) {
				entries.delete(key);
			}
		}
		while (entries.size >= maxEntries) {
			const oldest = entries.keys().next();
			if (oldest.done) {
				break;
			}
			entries.delete(oldest.value);
		}
	};

	return {
		clear: () => entries.clear(),
		delete: (key) => entries.delete(key),
		get: (key) => {
			const entry = entries.get(key);
			if (entry) {
				entries.delete(key);
				entries.set(key, entry);
			}
			return entry;
		},
		set: (key, entry) => {
			if (entries.has(key)) {
				entries.delete(key);
			} else {
				makeRoom();
			}
			entries.set(key, entry);
		},
	};
};

const defaultManifestCache = createManifestCache();

interface InflightFill {
	promise: Promise<CachedManifestResponse>;
	startedAt: number;
}

const inflightByCache = new WeakMap<ManifestCache, Map<string, InflightFill>>();

const getInflight = function getInflight(
	cache: ManifestCache
): Map<string, InflightFill> {
	let inflight = inflightByCache.get(cache);
	if (!inflight) {
		inflight = new Map();
		inflightByCache.set(cache, inflight);
	}
	return inflight;
};

const MAX_REVALIDATION_FLOORS = DEFAULT_MAX_ENTRIES * 2;

const revalidateAfterByCache = new WeakMap<
	ManifestCache,
	Map<string, number>
>();

export const readRevalidationFloors = function readRevalidationFloors(
	cache: ManifestCache
): ReadonlyMap<string, number> {
	const floors = revalidateAfterByCache.get(cache);
	return floors ? new Map(floors) : new Map();
};

const getRevalidateAfter = function getRevalidateAfter(
	cache: ManifestCache
): Map<string, number> {
	let revalidateAfter = revalidateAfterByCache.get(cache);
	if (!revalidateAfter) {
		revalidateAfter = new Map();
		revalidateAfterByCache.set(cache, revalidateAfter);
	}
	return revalidateAfter;
};

const setRevalidationFloor = function setRevalidationFloor(
	cache: ManifestCache,
	cacheKey: string,
	deadline: number
): void {
	const revalidateAfter = getRevalidateAfter(cache);
	revalidateAfter.delete(cacheKey);
	while (revalidateAfter.size >= MAX_REVALIDATION_FLOORS) {
		const oldest = revalidateAfter.keys().next();
		if (oldest.done) {
			break;
		}
		revalidateAfter.delete(oldest.value);
	}
	revalidateAfter.set(cacheKey, deadline);
};

export const MANIFEST_FAILURE_RETRY_MIN_MS = 1000;

export const MANIFEST_FAILURE_RETRY_MAX_MS = 5000;

export const MANIFEST_FETCH_TIMEOUT_MS = 5000;

export type ManifestUnavailableReason = 'backoff' | 'timeout';

export class ManifestUnavailableError extends Error {
	readonly reason: ManifestUnavailableReason;
	readonly retryAfterMs: number | undefined;

	constructor(
		reason: ManifestUnavailableReason,
		message: string,
		options: { cause?: unknown; retryAfterMs?: number } = {}
	) {
		super(message, { cause: options.cause });
		this.name = 'ManifestUnavailableError';
		this.reason = reason;
		this.retryAfterMs = options.retryAfterMs;
	}
}

interface FillFailure {
	error: unknown;
	failures: number;
	retryAt: number;
}

const failuresByCache = new WeakMap<ManifestCache, Map<string, FillFailure>>();

const getFailures = function getFailures(
	cache: ManifestCache
): Map<string, FillFailure> {
	let failures = failuresByCache.get(cache);
	if (!failures) {
		failures = new Map();
		failuresByCache.set(cache, failures);
	}
	return failures;
};

const recordFillFailure = function recordFillFailure(
	cache: ManifestCache,
	cacheKey: string,
	error: unknown,
	settledAt: number
): void {
	const failures = getFailures(cache);
	const previous = failures.get(cacheKey);
	const count = (previous?.failures ?? 0) + 1;
	const floor = Math.min(
		MANIFEST_FAILURE_RETRY_MIN_MS * 2 ** (count - 1),
		MANIFEST_FAILURE_RETRY_MAX_MS
	);
	failures.delete(cacheKey);
	while (failures.size >= MAX_REVALIDATION_FLOORS) {
		const oldest = failures.keys().next();
		if (oldest.done) {
			break;
		}
		failures.delete(oldest.value);
	}
	failures.set(cacheKey, {
		error,
		failures: count,
		retryAt: settledAt + floor,
	});
};

export const readFillFailures = function readFillFailures(
	cache: ManifestCache
): ReadonlyMap<string, { failures: number; retryAt: number }> {
	const failures = failuresByCache.get(cache);
	return new Map(
		[...(failures ?? [])].map(([key, record]) => [
			key,
			{ failures: record.failures, retryAt: record.retryAt },
		])
	);
};

const generationByCache = new WeakMap<ManifestCache, number>();

const getGeneration = function getGeneration(cache: ManifestCache): number {
	return generationByCache.get(cache) ?? 0;
};

export const clearManifestCache = function clearManifestCache(
	cache: ManifestCache = defaultManifestCache
): void {
	cache.clear();
	inflightByCache.get(cache)?.clear();
	revalidateAfterByCache.get(cache)?.clear();
	failuresByCache.get(cache)?.clear();
	generationByCache.set(cache, getGeneration(cache) + 1);
};

export const MANIFEST_PASSTHROUGH_HEADERS = [
	'cache-control',
	'etag',
	'last-modified',
	'content-language',
] as const;

export const MANIFEST_DEDUPE_TTL_SECONDS = 5;

const trimSlash = function trimSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeHeaders = function normalizeHeaders(
	headers: Headers
): Record<string, string> {
	const normalized: Record<string, string> = {};
	headers.forEach((value, key) => {
		normalized[key.toLowerCase()] = value;
	});
	return normalized;
};

export const getManifestSMaxAge = function getManifestSMaxAge(
	cacheControl: string | null | undefined
): number {
	return parseCacheDirectiveSeconds(cacheControl, 's-maxage') ?? 0;
};

export const getManifestStaleWhileRevalidate =
	function getManifestStaleWhileRevalidate(
		cacheControl: string | undefined
	): number {
		return (
			parseCacheDirectiveSeconds(cacheControl, 'stale-while-revalidate') ?? 0
		);
	};

const readUpstreamAge = function readUpstreamAge(
	headers: Record<string, string>
): number {
	const parsed = Number.parseInt(headers.age ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const forbidsReuse = function forbidsReuse(
	cacheControl: string | undefined
): boolean {
	if (!cacheControl) {
		return false;
	}
	return cacheControl
		.split(',')
		.some((part) =>
			['no-store', 'no-cache', 'private'].includes(
				part.trim().split('=')[0]?.toLowerCase() ?? ''
			)
		);
};

const hasSharedMaxAge = function hasSharedMaxAge(
	cacheControl: string | undefined
): boolean {
	return parseCacheDirectiveSeconds(cacheControl, 's-maxage') !== undefined;
};

export const resolveManifestCacheTtlSeconds =
	function resolveManifestCacheTtlSeconds(
		cacheControl: string | undefined,
		sMaxAge: number
	): number {
		if (forbidsReuse(cacheControl)) {
			return 0;
		}
		if (hasSharedMaxAge(cacheControl)) {
			return sMaxAge;
		}
		return MANIFEST_DEDUPE_TTL_SECONDS;
	};

const resolveEntryLifetime = function resolveEntryLifetime(input: {
	cacheControl: string | undefined;
	now: number;
	sMaxAge: number;
	upstreamAge: number;
}): { expiresAt: number; staleUntil: number; ttl: number } {
	const ttl = resolveManifestCacheTtlSeconds(input.cacheControl, input.sMaxAge);
	const staleWhileRevalidate =
		!forbidsReuse(input.cacheControl) && hasSharedMaxAge(input.cacheControl)
			? getManifestStaleWhileRevalidate(input.cacheControl)
			: 0;
	const expiresAt = input.now + Math.max(0, ttl - input.upstreamAge) * 1000;
	const staleUntil =
		input.now +
		Math.max(0, ttl + staleWhileRevalidate - input.upstreamAge) * 1000;
	return { expiresAt, staleUntil, ttl };
};

export interface ManifestSourceOptions {
	backendURL?: string;
	manifestURL?: string;
}

export const resolveManifestSourceURL = function resolveManifestSourceURL(
	options: ManifestSourceOptions
): string {
	if (options.manifestURL) {
		return options.manifestURL;
	}
	if (!options.backendURL) {
		throw new Error(
			'c15t manifest cache: `backendURL` or `manifestURL` is required.'
		);
	}
	return `${trimSlash(options.backendURL)}/manifest`;
};

export const createManifestRequestURL =
	function createManifestRequestURL(input: {
		sourceURL: string;
		query?: string;
	}): string {
		const { sourceURL } = input;
		const hashIndex = sourceURL.indexOf('#');
		const withoutFragment =
			hashIndex === -1 ? sourceURL : sourceURL.slice(0, hashIndex);
		const queryIndex = withoutFragment.indexOf('?');
		const base =
			queryIndex === -1
				? withoutFragment
				: withoutFragment.slice(0, queryIndex);
		const sourceQuery =
			queryIndex === -1 ? '' : withoutFragment.slice(queryIndex + 1);
		const extraQuery = input.query?.startsWith('?')
			? input.query.slice(1)
			: (input.query ?? '');
		if (!sourceQuery && !extraQuery) {
			return base;
		}
		const params = new URLSearchParams(sourceQuery);
		for (const [name, value] of new URLSearchParams(extraQuery)) {
			params.append(name, value);
		}
		params.sort();
		const search = params.toString();
		return search ? `${base}?${search}` : base;
	};

const createManifestFetchURL = function createManifestFetchURL(input: {
	sourceURL: string;
	query?: string;
}): string {
	const { sourceURL } = input;
	const hashIndex = sourceURL.indexOf('#');
	const base = hashIndex === -1 ? sourceURL : sourceURL.slice(0, hashIndex);
	const query = input.query?.startsWith('?')
		? input.query.slice(1)
		: input.query;
	if (!query) {
		return base;
	}
	return `${base}${base.includes('?') ? '&' : '?'}${query}`;
};

export interface FetchCachedManifestOptions {
	sourceURL: string;
	fetch?: ManifestFetch;
	query?: string;
	now?: number;
	cache?: ManifestCache;
	headers?: Record<string, string>;
	init?: Omit<RequestInit, 'headers' | 'method'>;
	timeoutMs?: number;
	onBackgroundRevalidate?: (revalidation: Promise<void>) => void;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const CREDENTIAL_HEADERS = new Set([
	'authorization',
	'cookie',
	'proxy-authorization',
]);

const PUBLIC_MANIFEST_HEADERS = new Set([
	'accept',
	'accept-language',
	'content-type',
	'if-none-match',
	'origin',
	'referer',
	'sec-gpc',
	'user-agent',
	...CONSENT_REQUEST_HEADER_NAMES,
	...Object.keys(c15tProtocolHeaders),
]);

const findIdentityHeader = function findIdentityHeader(
	headers: Record<string, string> | undefined
): string | undefined {
	if (!headers) {
		return undefined;
	}
	return Object.keys(headers).find((name) => {
		const lower = name.toLowerCase();
		return CREDENTIAL_HEADERS.has(lower) || !PUBLIC_MANIFEST_HEADERS.has(lower);
	});
};

const assertCredentialTransport = function assertCredentialTransport(
	requestURL: string,
	headers: Record<string, string> | undefined
): void {
	const identityHeader = findIdentityHeader(headers);
	if (!identityHeader) {
		return;
	}
	let url: URL;
	try {
		url = new URL(requestURL);
	} catch {
		return;
	}
	if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
		throw new Error(
			`c15t manifest cache: refusing to send credentials over http to ${url.host} (${identityHeader}). Use https, or a loopback host for local development.`
		);
	}
};

const HASH_LANES = [31, 131, 16_777_619] as const;
const LANE_MODULUS = 4_294_967_296;

const hashLane = function hashLane(value: string, multiplier: number): string {
	let hash = 2_166_136_261 % LANE_MODULUS;
	for (let index = 0; index < value.length; index += 1) {
		hash =
			(((hash * multiplier) % LANE_MODULUS) + value.charCodeAt(index)) %
			LANE_MODULUS;
	}
	return hash.toString(16).padStart(8, '0');
};

const digest = async function digest(value: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (subtle) {
		const bytes = await subtle.digest(
			'SHA-256',
			new TextEncoder().encode(value)
		);
		return Array.from(new Uint8Array(bytes), (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
	}
	return HASH_LANES.map((multiplier) => hashLane(value, multiplier)).join('');
};

const defaultRequestHeaders = function defaultRequestHeaders(): Record<
	string,
	string
> {
	return { accept: 'application/json', ...c15tProtocolHeaders };
};

const buildCacheKey = async function buildCacheKey(
	requestURL: string,
	headers: Record<string, string> | undefined
): Promise<string> {
	const defaults = defaultRequestHeaders();
	const scope = Object.entries(headers ?? {})
		.map(([name, value]) => [name.toLowerCase(), value] as const)
		.filter(([name, value]) => defaults[name] !== value)
		.map(([name, value]) => `${name}=${value}`)
		.sort();
	if (scope.length === 0) {
		return requestURL;
	}
	return `${requestURL}#${await digest(scope.join('\n'))}`;
};

const revalidateManifest = async function revalidateManifest(input: {
	cache: ManifestCache;
	cacheKey: string;
	cached: CachedManifestResponse | undefined;
	fetchImpl: ManifestFetch;
	generation: number;
	init: FetchCachedManifestOptions['init'];
	headers: Record<string, string> | undefined;
	now: number;
	requestURL: string;
}): Promise<CachedManifestResponse> {
	const { cache, cacheKey, cached, fetchImpl, generation, now, requestURL } =
		input;
	const store = function store(entry: CachedManifestResponse): void {
		if (getGeneration(cache) === generation) {
			cache.set(cacheKey, entry);
			if (entry.expiresAt > now) {
				revalidateAfterByCache.get(cache)?.delete(cacheKey);
			}
		}
	};
	const headers: Record<string, string> = {
		...defaultRequestHeaders(),
		...input.headers,
	};
	if (cached?.headers.etag) {
		headers['if-none-match'] = cached.headers.etag;
	}

	const response = await fetchImpl(requestURL, {
		...input.init,
		headers,
		method: 'GET',
		redirect: findIdentityHeader(input.headers)
			? 'error'
			: input.init?.redirect,
	});

	if (response.status === 304 && cached) {
		const { age: _staleAge, ...retainedHeaders } = cached.headers;
		const responseHeaders = {
			...retainedHeaders,
			...normalizeHeaders(response.headers),
		};
		const sMaxAge = getManifestSMaxAge(responseHeaders['cache-control']);
		const upstreamAge = readUpstreamAge(responseHeaders);
		const { expiresAt, staleUntil } = resolveEntryLifetime({
			cacheControl: responseHeaders['cache-control'],
			now,
			sMaxAge,
			upstreamAge,
		});
		const refreshed: CachedManifestResponse = {
			...cached,
			expiresAt,
			fetchedAt: now,
			headers: responseHeaders,
			sMaxAge,
			staleUntil,
			upstreamAge,
		};
		if (staleUntil > now) {
			store(refreshed);
		} else if (getGeneration(cache) === generation) {
			cache.delete(cacheKey);
			revalidateAfterByCache.get(cache)?.delete(cacheKey);
		}
		return refreshed;
	}

	if (!response.ok) {
		throw await failedResponseError(
			'c15t manifest cache: backend /manifest',
			response
		);
	}

	const manifest = (await response.json()) as ConsentManifest;
	const responseHeaders = normalizeHeaders(response.headers);
	const sMaxAge = getManifestSMaxAge(responseHeaders['cache-control']);
	const upstreamAge = readUpstreamAge(responseHeaders);
	const { expiresAt, staleUntil } = resolveEntryLifetime({
		cacheControl: responseHeaders['cache-control'],
		now,
		sMaxAge,
		upstreamAge,
	});
	const entry: CachedManifestResponse = {
		expiresAt,
		fetchedAt: now,
		headers: responseHeaders,
		manifest,
		sMaxAge,
		staleUntil,
		upstreamAge,
	};
	if (staleUntil > now) {
		store(entry);
	} else if (getGeneration(cache) === generation) {
		cache.delete(cacheKey);
		revalidateAfterByCache.get(cache)?.delete(cacheKey);
	}
	return entry;
};

const settle = async function settle(task: Promise<unknown>): Promise<void> {
	try {
		await task;
	} catch {
	}
};

const raceTimer = async function raceTimer<Value>(
	task: Promise<Value>,
	ms: number,
	onTimeout: () => Error
): Promise<Value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			reject(onTimeout());
		}, ms);
	});
	try {
		return await Promise.race([task, expired]);
	} finally {
		clearTimeout(timer);
	}
};

const assertNotBackingOff = function assertNotBackingOff(
	cache: ManifestCache,
	cacheKey: string,
	now: number
): void {
	const failure = failuresByCache.get(cache)?.get(cacheKey);
	if (!failure || failure.retryAt <= now) {
		return;
	}
	const retryAfterMs = failure.retryAt - now;
	const what =
		failure.failures === 1 ? 'request' : `${failure.failures} requests`;
	throw new ManifestUnavailableError(
		'backoff',
		`c15t manifest cache: the last ${what} for this manifest failed; retrying in ${retryAfterMs} ms.`,
		{ cause: failure.error, retryAfterMs }
	);
};

const waitForFill = function waitForFill(
	fill: InflightFill,
	options: Pick<
		FetchCachedManifestOptions,
		'onBackgroundRevalidate' | 'timeoutMs'
	>
): Promise<CachedManifestResponse> {
	if (options.timeoutMs === undefined || !Number.isFinite(options.timeoutMs)) {
		return fill.promise;
	}
	const timeoutMs = Math.max(0, options.timeoutMs);
	const giveUp = function giveUp(): ManifestUnavailableError {
		const background = settle(fill.promise);
		if (options.onBackgroundRevalidate) {
			try {
				options.onBackgroundRevalidate(background);
			} catch {
			}
		}
		return new ManifestUnavailableError(
			'timeout',
			`c15t manifest cache: no manifest within ${timeoutMs} ms; the request continues in the background.`
		);
	};
	const remaining = fill.startedAt + timeoutMs - Date.now();
	if (remaining <= 0) {
		return Promise.reject(giveUp());
	}
	return raceTimer(fill.promise, remaining, giveUp);
};

export const withResolutionBudget = function withResolutionBudget<Value>(
	task: Promise<Value>,
	timeoutMs: number | undefined
): Promise<Value> {
	if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
		return task;
	}
	const budgetMs = Math.max(0, timeoutMs);
	return raceTimer(
		task,
		budgetMs,
		() =>
			new ManifestUnavailableError(
				'timeout',
				`c15t: consent resolution did not finish within ${budgetMs} ms.`
			)
	);
};

export const fetchCachedManifest = async function fetchCachedManifest(
	options: FetchCachedManifestOptions
): Promise<CachedManifestResponse> {
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!fetchImpl) {
		throw new Error('c15t manifest cache: a fetch implementation is required.');
	}

	const cache = options.cache ?? defaultManifestCache;
	const requestURL = createManifestFetchURL(options);
	assertCredentialTransport(requestURL, options.headers);
	const generation = getGeneration(cache);
	const cacheKey = await buildCacheKey(
		createManifestRequestURL(options),
		options.headers
	);
	if (getGeneration(cache) !== generation) {
		return fetchCachedManifest(options);
	}
	const now = options.now ?? Date.now();
	const cached = cache.get(cacheKey);
	if (!cached) {
		revalidateAfterByCache.get(cache)?.delete(cacheKey);
	} else if (cached.expiresAt > now) {
		return cached;
	}

	const inflight = getInflight(cache);
	const pending = inflight.get(cacheKey);
	const startFill = function startFill(background = false): InflightFill {
		const callerSignal = background ? undefined : options.init?.signal;
		const controller = callerSignal ? undefined : new AbortController();
		const timeout = controller
			? setTimeout(() => {
					controller.abort(
						new Error(
							`c15t manifest cache: fetch timed out after ${MANIFEST_FETCH_TIMEOUT_MS} ms.`
						)
					);
				}, MANIFEST_FETCH_TIMEOUT_MS)
			: undefined;
		const startedAt = Date.now();
		const request = (async () => {
			try {
				const entry = await revalidateManifest({
					cache,
					cacheKey,
					cached,
					fetchImpl,
					generation,
					headers: options.headers,
					init: controller
						? { ...options.init, signal: controller.signal }
						: options.init,
					now,
					requestURL,
				});
				if (getGeneration(cache) === generation) {
					failuresByCache.get(cache)?.delete(cacheKey);
				}
				return entry;
			} catch (error) {
				if (
					!background &&
					!callerSignal?.aborted &&
					getGeneration(cache) === generation
				) {
					recordFillFailure(
						cache,
						cacheKey,
						error,
						now + (Date.now() - startedAt)
					);
				}
				throw error;
			} finally {
				clearTimeout(timeout);
				if (getGeneration(cache) === generation) {
					inflight.delete(cacheKey);
				}
			}
		})();
		const fill: InflightFill = { promise: request, startedAt };
		inflight.set(cacheKey, fill);
		return fill;
	};

	if (cached && cached.staleUntil > now) {
		const revalidateAfter = getRevalidateAfter(cache);
		if (!pending && (revalidateAfter.get(cacheKey) ?? 0) <= now) {
			setRevalidationFloor(cache, cacheKey, Number.POSITIVE_INFINITY);
			const revalidation = (async () => {
				const startedAt = Date.now();
				let replacement: CachedManifestResponse | undefined;
				try {
					replacement = await startFill(true).promise;
				} catch {
				} finally {
					if (getGeneration(cache) === generation) {
						const settledAt = now + (Date.now() - startedAt);
						if (replacement && replacement.expiresAt > settledAt) {
							revalidateAfter.delete(cacheKey);
						} else {
							setRevalidationFloor(
								cache,
								cacheKey,
								settledAt + MANIFEST_DEDUPE_TTL_SECONDS * 1000
							);
						}
					}
				}
			})();
			if (options.onBackgroundRevalidate) {
				try {
					options.onBackgroundRevalidate(revalidation);
				} catch {
				}
			}
		}
		return cached;
	}

	if (pending) {
		return waitForFill(pending, options);
	}
	assertNotBackingOff(cache, cacheKey, now);
	return waitForFill(startFill(), options);
};

export const DEFAULT_RESOLVE_TIMEOUT_MS = 500;
