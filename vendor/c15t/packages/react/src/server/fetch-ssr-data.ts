import { C15T_VERSION_HEADER } from '@c15t/core';
import type { InitOutput, SSRInitialData } from '@c15t/core';

import { version } from '../version';
import { CLIENT_FORWARDING_HEADERS, extractRelevantHeaders } from './headers';
import { normalizeBackendURL } from './normalize-url';
import type { FetchSSRDataOptions } from './types';

interface SSRFetchResult {
	init?: InitOutput;
	metadata?: SSRInitialData['metadata'];
}

const buildRequestContext = function buildRequestContext(options: {
	backendURL: string;
	headers: Record<string, string>;
	overrides?: FetchSSRDataOptions['overrides'];
}): NonNullable<SSRInitialData['metadata']>['requestContext'] {
	return {
		backendURL: options.backendURL,
		country:
			options.overrides?.country ?? options.headers['x-c15t-country'] ?? null,
		gpc: options.headers['sec-gpc'] === '1',
		language:
			options.overrides?.language ?? options.headers['accept-language'] ?? null,
		region:
			options.overrides?.region ?? options.headers['x-c15t-region'] ?? null,
	};
};

const getNowMs = function getNowMs(): number {
	if (
		typeof performance !== 'undefined' &&
		typeof performance.now === 'function'
	) {
		return performance.now();
	}
	return Date.now();
};

const inspectCacheHeaders = function inspectCacheHeaders(headers: Headers): {
	isHit: boolean;
	detail: string | null;
} {
	const cacheHeaders = [
		'x-vercel-cache',
		'cf-cache-status',
		'x-cache',
		'cache-status',
	] as const;

	let headerDetail: string | null = null;
	let headerIndicatesHit = false;

	for (const headerName of cacheHeaders) {
		const headerValue = headers.get(headerName);
		if (!headerValue) {
			continue;
		}

		headerDetail = `${headerName}=${headerValue}`;
		headerIndicatesHit = /\b(?:hit|stale|revalidated|updating)\b/iu.test(
			headerValue
		);
		break;
	}

	const ageHeader = headers.get('age');
	const ageValue = ageHeader ? Number.parseInt(ageHeader, 10) : Number.NaN;
	const ageIndicatesCache = Number.isFinite(ageValue) && ageValue > 0;
	const ageDetail = ageIndicatesCache ? `age=${ageValue}` : null;
	const detail =
		headerDetail && ageDetail
			? `${headerDetail}, ${ageDetail}`
			: (headerDetail ?? ageDetail);

	return {
		detail,
		isHit: headerIndicatesHit || ageIndicatesCache,
	};
};

const logRelevantHeaders = function logRelevantHeaders(
	relevantHeaders: Record<string, string>,
	debug?: boolean
): void {
	if (!debug) {
		return;
	}
	const headerKeys = Object.keys(relevantHeaders);
	console.log(`[c15t/server] Detected headers: [${headerKeys.join(', ')}]`);
	const cfCountry = relevantHeaders['cf-ipcountry'];
	const xCountry = relevantHeaders['x-vercel-ip-country'];
	if (cfCountry) {
		console.log(`[c15t/server] Country from cf-ipcountry: ${cfCountry}`);
	} else if (xCountry) {
		console.log(`[c15t/server] Country from x-vercel-ip-country: ${xCountry}`);
	}
};

const performInitFetch = async function performInitFetch(
	normalizedURL: string,
	relevantHeaders: Record<string, string>,
	requestContext: NonNullable<SSRInitialData['metadata']>['requestContext'],
	debug?: boolean
): Promise<SSRFetchResult> {
	const startTime = getNowMs();

	try {
		const response = await fetch(`${normalizedURL}/init`, {
			cache: 'no-store',
			headers: relevantHeaders,
			method: 'GET',
		});
		const requestDurationMs = Math.max(0, Math.round(getNowMs() - startTime));
		const cache = inspectCacheHeaders(response.headers);
		const metadata: SSRInitialData['metadata'] = {
			cache,
			requestContext,
			requestDurationMs,
		};

		if (response.ok) {
			const init = await response.json();
			const result: SSRFetchResult = {
				init: init as InitOutput,
				metadata,
			};
			if (debug) {
				console.log(
					`[c15t/server] SSR fetch succeeded in ${result.metadata?.requestDurationMs ?? 0}ms`
				);
				if (result.metadata?.cache?.detail) {
					console.log(
						`[c15t/server] SSR cache status: ${result.metadata.cache.detail}`
					);
				}
			}
			return result;
		}
		if (debug) {
			console.log(
				`[c15t/server] SSR fetch failed with status: ${response.status}`
			);
			if (cache.detail) {
				console.log(`[c15t/server] SSR cache status: ${cache.detail}`);
			}
		}
		return { metadata };
	} catch (error) {
		if (debug) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.log(`[c15t/server] SSR fetch error: ${message}`);
		}
		return {};
	}
};

export const fetchSSRData = async function fetchSSRData(
	options: FetchSSRDataOptions
): Promise<SSRInitialData | undefined> {
	const { backendURL, headers, overrides, debug } = options;

	if (debug) {
		console.log('[c15t/server] SSR fetch starting...');
	}

	const relevantHeaders = extractRelevantHeaders(headers, {
		trustForwardedHeaders: options.trustForwardedHeaders,
	});

	logRelevantHeaders(relevantHeaders, debug);

	const hasRequestHeaders =
		Object.keys(relevantHeaders).length > 0 ||
		CLIENT_FORWARDING_HEADERS.some((name) => headers.has(name));
	if (!hasRequestHeaders) {
		if (debug) {
			console.log(
				'[c15t/server] No relevant headers found, skipping SSR fetch'
			);
		}
		return undefined;
	}

	const normalizedURL = normalizeBackendURL(backendURL, headers, {
		trustForwardedHeaders: options.trustForwardedHeaders,
	});
	if (!normalizedURL) {
		if (debug) {
			console.log('[c15t/server] Failed to normalize URL, skipping SSR fetch');
		}
		return undefined;
	}

	if (debug) {
		console.log(`[c15t/server] Fetching from: ${normalizedURL}/init`);
	}

	const initHeaders = { [C15T_VERSION_HEADER]: version, ...relevantHeaders };
	if (overrides?.country) {
		initHeaders['x-c15t-country'] = overrides.country;
		if (debug) {
			console.log(`[c15t/server] Country override: ${overrides.country}`);
		}
	}
	if (overrides?.region) {
		initHeaders['x-c15t-region'] = overrides.region;
		if (debug) {
			console.log(`[c15t/server] Region override: ${overrides.region}`);
		}
	}
	if (overrides?.language) {
		initHeaders['accept-language'] = overrides.language;
		if (debug) {
			console.log(`[c15t/server] Language override: ${overrides.language}`);
		}
	}

	const initResult = await performInitFetch(
		normalizedURL,
		initHeaders,
		buildRequestContext({
			backendURL: normalizedURL,
			headers: initHeaders,
			overrides,
		}),
		debug
	);
	const { init } = initResult;

	if (!init) {
		if (debug) {
			console.log('[c15t/server] SSR fetch returned no data');
		}
		return undefined;
	}

	return { gvl: init.gvl, init, metadata: initResult.metadata };
};
