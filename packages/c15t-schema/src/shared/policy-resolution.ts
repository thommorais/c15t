import { FAILED_CONFIGURATION } from './policy-resolution-wire';
import type { PolicyResolution } from './policy-resolution-wire';
import { inspectPolicyRules, normalizePolicyRule } from './policy-rule';
import type { PolicyRule } from './policy-rule';
import { createPolicyRuleFingerprints } from './policy-rule-fingerprint';
import type { PolicyMatch, PolicyMatchedBy } from './policy-runtime';

export {
	parsePolicyContractHeader,
	POLICY_CONTRACT_HEADER,
	POLICY_CONTRACT_VERSION,
	readPolicyResolutionWire,
	SAFE_FALLBACK_POLICY_FINGERPRINTS,
	SAFE_FALLBACK_POLICY_ID,
	safeFallbackPolicyInput,
	safeFallbackPolicyRule,
	writePolicyResolutionWire,
} from './policy-resolution-wire';
export type {
	PolicyResolution,
	PolicyResolutionFailed,
	PolicyResolutionFailure,
	PolicyResolutionMatched,
	PolicyResolutionNoMatch,
	PolicyResolutionUnconfigured,
	PolicyResolutionWire,
	SafeFallbackPolicyInput,
} from './policy-resolution-wire';

const normalizeCountryCode = function normalizeCountryCode(
	countryCode: string | null | undefined
): string | null {
	if (typeof countryCode !== 'string') {
		return null;
	}
	const normalized = countryCode.trim().toUpperCase();
	return normalized || null;
};

const normalizeRegionCode = function normalizeRegionCode(
	regionCode: string | null | undefined
): string | null {
	if (typeof regionCode !== 'string') {
		return null;
	}
	const normalized = (
		regionCode.includes('-') ? regionCode.split('-').pop() : regionCode
	)
		?.trim()
		.toUpperCase();
	return normalized || null;
};

export interface PolicyMatchEntry {
	id: string;
	match: PolicyMatch;
}

export type PolicyMatchOutcome =
	| { status: 'matched'; index: number; matchedBy: PolicyMatchedBy }
	| { status: 'no-match' }
	| { status: 'insufficient-inputs' };

const findRegionMatch = function findRegionMatch(
	entries: readonly PolicyMatchEntry[],
	countryCode: string,
	regionCode: string
): number {
	return entries.findIndex((entry) =>
		(entry.match.regions ?? []).some(
			(region) =>
				normalizeCountryCode(region.country) === countryCode &&
				normalizeRegionCode(region.region) === regionCode
		)
	);
};

const findCountryMatch = function findCountryMatch(
	entries: readonly PolicyMatchEntry[],
	countryCode: string
): number {
	return entries.findIndex((entry) =>
		(entry.match.countries ?? []).some(
			(country) => normalizeCountryCode(country) === countryCode
		)
	);
};

const matchMissingRegion = function matchMissingRegion(
	entries: readonly PolicyMatchEntry[],
	countryCode: string
): PolicyMatchOutcome | null {
	const regionFallbackIndex = entries.findIndex((entry) =>
		entry.match.regionFallbacks?.some(
			(country) => normalizeCountryCode(country) === countryCode
		)
	);
	if (regionFallbackIndex !== -1) {
		return {
			index: regionFallbackIndex,
			matchedBy: 'fallback',
			status: 'matched',
		};
	}
	const hasRegionRules = entries.some((entry) =>
		entry.match.regions?.some(
			(region) => normalizeCountryCode(region.country) === countryCode
		)
	);
	if (!hasRegionRules) {
		return null;
	}
	const index = entries.findIndex((entry) => entry.match.fallback === true);
	return index === -1
		? { status: 'insufficient-inputs' }
		: { index, matchedBy: 'fallback', status: 'matched' };
};

export const matchPolicyRules = function matchPolicyRules(params: {
	entries: readonly PolicyMatchEntry[];
	countryCode: string | null | undefined;
	regionCode: string | null | undefined;
}): PolicyMatchOutcome {
	const { entries } = params;
	const countryCode = normalizeCountryCode(params.countryCode);
	const regionCode = normalizeRegionCode(params.regionCode);

	if (countryCode && regionCode) {
		const index = findRegionMatch(entries, countryCode, regionCode);
		if (index !== -1) {
			return { index, matchedBy: 'region', status: 'matched' };
		}
	}
	if (countryCode) {
		const index = findCountryMatch(entries, countryCode);
		if (index !== -1) {
			return { index, matchedBy: 'country', status: 'matched' };
		}
		if (!regionCode) {
			const outcome = matchMissingRegion(entries, countryCode);
			if (outcome) {
				return outcome;
			}
		}
	}

	const fallbackIndex = entries.findIndex(
		(entry) => entry.match.fallback === true
	);
	const defaultIndex = entries.findIndex(
		(entry) => entry.match.isDefault === true
	);
	if (!countryCode && fallbackIndex !== -1) {
		return { index: fallbackIndex, matchedBy: 'fallback', status: 'matched' };
	}
	if (defaultIndex !== -1) {
		return { index: defaultIndex, matchedBy: 'default', status: 'matched' };
	}
	if (!countryCode) {
		return { status: 'insufficient-inputs' };
	}
	return { status: 'no-match' };
};

export const resolvePolicyRules = function resolvePolicyRules(params: {
	rules?: unknown;
	countryCode: string | null;
	regionCode: string | null;
	iabEnabled?: boolean;
}): PolicyResolution {
	if (params.rules === undefined) {
		return { policy: null, status: 'unconfigured' };
	}
	const { errors } = inspectPolicyRules(
		params.rules,
		params.iabEnabled === undefined
			? undefined
			: { iabEnabled: params.iabEnabled }
	);
	if (errors.length > 0 || !Array.isArray(params.rules)) {
		return FAILED_CONFIGURATION;
	}
	const rules = params.rules as PolicyRule[];
	if (rules.length === 0) {
		return { policy: null, status: 'no-match' };
	}
	try {
		const outcome = matchPolicyRules({
			countryCode: params.countryCode,
			entries: rules,
			regionCode: params.regionCode,
		});
		if (outcome.status === 'insufficient-inputs') {
			return { policy: null, reason: 'insufficient-inputs', status: 'failed' };
		}
		if (outcome.status === 'no-match') {
			return { policy: null, status: 'no-match' };
		}
		const rule = rules[outcome.index];
		if (!rule) {
			return FAILED_CONFIGURATION;
		}
		const policy = normalizePolicyRule(rule);
		return {
			fingerprints: createPolicyRuleFingerprints(policy, rule.legacyMaterial),
			matchedBy: outcome.matchedBy,
			policy,
			policyId: policy.id,
			status: 'matched',
		};
	} catch {
		return FAILED_CONFIGURATION;
	}
};
