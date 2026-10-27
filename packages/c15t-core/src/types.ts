import type {
	AdTechProvider,
	ConsentJourneyScope,
	InitOutput,
	GlobalVendorList,
	LocationResponse,
	NonIABVendor,
	PolicyResolution,
	PolicyScopeMode,
	ResolvedPolicyRule,
	TranslationsResponse,
	Vendor,
} from '@c15t/schema/types';
import type { Translations } from '@c15t/translations';

import type {
	ConsentSubject,
	EvaluationPolicy,
	ExplicitChoice,
	NoticeDismissal,
	OptionalConsentCategory,
	PromptReason,
	PromptRequirement,
	RestrictionReason,
} from './consent-record/types';
import type { RecordIssue } from './consent-record/validation';
import type { AllConsentNames } from './consent/consent-types';
import type { ExperimentAssignment, ExperimentGate } from './libs/experiment';
import type { HasCondition } from './libs/has';
import type { VendorDetails } from './libs/script-loader/types';
import type { PublisherRestriction } from './options/iab-tcf';

export type {
	AdTechProvider,
	GlobalVendorList,
	LocationResponse,
	NonIABVendor,
	PolicyResolution,
	PolicyScopeMode,
	ResolvedPolicyRule,
	TranslationsResponse,
	Vendor,
};

export type {
	ConsentSubject,
	EvaluationPolicy,
	ExplicitChoice,
	NoticeDismissal,
	OptionalConsentCategory,
	PromptReason,
	PromptRequirement,
	RecordIssue,
	RestrictionReason,
};

export type KernelBranding = 'c15t' | 'consent' | 'inth';

export type KernelHosting = 'inth' | 'self-hosted';

export type KernelModel = 'opt-in' | 'opt-out' | 'iab' | 'none';

export type Model = KernelModel;

export type KernelActiveUI = 'none' | 'banner' | 'dialog' | null;

export type SaveUISource = KernelActiveUI | 'widget';

export type PromptSurface = 'banner' | 'dialog';

export type ActiveUI = 'none' | 'banner' | 'dialog';

export type ConsentState = Record<AllConsentNames, boolean>;

export interface KernelOverrides {
	country?: string;
	region?: string;
	language?: string;
	gpc?: boolean;
}

export interface KernelPrivacySignals {
	readonly gpc: {
		readonly detected: boolean;
		readonly override: boolean | undefined;
		readonly active: boolean;
	};
}

export interface KernelUser {
	externalId: string;
	externalIdType?: string;
	identityProvider?: string;
	identityToken?: string;
	properties?: Record<string, string | number | boolean>;
}

export interface KernelTranslations {
	language: string;
	translations: TranslationsResponse;
}

export interface KernelIABAuthority {
	tcString: string;
	confirmedAt: number;
	expiresAt: number;
	choiceFingerprint: string;
	vendorConsents: Record<string, boolean>;
	vendorLegitimateInterests: Record<string, boolean>;
	purposeConsents: Record<number, boolean>;
	purposeLegitimateInterests: Record<number, boolean>;
	specialFeatureOptIns: Record<number, boolean>;
	publisherRestrictions?: PublisherRestriction[];
	adTechProviderConsents?: Record<string, boolean>;
	addtlConsent?: string;
}

export interface KernelIABState {
	authority: KernelIABAuthority | null;
	enabled: boolean;
	gvl: GlobalVendorList | null;
	gvlReference?: InitOutput['gvlReference'];
	customVendors: NonIABVendor[];
	adTechProviders?: AdTechProvider[];
	adTechProviderConsents?: Record<string, boolean>;
	cmpId: number | null;
	vendorConsents: Record<string, boolean>;
	vendorLegitimateInterests: Record<string, boolean>;
	purposeConsents: Record<number, boolean>;
	purposeLegitimateInterests: Record<number, boolean>;
	specialFeatureOptIns: Record<number, boolean>;
	tcString: string | null;
	publisherRestrictions?: PublisherRestriction[];
}

