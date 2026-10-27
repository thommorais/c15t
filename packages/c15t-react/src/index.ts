export type {
	AllConsentNames,
	ClearOnRevocationConfig,
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	HostedTransportOptions,
	InitContext,
	InitResponse,
	InitResult,
	KernelConfig,
	KernelEvent,
	KernelOverrides,
	KernelTransport,
	KernelUser,
	Listener,
	HostedModeOptions,
	PolicyRule,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
	SavePayload,
	SaveResult,
	Unsubscribe,
} from '@c15t/core';
export type { OfflineModeOptions } from './transports/offline';
export type {
	ConsentBannerButton,
	ConsentBannerLayout,
	ConsentBannerProps,
	ConsentBannerRight,
	ConsentBannerRightLinkProps,
	ConsentBannerRightsProps,
	ConsentBannerSurface,
} from './components/prompt';
export type {
	ConsentDialogCompoundComponent,
	ConsentDialogProps,
} from './components/panel';
export type { ConsentDialogLinkProps } from './components/panel-link';
export type {
	ConsentDialogTriggerProps,
	ConsentDialogTriggerToolbarAction,
	ConsentDialogTriggerToolbarPreferences,
	ConsentDialogTriggerToolbarProps,
	TriggerOrientation,
} from './components/panel-trigger';
export type {
	ConsentWidgetCompoundComponent,
	ConsentWidgetProps,
} from './components/preferences';
export type { ConsentGateProps, FrameProps } from './components/consent-gate';
export type {
	ConsentDraftHandle,
	ConsentDraftProviderProps,
	VendorDraftHandle,
} from './draft';
export type {
	EventDispatcher,
	EventProperties,
	UseEventDispatcherOptions,
} from './event-dispatcher';
export type {
	UseIframeBlockerOptions,
	UseNetworkBlockerOptions,
	UsePersistenceOptions,
	UseScriptLoaderOptions,
} from './module-hooks';
export type {
	ConsentProviderOptions,
	ConsentProviderCallbacks,
	ConsentProviderPrefetch,
	ConsentProviderProps,
	ExternalRuntimeProviderOptions,
	ExternalRuntimeProviderProps,
	OwnedRuntimeProviderProps,
} from './provider';
export type { ConsentThemeProps } from './consent-theme';
export type { Theme } from './types/theme';
export type { ConsentBannerCompoundComponent } from './components/prompt';
export type { ReactUIOptions } from './types/manager';

export type {
	ConsentPresentation,
	PromptPresentation,
	PreferencesPresentation,
	PresentationAction,
	PromptPosition,
	PromptVariant,
	ResolvedConsentPresentation,
} from '@c15t/core';

// oxlint-disable oxc/no-barrel-file -- The package entry; star exports keep unused groups out of esbuild's first chunk.
export * from './index-parts/core';
export * from './index-parts/hosted';
export * from './index-parts/offline';
export * from './index-parts/presets';
export * from './index-parts/consent-dialog';
export * from './index-parts/consent-banner';
export * from './index-parts/consent-dialog-link';
export * from './index-parts/consent-dialog-trigger';
export * from './index-parts/consent-gate';
export * from './index-parts/frame';
export * from './index-parts/draft';
export * from './index-parts/event-dispatcher';
export * from './index-parts/translations';
export * from './index-parts/module-hooks';
export * from './index-parts/provider';
export * from './index-parts/theme';
export * from './index-parts/hooks';
