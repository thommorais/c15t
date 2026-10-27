import type { AllConsentNames, ConsentSnapshot } from '@c15t/core';

import type { USSectionValues } from './encoder';
import { US_NATIONAL_SECTION, US_STATE_SECTIONS } from './sections';
import type { USSectionDefinition } from './sections';

export type GPPUSApproach = 'state' | 'national';

export type GPPUSFallback = 'usnat' | 'none';

export type GPPMspaMode = 'opt-out-option' | 'service-provider';

export interface USSectionOptions {
	mspaMode?: GPPMspaMode;
	optOutCategories: readonly AllConsentNames[];
}

const OPT_OUT_NOTICES = new Set([
	'SaleOptOutNotice',
	'SharingOptOutNotice',
	'TargetedAdvertisingOptOutNotice',
]);

const OPT_OUTS = new Set([
	'SaleOptOut',
	'SharingOptOut',
	'TargetedAdvertisingOptOut',
]);

const GENERAL_NOTICES = new Set(['SharingNotice', 'ProcessingNotice']);

const yesNo = (value: boolean): number => (value ? 1 : 2);

export const resolveUSState = function resolveUSState(
	snapshot: Pick<ConsentSnapshot, 'location' | 'overrides'>
): { country: string | null; region: string | null } {
	const country =
		snapshot.overrides.country ?? snapshot.location?.countryCode ?? null;
	const rawRegion =
		snapshot.overrides.region ?? snapshot.location?.regionCode ?? null;
	const upperCountry = country?.toUpperCase() ?? null;
	let region = rawRegion?.toUpperCase() ?? null;
	if (region && upperCountry && region.startsWith(`${upperCountry}-`)) {
		region = region.slice(upperCountry.length + 1);
	}
	return { country: upperCountry, region };
};

export type USSectionSnapshot = Pick<
	ConsentSnapshot,
	| 'effectivePermissions'
	| 'location'
	| 'overrides'
	| 'policyRule'
	| 'privacySignals'
>;

const callsForUSSection = (rule: USSectionSnapshot['policyRule']): boolean =>
	rule.model !== 'iab' &&
	(rule.rights.includes('preferences') || rule.rights.includes('opt-out'));

export const resolveUSSectionDefinition = function resolveUSSectionDefinition(
	snapshot: Pick<USSectionSnapshot, 'location' | 'overrides' | 'policyRule'>,
	approach: GPPUSApproach,
	fallback: GPPUSFallback = 'usnat'
): USSectionDefinition | null {
	const { country, region } = resolveUSState(snapshot);
	if (country !== 'US' || !callsForUSSection(snapshot.policyRule)) {
		return null;
	}
	if (approach === 'national') {
		return US_NATIONAL_SECTION;
	}
	const state = region ? US_STATE_SECTIONS[region] : undefined;
	if (state) {
		return state;
	}
	return fallback === 'usnat' ? US_NATIONAL_SECTION : null;
};

export const resolveUSSectionValues = function resolveUSSectionValues(
	definition: USSectionDefinition,
	snapshot: Pick<
		USSectionSnapshot,
		'effectivePermissions' | 'policyRule' | 'privacySignals'
	>,
	options: USSectionOptions
): USSectionValues {
	const disclosed = snapshot.policyRule.rights.includes('disclosure');
	const optedOut = options.optOutCategories.some(
		(category) => snapshot.effectivePermissions[category] !== true
	);
	const covered = options.mspaMode !== undefined;
	const serviceProvider = options.mspaMode === 'service-provider';
	const core: USSectionValues['core'] = {};
	for (const [name, , count] of definition.core) {
		if (count !== undefined) {
			core[name] = Array.from({ length: count }, () => 0);
		} else if (name === 'Version') {
			core[name] = definition.version;
		} else if (GENERAL_NOTICES.has(name)) {
			core[name] = yesNo(disclosed);
		} else if (OPT_OUT_NOTICES.has(name)) {
			core[name] = serviceProvider ? 0 : 1;
		} else if (OPT_OUTS.has(name)) {
			core[name] = serviceProvider ? 0 : yesNo(optedOut);
		} else if (name === 'MspaCoveredTransaction') {
			core[name] = yesNo(covered);
		} else if (name === 'MspaOptOutOptionMode') {
			core[name] = covered ? yesNo(options.mspaMode === 'opt-out-option') : 0;
		} else if (name === 'MspaServiceProviderMode') {
			core[name] = covered ? yesNo(serviceProvider) : 0;
		} else {
			core[name] = 0;
		}
	}
	return { core, gpc: snapshot.privacySignals.gpc.active };
};
