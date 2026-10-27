import type { PolicyRule, Vendor } from '@c15t/schema/types';
import type { I18nConfig } from '@c15t/translations';

import type { AllConsentNames } from '../consent/consent-types';
import type { StorageConfig } from '../libs/cookie';
import type {
	ConsentExperiment,
	ExperimentArmTheme,
	ExperimentState,
} from '../libs/experiment';
import type { ConsentJourneyOption, JourneyState } from '../libs/journey';
import type { ConsentPresentation } from '../libs/policy-actions';
import type {
	ClearOnRevocationConfig,
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
} from '../modules/clear-on-revocation/types';
import type {
	IframeBlockerHandle,
	IframeBlockerOptions,
} from '../modules/iframe-blocker/types';
import type {
	NetworkBlockerConfig,
	NetworkBlockerHandle,
	NetworkBlockerOptions,
	NetworkBlockerRule,
} from '../modules/network-blocker/types';
import type {
	PersistenceHandle,
	PersistenceOptions,
} from '../modules/persistence/types';
import type { RevocationReloadOptions } from '../modules/revocation-reload';
import type {
	Script,
	ScriptLoaderDebugEvent,
	ScriptLoaderHandle,
	ScriptLoaderOptions,
} from '../modules/script-loader/types';
import type {
	WindowDebugHandle,
	WindowDebugOptions,
} from '../modules/window-debug/types';
import type { Callbacks } from '../options/callbacks';
import type { IABConfig } from '../options/iab';
import type { User } from '../options/user';
import type { ProviderTransportFactory } from '../transports/mode';
import type {
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	GlobalVendorList,
	KernelConfig,
	KernelOverrides,
	KernelUser,
	Unsubscribe,
} from '../types';
import type { RuntimeIABMountOptions } from './iab-mount';

export interface RuntimeScriptLoaderOptions {
	onDebug?: (event: ScriptLoaderDebugEvent) => void;
	serverStart?: boolean;
}

export interface RuntimeNetworkBlockerOptions {
	rules: NetworkBlockerRule[];
	enabled?: boolean;
	logBlockedRequests?: boolean;
	onRequestBlocked?: NetworkBlockerConfig['onRequestBlocked'];
}

export type RuntimePersistenceOptions = Omit<PersistenceOptions, 'kernel'>;

export type RuntimeIABOptions =
	| (Omit<Partial<IABConfig>, 'gvl'> & {
			gvl?: GlobalVendorList | null;
			gvlURL?: string;
	  })
	| false;

export interface ConsentRuntimeIABFactoryOptions {
	kernel: ConsentKernel;
	cmpId: number;
	cmpVersion?: number;
	vendors?: number[];
	customVendors?: IABConfig['customVendors'];
	additionalConsent?: IABConfig['additionalConsent'];
	publisherCountryCode?: string;
	isServiceSpecific?: boolean;
	publisherRestrictions?: IABConfig['publisherRestrictions'];
	gvl?: GlobalVendorList | null;
	gvlURL?: string;
}

