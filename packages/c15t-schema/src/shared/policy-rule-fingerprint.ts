import { compareCanonical } from './canonical-order';
import type { LegacyMaterialCompatibility } from './legacy-material-policy';
import {
	createMaterialPolicyFingerprintSync,
	createDeterministicFingerprintSync,
} from './policy-fingerprint';
import { canonicalizePolicySet as sorted } from './policy-rule';
import type {
	PolicyOptionalCategory,
	PolicyPromptAction,
	PolicyRight,
	PolicyRuleModel,
	ResolvedPolicyRule,
} from './policy-rule';
import type { PolicyScopeMode } from './policy-runtime';

export const POLICY_FINGERPRINT_VERSION = 1;
export const CHOICE_PROMPT_FINGERPRINT_VERSION = 1;
export const NOTICE_PROMPT_FINGERPRINT_VERSION = 1;
export const PRESENTATION_FINGERPRINT_VERSION = 1;

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue | undefined };

export interface PolicyFingerprints {
	policy: string;
	choice: string;
	notice: string;
	legacyMaterial?: string;
}

export interface PolicyFingerprintInput {
	domain: 'policy';
	version: typeof POLICY_FINGERPRINT_VERSION;
	model: PolicyRuleModel;
	prompt: ResolvedPolicyRule['prompt'];
	scope: PolicyOptionalCategory[];
	scopeMode: PolicyScopeMode;
	preselectedCategories: PolicyOptionalCategory[];
	actions: {
		allowed: PolicyPromptAction[];
		required: PolicyPromptAction[];
		equivalent: PolicyPromptAction[][];
	};
	rights: PolicyRight[];
	validity: { choiceMs: number; noticeMs: number };
	privacySignals: { gpc: { denyCategories: PolicyOptionalCategory[] } };
	copyRevision: string | null;
	proof: { storeIp: boolean; storeUserAgent: boolean; storeLanguage: boolean };
}

export interface ChoicePromptFingerprintInput {
	domain: 'choice';
	version: typeof CHOICE_PROMPT_FINGERPRINT_VERSION;
	model: PolicyRuleModel;
	prompt: ResolvedPolicyRule['prompt'];
	scope: PolicyOptionalCategory[];
	scopeMode: PolicyScopeMode;
	requiredActions: PolicyPromptAction[];
	validityMs: number;
	rights: PolicyRight[];
	privacySignals: { gpc: { denyCategories: PolicyOptionalCategory[] } };
	copyRevision: string | null;
}

export interface NoticePromptFingerprintInput {
	domain: 'notice';
	version: typeof NOTICE_PROMPT_FINGERPRINT_VERSION;
	model: PolicyRuleModel;
	prompt: ResolvedPolicyRule['prompt'];
	scope: PolicyOptionalCategory[];
	scopeMode: PolicyScopeMode;
	requiredActions: PolicyPromptAction[];
	validityMs: number;
	rights: PolicyRight[];
	privacySignals: { gpc: { denyCategories: PolicyOptionalCategory[] } };
	copyRevision: string | null;
}

export interface PresentationFingerprintInput {
	domain: 'presentation';
	version: typeof PRESENTATION_FINGERPRINT_VERSION;
	presentation: JsonValue;
}

const sortedGroups = function sortedGroups(
	groups: readonly (readonly PolicyPromptAction[])[]
): PolicyPromptAction[][] {
	return groups
		.map((group) => sorted(group))
		.sort((left, right) => compareCanonical(left.join(','), right.join(',')));
};

export const policyFingerprintInput = function policyFingerprintInput(
	rule: ResolvedPolicyRule
): PolicyFingerprintInput {
	return {
		actions: {
			allowed: sorted(rule.actions.allowed),
			equivalent: sortedGroups(rule.actions.equivalent),
			required: sorted(rule.actions.required),
		},
		copyRevision: rule.copyRevision,
		domain: 'policy',
		model: rule.model,
		preselectedCategories: sorted(rule.preselectedCategories),
		privacySignals: {
			gpc: { denyCategories: sorted(rule.privacySignals.gpc.denyCategories) },
		},
		prompt: rule.prompt,
		proof: {
			storeIp: rule.proof.storeIp,
			storeLanguage: rule.proof.storeLanguage,
			storeUserAgent: rule.proof.storeUserAgent,
		},
		rights: sorted(rule.rights),
		scope: sorted(rule.scope),
		scopeMode: rule.scopeMode,
		validity: {
			choiceMs: rule.validity.choiceMs,
			noticeMs: rule.validity.noticeMs,
		},
		version: POLICY_FINGERPRINT_VERSION,
	};
};

export const choicePromptFingerprintInput =
	function choicePromptFingerprintInput(
		rule: ResolvedPolicyRule
	): ChoicePromptFingerprintInput {
		return {
			copyRevision: rule.copyRevision,
			domain: 'choice',
			model: rule.model,
			privacySignals: {
				gpc: {
					denyCategories: sorted(rule.privacySignals.gpc.denyCategories),
				},
			},
			prompt: rule.prompt,
			requiredActions: sorted(rule.actions.required),
			rights: sorted(rule.rights),
			scope: sorted(rule.scope),
			scopeMode: rule.scopeMode,
			validityMs: rule.validity.choiceMs,
			version: CHOICE_PROMPT_FINGERPRINT_VERSION,
		};
	};

export const noticePromptFingerprintInput =
	function noticePromptFingerprintInput(
		rule: ResolvedPolicyRule
	): NoticePromptFingerprintInput {
		return {
			copyRevision: rule.copyRevision,
			domain: 'notice',
			model: rule.model,
			privacySignals: {
				gpc: {
					denyCategories: sorted(rule.privacySignals.gpc.denyCategories),
				},
			},
			prompt: rule.prompt,
			requiredActions: sorted(rule.actions.required),
			rights: sorted(rule.rights),
			scope: sorted(rule.scope),
			scopeMode: rule.scopeMode,
			validityMs: rule.validity.noticeMs,
			version: NOTICE_PROMPT_FINGERPRINT_VERSION,
		};
	};

export const createPolicyRuleFingerprints =
	function createPolicyRuleFingerprints(
		rule: ResolvedPolicyRule,
		legacy?: LegacyMaterialCompatibility
	): PolicyFingerprints {
		const policy = createDeterministicFingerprintSync(
			policyFingerprintInput(rule)
		);
		return {
			choice: createDeterministicFingerprintSync(
				choicePromptFingerprintInput(rule)
			),
			notice: createDeterministicFingerprintSync(
				noticePromptFingerprintInput(rule)
			),
			policy,
			...(legacy && {
				legacyMaterial:
					policy === legacy.policyFingerprint
						? createMaterialPolicyFingerprintSync(legacy.input)
						: `policy-changed:${policy}`,
			}),
		};
	};

export const createPresentationFingerprint =
	function createPresentationFingerprint(presentation: JsonValue): string {
		const input: PresentationFingerprintInput = {
			domain: 'presentation',
			presentation,
			version: PRESENTATION_FINGERPRINT_VERSION,
		};
		return createDeterministicFingerprintSync(input);
	};