export type VendorSource = 'config' | 'manifest' | 'script';

export type ResolvedVendor = Pick<Vendor, 'id' | 'category'> &
	Partial<Omit<Vendor, 'id' | 'category'>> & {
		source: VendorSource;
		presentable: boolean;
		ownerCategory?: HasCondition<AllConsentNames>;
		ownerDetails?: VendorDetails;
		shadowed?: ResolvedVendor;
	};

export interface KernelVendorsState {
	readonly declared: readonly ResolvedVendor[];
	readonly listVersion: string | null;
}

export interface VendorChoice {
	readonly version: 1;
	readonly confirmedAt: number;
	readonly denied: readonly string[];
}

export interface HydrationRecords {
	choice?: ExplicitChoice | null;
	subject?: ConsentSubject | null;
	noticeDismissal?: NoticeDismissal | null;
	vendorChoice?: VendorChoice | null;
	now?: number;
}

export type HydrationResult =
	| { ok: true; changed: boolean }
	| { ok: false; issues: RecordIssue[] };

export interface ConsentSnapshot {
	readonly externalPermissions?: Readonly<ConsentState>;
	readonly consentCategories: readonly AllConsentNames[] | null;
	readonly explicitChoice: Readonly<ExplicitChoice> | null;
	readonly effectivePermissions: Readonly<ConsentState>;
	readonly promptRequirement: Readonly<PromptRequirement>;
	readonly noticeDismissal: Readonly<NoticeDismissal> | null;
	readonly privacySignals: KernelPrivacySignals;
	readonly resolution: Readonly<PolicyResolution>;
	readonly policyRule: Readonly<ResolvedPolicyRule>;
	readonly restrictions: Readonly<
		Partial<Record<OptionalConsentCategory, readonly RestrictionReason[]>>
	>;
	readonly nextDeadline: number | null;
	readonly subject: Readonly<ConsentSubject> | null;
	readonly evaluatedAt: number;
	readonly evaluationPolicy: Readonly<EvaluationPolicy>;

	readonly overrides: Readonly<KernelOverrides>;
	readonly user: Readonly<KernelUser> | null;
	readonly revision: number;

	readonly location: Readonly<LocationResponse> | null;
	readonly translations: Readonly<KernelTranslations> | null;
	readonly branding: KernelBranding | null;
	readonly hosting: KernelHosting | null;
	readonly policySnapshotToken: string | null;

	readonly model: KernelModel;
	readonly activeUI: KernelActiveUI;
	readonly policyPending: boolean;
	readonly surfaceShownAt: Readonly<Record<PromptSurface, number | null>>;
	readonly experiment: Readonly<ExperimentAssignment> | null;
	readonly experimentPending: boolean;

	readonly iab: Readonly<KernelIABState> | null;

	readonly vendors: Readonly<KernelVendorsState> | null;
	readonly vendorChoice: Readonly<VendorChoice> | null;
}

export interface KernelConfig {
	initialExternalPermissions?: Partial<ConsentState>;
	consentCategories?: readonly AllConsentNames[];
	inferredConsentCategories?: readonly AllConsentNames[];
	now?: number;
	initialRecords?: HydrationRecords;
	initialPolicyResolution?: PolicyResolution;
	initialPrivacySignals?: { gpc?: boolean };
	initialDraft?: Partial<ConsentState>;
	initialOverrides?: KernelOverrides;
	initialUser?: KernelUser;
	initialExperiment?: ExperimentAssignment;
	initialExperimentPending?: boolean;
	initialTranslations?: KernelTranslations;
	translationOverrides?: Readonly<
		Record<string, Partial<Translations> | undefined>
	>;
	initialLocation?: LocationResponse;
	initialBranding?: KernelBranding;
	initialHosting?: KernelHosting;
	initialPolicyPending?: boolean;
	initRetry?:
		| {
				maxAttempts?: number;
				baseDelayMs?: number;
				maxDelayMs?: number;
		  }
		| false;

