import type {
	AllConsentNames,
	Callbacks,
	I18nConfig,
	IABConfig,
	LegalLinks,
	NetworkBlockerConfig,
	Overrides,
	ProviderTransportFactory,
	Script,
	SSRInitialData,
	StorageConfig,
	TranslationConfig,
	User,
} from '@c15t/core';

import type { UIOptions } from '../theme/types';

export interface CommonTransportOptions {
	mode?: ProviderTransportFactory;
}

export interface CommonInlineStoreOptions {
	enabled?: boolean;

	callbacks?: Callbacks;

	scripts?: Script[];

	nonce?: string;

	legalLinks?: LegalLinks;

	storageConfig?: StorageConfig;

	user?: User;

	overrides?: Overrides;

	networkBlocker?: NetworkBlockerConfig;

	iab?: IABConfig;

	ssrData?: Promise<SSRInitialData | undefined>;
}

export interface ConsentManagerContentOptions {
	i18n?: Partial<I18nConfig>;

	translations?: Partial<TranslationConfig>;

	consentCategories?: AllConsentNames[];
}

export type BaseConsentManagerOptions = CommonTransportOptions &
	CommonInlineStoreOptions &
	UIOptions &
	ConsentManagerContentOptions;
