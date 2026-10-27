import type {
	ActiveUI,
	AllConsentNames,
	ConsentState,
	KernelBranding,
	Model,
	PolicyScopeMode,
	PreferencesPresentation,
	PromptPresentation,
	TranslationConfig,
} from '@c15t/core';

export interface ConsentStateFixture {
	activeUI: ActiveUI;
	branding: KernelBranding;
	consentCategories: AllConsentNames[];
	consents: ConsentState;
	model: Model;
	policyBanner: PromptPresentation;
	policyDialog: PreferencesPresentation;
	policyScopeMode: PolicyScopeMode | null;
	translationConfig: TranslationConfig;
	[field: string]: unknown;
}