	initialPolicySnapshotToken?: string;
	initialIab?: Partial<KernelIABState>;
	initialVendors?: KernelVendorsState;
	transport?: KernelTransport;
}

export interface InitContext {
	overrides: Readonly<KernelOverrides>;
	user: Readonly<KernelUser> | null;
	experiment?: { id: string; arm: string };
	journey?: KernelJourney;
}

export interface KernelJourney {
	readonly id: string;
	readonly scope: ConsentJourneyScope;
	readonly storedChoice: boolean;
}

export interface InitResponse {
	resolvedOverrides?: KernelOverrides;
	resolvedPrivacySignals?: { gpc?: boolean };
	policyResolution?: unknown;
	records?: HydrationRecords;
	subjectId?: string;

	location?: LocationResponse;
	translations?: KernelTranslations;
	branding?: KernelBranding;
	hosting?: KernelHosting;
	policySnapshotToken?: string;

	gvl?: GlobalVendorList | null;
	gvlReference?: InitOutput['gvlReference'];
	customVendors?: NonIABVendor[];
	adTechProviders?: AdTechProvider[];
	cmpId?: number;
	vendors?: Vendor[];
	vendorListVersion?: string;
}

export interface ConfirmedCoverage {
	categories: Readonly<Partial<Record<OptionalConsentCategory, boolean>>>;
	actionAt: number;
}

export interface SavePayload {
	subjectId: string;
	subject: Readonly<ConsentSubject>;
	choice: Readonly<ExplicitChoice>;
	confirmed: ConfirmedCoverage;
	consents: Readonly<ConsentState>;
	overrides: Readonly<KernelOverrides>;
	user: Readonly<KernelUser> | null;
	model: KernelModel;
	uiSource: SaveUISource;
	consentAction: 'all' | 'necessary' | 'custom';
	policySnapshotToken: string | null;
	timeToDecisionMs?: number;
	experiment?: ExperimentAssignment;
	decisionInputs?: {
		policyId: string | null;
		fingerprint?: string;
		country: string | null;
		region: string | null;
		language: string;
		gpc: boolean;
	};
	journey?: Pick<KernelJourney, 'id' | 'scope'>;
	tcString?: string | null;
	addtlConsent?: string;
	givenAt?: number;
	vendorChoice?: {
		version: 1;
		confirmedAt: number;
		grants: Readonly<Record<string, boolean>>;
	};
}

export interface SaveContext {
	replay?: boolean;
}

export interface KernelTransport {
	init?: (ctx: InitContext) => Promise<InitResponse>;
	save?: (payload: SavePayload, context?: SaveContext) => Promise<SaveResult>;
	identify?: (user: KernelUser, subjectId: string | null) => Promise<void>;
	loadSubjectRecord?: (subjectId: string) => Promise<HydrationRecords | null>;
}

