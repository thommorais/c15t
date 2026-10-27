export type PolicyCategory =
	| 'functionality'
	| 'experience'
	| 'measurement'
	| 'marketing';

export interface PolicyChoiceFixture {
	version: 3;
	categories: Partial<
		Record<
			PolicyCategory,
			{
				value: boolean;
				confirmedAt: number;
				basis:
					| { kind: 'choice-v1'; fingerprint: string }
					| { kind: 'legacy-v2'; materialFingerprint?: string };
			}
		>
	>;
}

export interface PolicySubjectFixture {
	subjectId?: string;
	externalId?: string;
	identityProvider?: string;
}

export interface PolicyRecordFixture {
	encoding: 'legacy-json' | 'legacy-compact' | 'v3-choice-json';
	raw: string;
	expected:
		| {
				valid: true;
				choice: PolicyChoiceFixture;
				subject: PolicySubjectFixture | null;
		  }
		| { valid: false };
}

export interface ScenarioPolicy {
	model: 'opt-in' | 'opt-out' | 'iab' | 'none';
	prompt: 'choice' | 'notice' | 'none';
	scope: readonly PolicyCategory[];
	scopeMode: 'strict' | 'permissive';
	choice: { fingerprint: string; maxAgeMs: number };
	notice: { fingerprint: string; maxAgeMs: number };
	legacyMaterialFingerprint: string;
	gpcDenyCategories: readonly PolicyCategory[];
	rights: readonly ('disclosure' | 'preferences' | 'opt-out')[];
}

export type ScenarioPrompt =
	| { kind: 'none' }
	| {
			kind: 'choice' | 'notice';
			reason: 'missing' | 'expired' | 'policy-changed';
	  };

export type ScenarioEvent =
	| 'choice-recorded'
	| 'permissions-changed'
	| 'notice-dismissed';

export interface PolicyObservation {
	prompt?: ScenarioPrompt;
	permissions?: Partial<Record<PolicyCategory | 'necessary', boolean>>;
	choice?: PolicyChoiceFixture | null;
	subject?: PolicySubjectFixture | 'generated' | null;
	resolution?: 'unconfigured' | 'matched' | 'no-match' | 'failed';
	priorPolicyStateDiscarded?: readonly (
		| 'policy'
		| 'snapshotToken'
		| 'promptRequirement'
		| 'policyIab'
		| 'policyDefaults'
	)[];
	events?: Partial<Record<ScenarioEvent, number>>;
	consentCallbacks?: number;
	consentRequests?: number;
	storage?:
		| 'unchanged'
		| 'choice-v3'
		| 'choice-and-notice'
		| 'notice-only'
		| 'cleared';
	noticeDismissal?: 'absent' | 'current';
	firstLayer?: 'choice' | 'notice' | 'hidden';
	persistentRights?: readonly ('disclosure' | 'preferences' | 'opt-out')[];
	preferencesOpen?: boolean;
	gates?: {
		script: 'loaded' | 'blocked';
		network: 'allowed' | 'blocked';
		iframe: 'loaded' | 'placeholder';
		consentMode: 'granted' | 'denied';
	};
	actions?: readonly ('accept' | 'reject' | 'customize' | 'dismiss-notice')[];
	equivalentActions?: readonly ['accept', 'reject'];
	diagnostic?: 'action-prominence';
	ssr?: { promptParity: true; domParity: true; hydrationWarnings: 0 };
	iabTargetAllowed?: boolean;
	iabAuthority?: 'absent' | 'unchanged';
}

export type PolicyOperation =
	| { kind: 'hydrate' }
	| { kind: 'reload' }
	| { kind: 'save'; values: Partial<Record<PolicyCategory, boolean>> }
	| { kind: 'accept' | 'reject' | 'save-current' | 'dismiss-notice' | 'clear' }
	| { kind: 'set-gpc'; active: boolean }
	| { kind: 'advance-time'; now: number }
	| { kind: 'apply-policy'; policy: ScenarioPolicy | null }
	| { kind: 'resolve-failure'; reason: 'transport' | 'omitted-policy' }
	| { kind: 'resolve-unconfigured' }
	| {
			kind: 'unsupported-wire';
			transport: 'hosted' | 'manifest' | 'self-hosted';
			deployment: 'cached-client' | 'mixed-version';
	  }
	| { kind: 'presentation'; layout: 'row' | 'column'; primary?: 'accept' }
	| { kind: 'open-preferences'; via: 'trigger' | 'link' }
	| { kind: 'ssr-hydrate' }
	| {
			kind: 'probe-iab';
			authority: 'valid' | 'absent';
			category: PolicyCategory;
	  };

export interface PolicyScenarioStep {
	operation: PolicyOperation;
	expect: PolicyObservation;
}

export interface PolicyScenario {
	id: string;
	covers: readonly (
		| 'A'
		| 'F1'
		| 'F2'
		| 'F3'
		| 'F4'
		| 'F5'
		| 'F6'
		| 'F7'
		| 'F8'
		| 'F9'
		| 'F10'
		| 'F11'
	)[];
	now: number;
	policy: ScenarioPolicy;
	storage?: {
		cookie?: string;
		localStorage?: string;
		legacyLocalStorage?: string;
	};
	gpc?: boolean;
	probeGates?: boolean;
	steps: readonly PolicyScenarioStep[];
}
