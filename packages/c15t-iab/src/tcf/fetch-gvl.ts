import type { GlobalVendorList } from '@c15t/core';

import { GVL_ENDPOINT } from './constants';

const MAX_GVL_QUERY_VENDOR_IDS = 500;

const inflightRequests = new Map<string, Promise<GlobalVendorList | null>>();

let cachedGVL: GlobalVendorList | null | undefined = undefined;

let mockGVLData: GlobalVendorList | null | undefined = undefined;

export const narrowGVLToVendors = function narrowGVLToVendors(
	gvl: GlobalVendorList,
	vendorIds: readonly number[]
): GlobalVendorList {
	if (vendorIds.length === 0) {
		return gvl;
	}
	const allowed = new Set(vendorIds.map(String));
	const vendors: GlobalVendorList['vendors'] = {};
	for (const [id, vendor] of Object.entries(gvl.vendors)) {
		if (allowed.has(id)) {
			vendors[id] = vendor;
		}
	}
	return { ...gvl, vendors };
};

export const fetchGVL = function fetchGVL(
	vendorIds?: number[],
	options: { endpoint?: string; headers?: HeadersInit; format?: 'init' } = {}
): Promise<GlobalVendorList | null> {
	const windowMockGVL =
		typeof window === 'undefined'
			? undefined
			: (window as unknown as { __c15t_mock_gvl?: GlobalVendorList | null })
					.__c15t_mock_gvl;

	if (windowMockGVL !== undefined) {
		cachedGVL = windowMockGVL;
		return Promise.resolve(windowMockGVL);
	}

	if (mockGVLData !== undefined) {
		cachedGVL = mockGVLData;
		return Promise.resolve(mockGVLData);
	}

	const { endpoint = GVL_ENDPOINT, headers } = options;

	const sortedVendorIds = vendorIds ? [...vendorIds].sort((a, b) => a - b) : [];
	const headersKey = headers ? JSON.stringify(headers) : '';
	const cacheKey = `${endpoint}|${sortedVendorIds.join(',')}|${headersKey}|${options.format ?? 'gvl'}`;

	const existingRequest = inflightRequests.get(cacheKey);
	if (existingRequest) {
		return existingRequest;
	}

	const url = new URL(
		endpoint,
		typeof window === 'undefined' ? undefined : window.location.href
	);
	if (
		sortedVendorIds.length > 0 &&
		sortedVendorIds.length <= MAX_GVL_QUERY_VENDOR_IDS
	) {
		url.searchParams.set('vendorIds', sortedVendorIds.join(','));
	}

	const promise = (async () => {
		try {
			const response = await fetch(url.toString(), {
				headers,
			});

			if (response.status === 204) {
				cachedGVL = null;
				return null;
			}

			if (!response.ok) {
				throw new Error(
					`Failed to fetch GVL: ${response.status} ${response.statusText}`
				);
			}

			let payload: unknown = await response.json();
			if (options.format === 'init') {
				payload =
					payload && typeof payload === 'object' && 'gvl' in payload
						? payload.gvl
						: null;
			}
			const gvl = payload as GlobalVendorList;
			if (!gvl) {
				return null;
			}

			if (
				!gvl.vendorListVersion ||
				!gvl.purposes ||
				!gvl.vendors ||
				!Number.isSafeInteger(gvl.tcfPolicyVersion) ||
				gvl.tcfPolicyVersion < 1
			) {
				throw new Error('Invalid GVL response: missing required fields');
			}

			cachedGVL = gvl;

			return gvl;
		} finally {
			inflightRequests.delete(cacheKey);
		}
	})();

	inflightRequests.set(cacheKey, promise);

	return promise;
};

export const getCachedGVL = function getCachedGVL():
	| GlobalVendorList
	| null
	| undefined {
	return cachedGVL;
};

export const clearGVLCache = function clearGVLCache(): void {
	inflightRequests.clear();
	cachedGVL = undefined;
	mockGVLData = undefined;
};

export const setMockGVL = function setMockGVL(
	gvl: GlobalVendorList | null | undefined
): void {
	mockGVLData = gvl;
	if (gvl !== undefined) {
		cachedGVL = gvl;
	}
};

export const getMockGVL = function getMockGVL():
	| GlobalVendorList
	| null
	| undefined {
	return mockGVLData;
};
