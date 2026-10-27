import type { ConsentManifest, InitOutput } from '@c15t/schema/types';

import {
	fetchCachedAdTechProviders,
	loadManifestAdTechProviders,
} from './ad-tech-provider-cache';
import { fetchCachedGvl } from './gvl-cache';

export const attachVendorList = async function attachVendorList(
	output: InitOutput,
	manifest: ConsentManifest,
	fetchImpl: typeof globalThis.fetch
): Promise<void> {
	const providers = loadManifestAdTechProviders(manifest, output, (reference) =>
		fetchCachedAdTechProviders({ fetch: fetchImpl, reference })
	);
	if (
		manifest.iab?.gvl &&
		output.policyResolution?.status === 'matched' &&
		output.policyResolution.policy.model === 'iab'
	) {
		output.gvl = await fetchCachedGvl({
			fetch: fetchImpl,
			label: 'c15t manifest transport',
			language: output.translations.language.split('-')[0] || 'en',
			url: manifest.iab.gvl.url,
		});
	}
	const adTechProviders = await providers;
	if (adTechProviders) {
		output.adTechProviders = adTechProviders;
	}
};