export type KernelEvent =
	| {
			type: 'preferences:requested';
	  }
	| {
			type: 'records:cleared';
	  }
	| {
			type: 'choice:recorded';
			snapshot: ConsentSnapshot;
			confirmed: readonly OptionalConsentCategory[];
			actionAt: number;
			uiSource: SaveUISource;
			consentAction: SavePayload['consentAction'];
			timeToDecisionMs?: number;
			experiment?: ExperimentAssignment;
	  }
	| {
			type: 'surface:shown';
			surface: PromptSurface;
			shownAt: number;
			snapshot: ConsentSnapshot;
			experiment?: ExperimentAssignment;
	  }
	| {
			type: 'permissions:changed';
			snapshot: ConsentSnapshot;
			previous: Readonly<ConsentState>;
	  }
	| {
			type: 'notice:dismissed';
			snapshot: ConsentSnapshot;
			dismissal: NoticeDismissal;
			surface: SaveUISource;
			timeToDecisionMs?: number;
			experiment?: ExperimentAssignment;
	  }
	| { type: 'overrides:set'; snapshot: ConsentSnapshot }
	| { type: 'user:identified'; snapshot: ConsentSnapshot }
	| {
			type: 'subject:resolved';
			snapshot: ConsentSnapshot;
			previousSubjectId?: string;
	  }
	| { type: 'iab:set'; snapshot: ConsentSnapshot }
	| {
			type: 'vendors:set';
			snapshot: ConsentSnapshot;
	  }
	| {
			type: 'vendors:recorded';
			snapshot: ConsentSnapshot;
			actionAt: number;
	  }
	| { type: 'init:applied'; snapshot: ConsentSnapshot }
	| {
			type: 'init:failed';
			error: unknown;
			attempt: number;
			nextRetryMs: number | null;
	  }
	| {
			type: 'save:replayed';
			subjectId: string;
			ok: boolean;
			rejected?: string;
	  }
	| { type: 'command:init:started' }
	| { type: 'command:init:completed'; result: InitResult }
	| { type: 'command:save:started' }
	| { type: 'command:save:completed'; result: SaveResult }
	| { type: 'command:error'; command: string; error: unknown };

export type Listener<T> = (value: T) => void;

export type Unsubscribe = () => void;

export interface InitResult {
	ok: boolean;
	error?: unknown;
}

export type SaveInput =
	| 'all'
	| 'none'
	| (Partial<ConsentState> & {
			vendors?: Record<string, boolean>;
	  });

export interface SaveResult {
	ok: boolean;
	subjectId?: string;
	confirmed?: readonly OptionalConsentCategory[];
	issues?: RecordIssue[];
}

export type NoticeDismissResult =
	| { ok: true; dismissal: NoticeDismissal }
	| { ok: false; reason: 'not-required' };

export interface ConsentKernel {
	dispose: () => void;
	getSnapshot: () => ConsentSnapshot;
	getRecordsGeneration: () => number;

	getServerSnapshot: () => ConsentSnapshot;

	subscribe: (listener: Listener<ConsentSnapshot>) => Unsubscribe;

	refresh: (now?: number) => ConsentSnapshot;

	readonly set: {
		externalPermissions: (permissions: Partial<ConsentState>) => void;
		consentCategories: (
			categories: readonly AllConsentNames[] | undefined
		) => void;
		registerConsentCategories: (categories: readonly AllConsentNames[]) => void;
		draft: (input: Partial<ConsentState>) => void;
		overrides: (input: KernelOverrides) => void;
		language: (code: string) => void;
		subjectId: (id: string | null) => void;
		privacySignals: (input: { gpc?: boolean }) => void;
		activeUI: (ui: KernelActiveUI) => void;
		experiment: (
			assignment: ExperimentAssignment | null,
			gate?: ExperimentGate
		) => void;
		iab: (patch: Partial<KernelIABState>) => void;
		vendors: (
			patch: Partial<KernelVendorsState>,
			options?: { replaceSource?: VendorSource }
		) => void;
	};

	readonly commands: {
		init: () => Promise<InitResult>;
		save: (
			input?: SaveInput,
			context?: {
				categories?: readonly AllConsentNames[];
				actionAt?: number;
				iabAuthority?: KernelIABAuthority;
				vendors?: Record<string, boolean>;
				uiSource?: SaveUISource;
			}
		) => Promise<SaveResult>;
		dismissNotice: (context?: {
			actionAt?: number;
		}) => Promise<NoticeDismissResult>;
		identify: (user: KernelUser) => Promise<void>;
	};

	readonly events: {
		on: <E extends KernelEvent['type']>(
			type: E,
			listener: Listener<Extract<KernelEvent, { type: E }>>
		) => Unsubscribe;
	};
}
