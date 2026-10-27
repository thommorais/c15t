import {
	consentInputsToOverrides,
	extractConsentRequestInputs,
	resolveInitFromManifest,
} from '@c15t/schema/types';
import type {
	ConsentManifest,
	InitOutput,
	ResolveInitFromManifestInputs,
} from '@c15t/schema/types';
import { baseTranslations } from '@c15t/translations/all';

export {
	DEFAULT_RESOLVE_TIMEOUT_MS,
	withResolutionBudget,
} from '../libs/manifest-cache-runtime';
export type ManifestRequestHeaders =
	| Headers
	| Record<string, string | string[] | undefined>;

const normalizeHeader = function normalizeHeader(
	value: string | string[] | undefined
): string | undefined {
	if (!value) {
		return undefined;
	}
	return Array.isArray(value) ? value[0] : value;
};

export const getResolverInputsFromHeaders =
	function getResolverInputsFromHeaders(
		headers: ManifestRequestHeaders
	): ResolveInitFromManifestInputs {
		let source: Headers | Record<string, string | undefined>;
		if (headers instanceof Headers) {
			source = headers;
		} else {
			const normalized: Record<string, string | undefined> = {};
			for (const [key, value] of Object.entries(headers)) {
				normalized[key.toLowerCase()] = normalizeHeader(value);
			}
			source = normalized;
		}
		const inputs = extractConsentRequestInputs(source);

		return {
			country: inputs.country,
			gpc: inputs.gpc,
			language: inputs.language ?? 'en',
			region: inputs.region,
		};
	};

export type ResolveManifestInitOptions =
	| {
			manifest: ConsentManifest;
			headers: ManifestRequestHeaders;
			inputs?: never;
	  }
	| {
			manifest: ConsentManifest;
			inputs: ResolveInitFromManifestInputs;
			headers?: never;
	  };

export const resolveManifestInit = function resolveManifestInit(
	options: ResolveManifestInitOptions
): InitOutput {
	const inputs =
		options.inputs ?? getResolverInputsFromHeaders(options.headers);
	return {
		...resolveInitFromManifest(options.manifest, inputs, { baseTranslations }),
		resolvedOverrides: consentInputsToOverrides({
			country: inputs.country ?? undefined,
			language: inputs.language ?? undefined,
			region: inputs.region ?? undefined,
		}),
		resolvedPrivacySignals: { gpc: inputs.gpc },
	} as InitOutput;
};
