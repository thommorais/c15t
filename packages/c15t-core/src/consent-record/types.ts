export const CONSENT_CATEGORIES = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

export type CONSENT_CATEGORY = (typeof CONSENT_CATEGORIES)[number];

export type ConsentCategory = CONSENT_CATEGORY;

export type OptionalConsentCategory = Exclude<ConsentCategory, 'necessary'>;

export const OPTIONAL_CONSENT_CATEGORIES = [
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const satisfies readonly OptionalConsentCategory[];

export type PolicyModel = 'opt-in' | 'opt-out' | 'iab' | 'none';

export type PolicyPrompt = 'choice' | 'notice' | 'none';

export type PromptReason = 'missing' | 'expired' | 'policy-changed';

export type PromptRequirement =
	| { kind: 'choice'; reason: PromptReason }
	| { kind: 'notice'; reason: PromptReason }
	| { kind: 'none' };

export type ChoiceBasis =
	| { kind: 'choice-v1'; fingerprint: string }
	| { kind: 'legacy-v2'; materialFingerprint?: string };

export interface CategoryDecision {
	value: boolean;
	confirmedAt: number;
	basis: ChoiceBasis;
}

export interface ExplicitChoice {
	version: 3;
	categories: Partial<Record<OptionalConsentCategory, CategoryDecision>>;
}

export interface NoticeDismissal {
	version: 1;
	dismissedAt: number;
	fingerprint: string;
}

export interface ConsentSubject {
	subjectId?: string;
	externalId?: string;
	identityProvider?: string;
}

export interface RecordValidity {
	fingerprint: string;
	maxAgeMs: number | null;
}

export interface EvaluationPolicy {
	model: PolicyModel;
	prompt: PolicyPrompt;
	scope: readonly OptionalConsentCategory[];
	scopeMode: 'strict' | 'permissive';
	choiceScope?: readonly OptionalConsentCategory[];
	choice: RecordValidity;
	notice: RecordValidity;
	legacyMaterialFingerprint: string | null;
	gpcDenyCategories: readonly OptionalConsentCategory[];
}

export type RestrictionReason = 'explicit-denial' | 'strict-scope' | 'gpc';

export type DecisionAuthority =
	| 'absent'
	| 'valid'
	| 'expired'
	| 'policy-changed';

export type PermissionSource = 'grant' | 'default' | 'restricted';

export interface CategoryEvaluation {
	permitted: boolean;
	source: PermissionSource;
	authority: DecisionAuthority;
	inScope: boolean;
	expiresAt: number | null;
	restrictions: readonly RestrictionReason[];
}

export interface ConsentEvaluation {
	permissions: Readonly<Record<ConsentCategory, boolean>>;
	restrictions: Readonly<
		Partial<Record<OptionalConsentCategory, readonly RestrictionReason[]>>
	>;
	promptRequirement: PromptRequirement;
	nextDeadline: number | null;
	categories: Readonly<Record<OptionalConsentCategory, CategoryEvaluation>>;
}
