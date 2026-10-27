import type {
	PolicyCategory,
	PolicyChoiceFixture,
	PolicyOperation,
	PolicySubjectFixture,
	ScenarioPolicy,
	ScenarioPrompt,
} from './policy-scenarios';

export interface PolicyStorageSeed {
	encoding: 'legacy-json' | 'legacy-compact' | 'v3-choice-json';
	raw: string;
}

export interface PolicyClock {
	now: () => number;
}

export interface PolicySessionSetup {
	clock: PolicyClock;
	policy: ScenarioPolicy;
	storage: Partial<
		Record<'cookie' | 'localStorage' | 'legacyLocalStorage', PolicyStorageSeed>
	>;
	gpc: boolean;
	probeGates: boolean;
}

export interface PolicyStorageBytes {
	choice: { cookie: string | null; localStorage: string | null };
	notice: { cookie: string | null; localStorage: string | null };
	legacyLocalStorage: string | null;
}

export interface PolicyLogs {
	events: readonly { name: string; payload: unknown }[];
	callbacks: readonly { name: string; payload: unknown }[];
	requests: readonly {
		kind: 'consent' | 'init';
		payload: unknown;
	}[];
	diagnostics: readonly string[];
}

export interface PolicyIabAuthority {
	tcString: string;
	confirmedAt: number;
	expiresAt: number;
	choiceFingerprint: string;
	vendorConsents: Record<string, boolean>;
	vendorLegitimateInterests: Record<string, boolean>;
	purposeConsents: Record<number, boolean>;
	purposeLegitimateInterests: Record<number, boolean>;
	specialFeatureOptIns: Record<number, boolean>;
}

export interface PolicySnapshotEvidence {
	explicitChoice: PolicyChoiceFixture | null;
	subject: PolicySubjectFixture | null;
	effectivePermissions: Record<PolicyCategory | 'necessary', boolean>;
	promptRequirement: ScenarioPrompt;
	noticeDismissal: {
		version: 1;
		dismissedAt: number;
		fingerprint: string;
	} | null;
	privacySignals: {
		gpc: { detected: boolean; active: boolean; override?: boolean };
	};
	resolution: {
		status: 'unconfigured' | 'matched' | 'no-match' | 'failed';
		policy: unknown;
	};
	policySnapshotToken: unknown;
	policyRule: { model: string; prompt: string };
	iab: {
		enabled: boolean;
		tcString?: string | null;
		authority?: PolicyIabAuthority | null;
	} | null;
	evaluatedAt: number;
}

export type PolicyAction = 'accept' | 'reject' | 'customize' | 'dismiss-notice';

export interface PolicyDomEvidence {
	firstLayer: 'choice' | 'notice' | 'hidden';
	preferencesOpen: boolean;
	rights: readonly ('disclosure' | 'preferences' | 'opt-out')[];
	actions: readonly {
		action: PolicyAction;
		visible: boolean;
		interactionDepth: number;
		group: string;
		prominence: string;
	}[];
}

export interface PolicyGateEvidence {
	scriptLoads: number;
	scriptAttached: boolean;
	networkAttempts: number;
	networkCompletions: number;
	iframeSrc: string | null;
	iframePlaceholderVisible: boolean;
	consentMode: Record<string, string>;
}

export interface PolicySsrRenderEvidence {
	prompt: ScenarioPrompt;
	dom: string;
	firstLayer: PolicyDomEvidence['firstLayer'];
	now: number;
}

export interface PolicySsrEvidence {
	server: PolicySsrRenderEvidence;
	client: PolicySsrRenderEvidence;
	hydrationWarnings: readonly string[];
	firstLayerHistory: readonly PolicyDomEvidence['firstLayer'][];
}

export interface PolicyEvidence {
	snapshot: PolicySnapshotEvidence;
	storage: PolicyStorageBytes;
	logs: PolicyLogs;
	dom: PolicyDomEvidence;
	gates?: PolicyGateEvidence;
	ssr?: PolicySsrEvidence;
	iabTargetAllowed?: boolean;
}

export interface PolicySession {
	readonly baseline: { storage: PolicyStorageBytes; logs: PolicyLogs };
	execute: (operation: PolicyOperation) => Promise<void>;
	observe: () => PolicyEvidence | Promise<PolicyEvidence>;
	dispose: () => void | Promise<void>;
}

export type CreatePolicySession = (
	setup: PolicySessionSetup
) => Promise<PolicySession>;

export interface PolicyFingerprintMutation {
	layout?: 'row' | 'column';
	actionOrder?: readonly string[];
	promptReason?: string;
	scopeOrder?: readonly PolicyCategory[];
	copyRevision?: string;
	gpcDenyCategories?: readonly PolicyCategory[];
	validity?: { choiceDays?: number; noticeDays?: number };
}

export type PolicyContractInput =
	| {
			kind: 'validate';
			model: string;
			prompt: string;
			gpcDenyCategories?: readonly string[];
	  }
	| { kind: 'canonicalize'; field: string; values: readonly string[] }
	| { kind: 'fingerprints'; mutation: PolicyFingerprintMutation }
	| { kind: 'detect-gpc'; source: 'navigator' | 'header'; value: unknown }
	| { kind: 'decode'; record: PolicyStorageSeed; now: number };

export interface PolicyContractEvidence {
	valid?: boolean;
	canonical?: readonly string[];
	fingerprints?: Record<
		'policy' | 'choice' | 'notice' | 'presentation',
		string
	>;
	fingerprintInputs?: {
		choice: { domain: string; version: number };
		notice: { domain: string; version: number };
	};
	detected?: boolean;
	decoded?: {
		choice: PolicyChoiceFixture;
		subject: PolicySubjectFixture | null;
	} | null;
}

export type ProbePolicyContract = (
	input: PolicyContractInput
) => PolicyContractEvidence | Promise<PolicyContractEvidence>;
