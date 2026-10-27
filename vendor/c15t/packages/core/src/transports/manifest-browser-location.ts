import { resolvePolicyResolutionFromManifest } from '@c15t/schema/types';
import type { ConsentManifest, PolicyResolution } from '@c15t/schema/types';

import { experienceKey, hasLocationMatchers } from './manifest-browser-packs';

const UNLISTED_REGION = '?';

const representativeLocations = function representativeLocations(
	manifest: ConsentManifest
): { countryCode: string | null; regionCode: string | null }[] {
	const countries = new Set<string>();
	const locations: { countryCode: string | null; regionCode: string | null }[] =
		[{ countryCode: null, regionCode: null }];
	for (const { match } of manifest.policyPacks ?? []) {
		for (const country of [
			...(match.countries ?? []),
			...(match.regionFallbacks ?? []),
		]) {
			countries.add(country.trim().toUpperCase());
		}
		for (const { country, region } of match.regions ?? []) {
			countries.add(country.trim().toUpperCase());
			locations.push({ countryCode: country, regionCode: region });
		}
	}
	for (const country of countries) {
		locations.push(
			{ countryCode: country, regionCode: null },
			{ countryCode: country, regionCode: UNLISTED_REGION }
		);
	}
	let unlisted = 'ZZ';
	while (countries.has(unlisted)) {
		unlisted += 'Z';
	}
	locations.push({ countryCode: unlisted, regionCode: null });
	return locations;
};

export type MatchedResolution = Extract<
	PolicyResolution,
	{ status: 'matched' }
>;

const locationFreeOutcomes = new WeakMap<
	ConsentManifest,
	MatchedResolution | null
>();

export const locationFreeOutcome = function locationFreeOutcome(
	manifest: ConsentManifest
): MatchedResolution | null {
	if (locationFreeOutcomes.has(manifest)) {
		return locationFreeOutcomes.get(manifest) ?? null;
	}
	let outcome: MatchedResolution | null = null;
	let key: string | undefined;
	let locations: ReturnType<typeof representativeLocations> = [];
	try {
		locations = representativeLocations(manifest);
	} catch {
	}
	for (const location of locations) {
		const resolution = resolvePolicyResolutionFromManifest(manifest, location);
		if (resolution.status !== 'matched') {
			outcome = null;
			break;
		}
		const next = experienceKey({
			fingerprints: resolution.fingerprints,
			rule: resolution.policy,
		});
		if (key !== undefined && next !== key) {
			outcome = null;
			break;
		}
		key = next;
		outcome = resolution;
	}
	locationFreeOutcomes.set(manifest, outcome);
	return outcome;
};

export const manifestNeedsLocation = function manifestNeedsLocation(
	manifest: ConsentManifest
): boolean {
	return (
		hasLocationMatchers(manifest) && locationFreeOutcome(manifest) === null
	);
};
