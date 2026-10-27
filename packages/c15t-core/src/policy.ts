import type {
	PolicyFingerprints,
	PolicyResolution,
	PolicyResolutionMatched,
	ResolvedPolicyRule,
} from '@c15t/schema/types';
import { safeFallbackPolicyInput } from '@c15t/schema/types';

import { createEvaluationPolicy } from './consent-record/evaluation-policy';
import type {
	EvaluationPolicy,
	ExplicitChoice,
	OptionalConsentCategory,
} from './consent-record/types';
import type { AllConsentNames } from './consent/consent-types';
import { deepFreeze } from './libs/freeze-data';
import type { KernelModel } from './types';

export interface EffectivePolicy {
	rule: ResolvedPolicyRule;
	fingerprints: PolicyFingerprints;
}

const projectChoiceScope = function projectChoiceScope(
	rule: ResolvedPolicyRule,
	consentCategories?: readonly AllConsentNames[] | null
): readonly OptionalConsentCategory[] | undefined {
	if (consentCategories?.length) {
		return rule.scope.filter((category) =>
			consentCategories.includes(category)
		);
	}
	return rule.scopeMode === 'permissive' && rule.model !== 'iab'
		? []
		: undefined;
};

const projectEvaluationPolicy = (
	effective: EffectivePolicy,
	consentCategories?: readonly AllConsentNames[] | null
): EvaluationPolicy => {
	const { rule, fingerprints } = effective;
	return createEvaluationPolicy({
		choice: {
			fingerprint: fingerprints.choice,
			maxAgeMs: Math.round(rule.validity.choiceMs),
		},
		choiceScope: projectChoiceScope(rule, consentCategories),
		gpcDenyCategories: rule.privacySignals.gpc.denyCategories,
		legacyMaterialFingerprint: fingerprints.legacyMaterial ?? null,
		model: rule.model,
		notice: {
			fingerprint: fingerprints.notice,
			maxAgeMs: Math.round(rule.validity.noticeMs),
		},
		prompt: rule.prompt,
		scope: rule.scope,
		scopeMode: rule.scopeMode,
	});
};

const fallback = safeFallbackPolicyInput();
const FALLBACK_EFFECTIVE_POLICY: EffectivePolicy = {
	fingerprints: fallback.fingerprints,
	rule: fallback.policy,
};
deepFreeze(FALLBACK_EFFECTIVE_POLICY);
const FALLBACK_EVALUATION_POLICY = projectEvaluationPolicy(
	FALLBACK_EFFECTIVE_POLICY
);
deepFreeze(FALLBACK_EVALUATION_POLICY);

export const disabledPolicyResolution =
	function disabledPolicyResolution(): PolicyResolutionMatched {
		return {
			fingerprints: {
				choice:
					'7c239616f9280c2381800f2815429bd4bc3dad324a367fbd36adb838a1960340',
				notice:
					'167ae78ed172a70d96c03045e6a740e0fe1a7d7f54d28ccee8777fe345c574ed',
				policy:
					'7f89b3f54bb6e0396447461ca1451ef4d448d43bc356442ee61910de8070c220',
			},
			matchedBy: 'fallback',
			policy: {
				actions: { allowed: [], equivalent: [], required: [] },
				copyRevision: null,
				id: 'disabled',
				model: 'opt-out',
				preselectedCategories: [],
				privacySignals: { gpc: { denyCategories: [] } },
				prompt: 'none',
				proof: { storeIp: false, storeLanguage: false, storeUserAgent: false },
				rights: ['disclosure', 'opt-out', 'preferences'],
				scope: ['experience', 'functionality', 'marketing', 'measurement'],
				scopeMode: 'permissive',
				validity: { choiceMs: 31_536_000_000, noticeMs: 31_536_000_000 },
			},
			policyId: 'disabled',
			status: 'matched',
		};
	};

export const resolveEffectivePolicy = function resolveEffectivePolicy(
	resolution: PolicyResolution
): EffectivePolicy {
	if (resolution.status === 'matched') {
		return { fingerprints: resolution.fingerprints, rule: resolution.policy };
	}
	return FALLBACK_EFFECTIVE_POLICY;
};

export const buildEvaluationPolicy = function buildEvaluationPolicy(
	effective: EffectivePolicy,
	consentCategories?: readonly AllConsentNames[] | null
): EvaluationPolicy {
	if (effective === FALLBACK_EFFECTIVE_POLICY && !consentCategories?.length) {
		return FALLBACK_EVALUATION_POLICY;
	}
	return projectEvaluationPolicy(effective, consentCategories);
};

export const deriveModel = function deriveModel(
	rule: ResolvedPolicyRule,
	iabEnabled: boolean
): KernelModel {
	if (rule.model === 'iab') {
		return iabEnabled ? 'iab' : 'opt-in';
	}
	return rule.model;
};

export type PresentedSelection = Partial<
	Record<OptionalConsentCategory, boolean>
>;

export const presentedSelection = function presentedSelection(
	rule: ResolvedPolicyRule,
	draft: PresentedSelection | null,
	choice: ExplicitChoice | null
): PresentedSelection {
	const selection: PresentedSelection = {};
	for (const category of rule.scope) {
		const staged = draft?.[category];
		if (typeof staged === 'boolean') {
			selection[category] = staged;
			continue;
		}
		const decision = choice?.categories[category];
		if (decision) {
			selection[category] = decision.value;
			continue;
		}
		selection[category] =
			rule.model === 'opt-out' || rule.model === 'none'
				? true
				: rule.preselectedCategories.includes(category);
	}
	return selection;
};

export const scopeSelection = function scopeSelection(
	rule: ResolvedPolicyRule,
	value: boolean
): PresentedSelection {
	const selection: PresentedSelection = {};
	for (const category of rule.scope) {
		selection[category] = value;
	}
	return selection;
};
