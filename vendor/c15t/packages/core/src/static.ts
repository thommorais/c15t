import type {
	ConsentManifest,
	InitOutput,
	ResolveInitFromManifestInputs,
} from '@c15t/schema/types';
import { resolveInitFromManifest } from '@c15t/schema/types';
import { baseTranslations } from '@c15t/translations/all';

export type { ConsentManifest } from '@c15t/schema/types';

export interface StaticGeoResult {
	country?: string | null;
	countryCode?: string | null;
	region?: string | null;
	regionCode?: string | null;
}

export interface StaticConsentResolverOptions {
	manifest: ConsentManifest;

	geo?: StaticGeoResult | null;

	geoURL?: string;

	language?: string;

	gpc?: boolean;

	fetch?: typeof globalThis.fetch;
}

export interface StaticConsentResolution {
	initial: InitOutput;

	resolved: Promise<InitOutput>;
}

type LocationFreeInputs = Omit<
	ResolveInitFromManifestInputs,
	'country' | 'region'
>;

const readBrowserLanguage = function readBrowserLanguage(): string | undefined {
	if (typeof navigator === 'undefined') {
		return undefined;
	}
	return navigator.languages?.[0] ?? navigator.language;
};

const readBrowserGpc = function readBrowserGpc(): boolean | undefined {
	if (typeof navigator === 'undefined') {
		return undefined;
	}
	return (
		(navigator as Navigator & { globalPrivacyControl?: unknown })
			.globalPrivacyControl === true
	);
};

const readGeoField = function readGeoField(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const normalizeGeo = function normalizeGeo(
	geo: StaticGeoResult | null | undefined
): Pick<ResolveInitFromManifestInputs, 'country' | 'region'> {
	return {
		country: readGeoField(geo?.country) ?? readGeoField(geo?.countryCode),
		region: readGeoField(geo?.region) ?? readGeoField(geo?.regionCode),
	};
};

const fetchStaticGeo = async function fetchStaticGeo(
	geoURL: string,
	fetchImpl: typeof globalThis.fetch
): Promise<StaticGeoResult | null> {
	const response = await fetchImpl(geoURL, {
		headers: { accept: 'application/json' },
		method: 'GET',
	});
	if (!response.ok) {
		return null;
	}
	return (await response.json()) as StaticGeoResult;
};

export const resolveUnknownLocationInit = function resolveUnknownLocationInit(
	manifest: ConsentManifest,
	inputs: LocationFreeInputs = {}
): InitOutput {
	return resolveInitFromManifest(
		manifest,
		{ ...inputs, country: null, region: null },
		{ baseTranslations }
	);
};

export const createStaticConsentResolver = function createStaticConsentResolver(
	options: StaticConsentResolverOptions
): StaticConsentResolution {
	const language = options.language ?? readBrowserLanguage() ?? 'en';
	const gpc = options.gpc ?? readBrowserGpc();
	const commonInputs = { gpc, language };
	const initialGeo = normalizeGeo(options.geo);
	const hasGeo = Boolean(initialGeo.country || initialGeo.region);
	const initial = hasGeo
		? resolveInitFromManifest(
				options.manifest,
				{ ...commonInputs, ...initialGeo },
				{ baseTranslations }
			)
		: resolveUnknownLocationInit(options.manifest, commonInputs);

	return {
		initial,
		resolved: (async () => {
			if (hasGeo || !options.geoURL) {
				return initial;
			}
			const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
			if (!fetchImpl) {
				return initial;
			}
			const geo = await fetchStaticGeo(options.geoURL, fetchImpl).catch(
				() => null
			);
			const resolvedGeo = normalizeGeo(geo);
			if (!resolvedGeo.country && !resolvedGeo.region) {
				return initial;
			}
			return resolveInitFromManifest(
				options.manifest,
				{ ...commonInputs, ...resolvedGeo },
				{ baseTranslations }
			);
		})(),
	};
};
