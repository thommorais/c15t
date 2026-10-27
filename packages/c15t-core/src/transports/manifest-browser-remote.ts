import type { ConsentManifest } from '@c15t/schema/types';

import { failedResponseError } from '../libs/failed-response';
import type { ManifestModeInputs } from '../modes';
import { createManifestRequestInit } from './manifest-request';

export const fetchManifest = async function fetchManifest(
	manifestURL: string,
	fetchImpl: typeof globalThis.fetch,
	options: {
		credentials?: RequestCredentials;
		headers?: Record<string, string>;
	}
): Promise<ConsentManifest> {
	const response = await fetchImpl(
		manifestURL,
		createManifestRequestInit(options)
	);
	if (!response.ok) {
		throw await failedResponseError(
			'c15t manifest transport: /manifest',
			response
		);
	}
	return (await response.json()) as ConsentManifest;
};

const normalizeGeoValue = function normalizeGeoValue(
	value: unknown
): string | undefined {
	return typeof value === 'string' && value.trim()
		? value.trim().toUpperCase()
		: undefined;
};

export const fetchGeoInputs = async function fetchGeoInputs(
	geoURL: string,
	fetchImpl: typeof globalThis.fetch
): Promise<ManifestModeInputs | undefined> {
	try {
		const response = await fetchImpl(geoURL, {
			credentials: 'same-origin',
			headers: { accept: 'application/json' },
			method: 'GET',
		});
		if (!response.ok) {
			return undefined;
		}
		const payload = (await response.json()) as {
			country?: unknown;
			region?: unknown;
		};
		return {
			country: normalizeGeoValue(payload.country),
			region: normalizeGeoValue(payload.region),
		};
	} catch {
		return undefined;
	}
};
