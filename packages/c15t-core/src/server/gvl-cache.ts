import type { GlobalVendorList } from '@c15t/schema/types';

import type { ManifestFetch } from '../libs/manifest-cache-runtime';
import {
	clearGvlCache as clearDefaultGvlCache,
	fetchCachedGvl as fetchThroughGvlCache,
} from '../transports/gvl-cache';

export const GVL_FETCH_TIMEOUT_MS = 5000;

export interface FetchCachedGvlOptions {
	url: string;
	language: string;
	fetch?: ManifestFetch;
	headers?: Record<string, string>;
	label?: string;
	now?: number;
}

const withDeadline = function withDeadline(
	fetchImpl: ManifestFetch
): typeof globalThis.fetch {
	return ((input: string | URL | Request, init?: RequestInit) =>
		fetchImpl(
			input,
			typeof AbortSignal.timeout === 'function'
				? { ...init, signal: AbortSignal.timeout(GVL_FETCH_TIMEOUT_MS) }
				: init
		)) as typeof globalThis.fetch;
};

export const fetchCachedGvl = function fetchCachedGvl(
	input: FetchCachedGvlOptions
): Promise<GlobalVendorList | null> {
	const fetchImpl = input.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!fetchImpl) {
		return Promise.reject(
			new Error('@c15t/core/server: no fetch implementation available.')
		);
	}
	return fetchThroughGvlCache({
		...input,
		fetch: withDeadline(fetchImpl),
		label: input.label ?? '@c15t/core/server',
	});
};

export const clearGvlCache = function clearGvlCache(): void {
	clearDefaultGvlCache();
};
