import type {
	ConsentManifest,
	ConsentManifestPolicyPack,
} from '@c15t/schema/types';

export const hasLocationMatchers = function hasLocationMatchers(
	manifest: ConsentManifest
): boolean {
	return (manifest.policyPacks ?? []).some(
		(pack) =>
			(pack.match.countries?.length ?? 0) > 0 ||
			(pack.match.regions?.length ?? 0) > 0 ||
			(pack.match.regionFallbacks?.length ?? 0) > 0
	);
};

export const experienceKey = function experienceKey({
	fingerprints,
	rule,
}: Pick<ConsentManifestPolicyPack, 'fingerprints' | 'rule'>): string {
	return JSON.stringify([
		fingerprints.policy,
		fingerprints.choice,
		fingerprints.notice,
		fingerprints.legacyMaterial ?? null,
		rule.i18n ?? null,
	]);
};

export const mayBeLocationFree = function mayBeLocationFree(
	manifest: ConsentManifest
): boolean {
	const packs = manifest.policyPacks ?? [];
	const key = packs[0] && experienceKey(packs[0]);
	return (
		packs.some((pack) => pack.match.isDefault === true) &&
		packs.every((pack) => experienceKey(pack) === key)
	);
};
