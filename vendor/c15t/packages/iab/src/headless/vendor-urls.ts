import type { GlobalVendorList } from '@c15t/core';

type GvlVendor = GlobalVendorList['vendors'][number];

export interface IABVendorUrls {
	policyUrl: string;
	legitimateInterestUrl: string | null;
}

export const resolveIABVendorUrls = function resolveIABVendorUrls(
	vendor: GvlVendor,
	language?: string
): IABVendorUrls {
	const wanted = (language ?? 'en').toLowerCase();
	const [wantedBase] = wanted.split('-');
	const rank = (langId: string): number => {
		const lang = langId.toLowerCase();
		if (lang === wanted) {
			return 0;
		}
		if (lang === wantedBase) {
			return 1;
		}
		return lang === 'en' ? 2 : 3;
	};
	const urls = [...(vendor.urls ?? [])].sort(
		(left, right) => rank(left.langId) - rank(right.langId)
	);
	const legacy = (vendor as { policyUrl?: unknown }).policyUrl;
	return {
		legitimateInterestUrl:
			urls.find((url) => url.legIntClaim)?.legIntClaim ?? null,
		policyUrl:
			urls.find((url) => url.privacy)?.privacy ??
			(typeof legacy === 'string' ? legacy : ''),
	};
};