export interface ConsentRuntimeIABHandle {
	dispose: () => void;
	setVendorConsent: (vendorId: string | number, value: boolean) => void;
	setVendorLegitimateInterest: (
		vendorId: string | number,
		value: boolean
	) => void;
	setPurposeConsent: (purposeId: number, value: boolean) => void;
	setPurposeLegitimateInterest: (purposeId: number, value: boolean) => void;
	setSpecialFeatureOptIn: (featureId: number, value: boolean) => void;
	setAdTechProviderConsent?: (providerId: number, value: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	generateTCString: () => Promise<string>;
	save: () => Promise<void>;
	whenReady?: () => Promise<void>;
}

export type ConsentRuntimeIABFactory = (
	options: ConsentRuntimeIABFactoryOptions
) => ConsentRuntimeIABHandle;

export interface RuntimeGPPOptions {
	cmpId?: number;
	usApproach?: 'state' | 'national';
	usFallback?: 'usnat' | 'none';
	mspaMode?: 'opt-out-option' | 'service-provider';
	optOutCategories?: readonly AllConsentNames[];
	tcf?: boolean;
}

export interface ConsentRuntimeGPPFactoryOptions extends RuntimeGPPOptions {
	kernel: ConsentKernel;
}

export interface ConsentRuntimeGPPHandle {
	dispose: () => void;
}

export type ConsentRuntimeGPPFactory = (
	options: ConsentRuntimeGPPFactoryOptions
) => ConsentRuntimeGPPHandle;

export type GPPModuleLoader = () => Promise<{
	createGPP: ConsentRuntimeGPPFactory;
}>;

export interface ExternalConsentSource {
	getPermissions: () => Partial<ConsentState> | null;
	subscribe: (listener: () => void) => Unsubscribe;
	openPreferences: () => void | Promise<void>;
}

export type RuntimePrefetch = Omit<KernelConfig, 'transport' | 'initialDraft'> &
	ExperimentState &
	JourneyState;

export interface ConsentRuntimeModules {
	createPersistence: (options: PersistenceOptions) => PersistenceHandle;
	createScriptLoader: (options: ScriptLoaderOptions) => ScriptLoaderHandle;
	createNetworkBlocker: (
		options: NetworkBlockerOptions
	) => NetworkBlockerHandle;
	createIframeBlocker: (options: IframeBlockerOptions) => IframeBlockerHandle;
	createClearOnRevocation: (
		options: ClearOnRevocationOptions
	) => ClearOnRevocationHandle;
	watchRevocationReload: (options: RevocationReloadOptions) => () => void;
	createWindowDebug: (options: WindowDebugOptions) => WindowDebugHandle;
	connectConsentSource: (
		kernel: ConsentKernel,
		source: ExternalConsentSource
	) => Unsubscribe;
	mountIAB?: (options: RuntimeIABMountOptions) => () => void;
	streamPrefetch?: (
		mode: ProviderTransportFactory,
		prefetch: PromiseLike<RuntimePrefetch>,
		options: Pick<ConsentProviderRuntimeOptions, 'experiment' | 'overrides'>,
		getKernel: () => ConsentKernel | undefined
	) => ProviderTransportFactory;
	preloadScriptLoader?: (
		read: () => readonly [ConsentKernel, ConsentRuntimeOptions] | undefined,
		prefetch: ConsentProviderRuntimeOptions['prefetch'],
		createKernel: (options: ConsentRuntimeOptions) => ConsentKernel,
		createPersistence: ConsentRuntimeModules['createPersistence']
	) => void;
}

export interface ConsentRuntimeOptions {
	consentSource?: ExternalConsentSource;
	enabled?: boolean;
	mode: ProviderTransportFactory;
	storageConfig?: StorageConfig;
	clearOnRevocation?: ClearOnRevocationConfig;
	reloadOnConsentRevoked?: boolean;
	user?: User | KernelUser;
	overrides?: KernelOverrides;
	prefetch?: RuntimePrefetch;
	presentation?: ConsentPresentation;
	experiment?: ConsentExperiment;
	journey?: ConsentJourneyOption;
	theme?: ExperimentArmTheme;
	callbacks?: Pick<
		Callbacks,
		| 'onChoiceRecorded'
		| 'onPermissionsChanged'
		| 'onSurfaceShown'
		| 'onError'
		| 'onBeforeConsentRevocationReload'
	>;
	scripts?: Script[];
	vendors?: Vendor[];
	nonce?: string;
	scriptLoader?: RuntimeScriptLoaderOptions;
	networkBlocker?: RuntimeNetworkBlockerOptions | false;
	iframeBlocker?: Omit<IframeBlockerOptions, 'kernel'> | false;
	iab?: RuntimeIABOptions;
	createIAB?: ConsentRuntimeIABFactory;
	gpp?: RuntimeGPPOptions | boolean;
	loadGPP?: GPPModuleLoader;
	persistence?: boolean | RuntimePersistenceOptions;
	policyRules?: PolicyRule[];
	i18n?: Partial<I18nConfig>;
	consentCategories?: AllConsentNames[];
	windowDebug?: boolean;
	pkg?: string;
}

export interface ConsentProviderRuntimeOptions extends Omit<
	ConsentRuntimeOptions,
	'prefetch'
> {
	prefetch?: RuntimePrefetch | PromiseLike<RuntimePrefetch>;
}

export type ConsentRuntimeUpdate = Omit<ConsentProviderRuntimeOptions, 'mode'> &
	Partial<Pick<ConsentProviderRuntimeOptions, 'mode'>>;

export interface ConsentRuntime {
	readonly kernel: ConsentKernel;
	readonly experiment: ConsentExperiment | undefined;
	clearRecords: () => void;
	setLanguage: (language: string) => void;
	readonly iab: ConsentRuntimeIABHandle | null;
	readonly consentCategories: AllConsentNames[];
	readonly scripts: readonly Script[];
	readonly started: boolean;
	start: () => void;
	dispose: () => void;
	identify: (user: User | KernelUser | undefined) => Promise<void>;
	setOverrides: (overrides: KernelOverrides) => void;
	reinit: () => Promise<void>;
	reconcileStorage: () => boolean;
	processIframes: () => void;
	setConsentCategories: (categories: AllConsentNames[] | undefined) => void;
	subscribe: (listener: () => void) => Unsubscribe;
}

export interface StreamedPrefetch {
	readonly settled: PromiseLike<RuntimePrefetch | undefined>;
	snapshotFor: (config: RuntimePrefetch | undefined) => ConsentSnapshot;
	adopt: (config: RuntimePrefetch | undefined) => void;
}

export interface ConsentProviderRuntime extends ConsentRuntime {
	readonly kernel: ConsentKernel;
	readonly enabled: boolean;
	setEnabled: (enabled: boolean) => void;
	update: (options: ConsentRuntimeUpdate) => Promise<void>;
	subscribe: (listener: () => void) => Unsubscribe;
	readonly streamed?: StreamedPrefetch;
}
