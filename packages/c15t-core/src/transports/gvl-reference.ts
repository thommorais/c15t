import { extractConsentRequestInputs } from '@c15t/schema/types';
import type {
	AdTechProvider,
	GlobalVendorList,
	InitOutput,
} from '@c15t/schema/types';

import { resolveIABBannerSummary } from '../libs/iab-banner-summary';

const normalizeLanguage = (language?: string): string =>
	language?.split('-')[0]?.toLowerCase() || 'en';

export const deferInitGvl = <
	Payload extends {
		gvl?: GlobalVendorList | null;
		translations?: { language: string } | null;
		location?: { countryCode?: string | null; regionCode?: string | null };
		resolvedPrivacySignals?: { gpc?: boolean };
		adTechProviders?: AdTechProvider[];
	},
>(
	payload: Payload,
	url: string,
	format?: 'init',
	requestHeaders?: HeadersInit
): Omit<Payload, 'gvl'> & {
	gvl?: GlobalVendorList | null;
	gvlReference?: InitOutput['gvlReference'];
} => {
	if (
		!payload.gvl?.vendors ||
		!payload.gvl.purposes ||
		!payload.gvl.vendorListVersion
	) {
		return payload;
	}
	const inputs =
		format === 'init'
			? extractConsentRequestInputs(new Headers(requestHeaders))
			: undefined;
	const summary = resolveIABBannerSummary(
		{
			adTechProviders: payload.adTechProviders,
			gvl: payload.gvl,
		},
		{ maxItems: Number.POSITIVE_INFINITY }
	);
	return {
		...payload,
		gvl: null,
		gvlReference: {
			context: inputs
				? {
						country: payload.location?.countryCode ?? inputs.country,
						gpc: payload.resolvedPrivacySignals?.gpc ?? inputs.gpc,
						region: payload.location?.regionCode ?? inputs.region,
					}
				: undefined,
			format,
			language: normalizeLanguage(payload.translations?.language),
			summary: {
				items: summary.displayItems,
				vendorCount: Object.keys(payload.gvl.vendors).length,
			},
			url,
			vendorListVersion: payload.gvl.vendorListVersion,
		},
	};
};

export const createGvlReferenceURL = (
	initURL: string,
	gvl: GlobalVendorList,
	language: string
): string => {
	const url = new URL(initURL, 'http://c15t.local');
	url.searchParams.set('c15t-gvl', String(gvl.vendorListVersion));
	url.searchParams.set('language', normalizeLanguage(language));
	return initURL.startsWith('/') ? `${url.pathname}${url.search}` : url.href;
};

export const serveGvlReference = async (
	request: Request,
	load: (language: string) => Promise<GlobalVendorList | null>
): Promise<Response | null> => {
	const url = new URL(request.url);
	const version = url.searchParams.get('c15t-gvl');
	if (version === null) {
		return null;
	}
	const language = url.searchParams.get('language') ?? 'en';
	if (!/^\d+$/u.test(version) || !/^[a-z]{2,3}$/u.test(language)) {
		return new Response(null, { status: 400 });
	}
	const gvl = await load(language);
	if (!gvl || gvl.vendorListVersion !== Number(version)) {
		return new Response(null, {
			headers: { 'cache-control': 'no-store' },
			status: 409,
		});
	}
	return Response.json(gvl, {
		headers: { 'cache-control': 'public, max-age=86400' },
	});
};

export const deferInitGvlToRoute = (
	payload: InitOutput,
	route: string
): InitOutput =>
	payload.gvl
		? deferInitGvl(
				payload,
				createGvlReferenceURL(
					route,
					payload.gvl,
					normalizeLanguage(payload.translations?.language)
				)
			)
		: payload;
