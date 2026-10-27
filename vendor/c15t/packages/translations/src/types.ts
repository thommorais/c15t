export type AllConsentNames =
	| 'experience'
	| 'functionality'
	| 'marketing'
	| 'measurement'
	| 'necessary';

export interface CommonTranslations {
	acknowledge: string;
	acceptAll: string;
	rejectAll: string;
	customize: string;
	save: string;
	close: string;
	securedBy: string;
	dismiss: string;
}

export interface RightsTranslations {
	optOut: string;
	preferences: string;
}

export interface LegalLinksTranslations {
	privacyPolicy: string;
	cookiePolicy: string;
	termsOfService: string;
}

export interface CookieBannerTranslations {
	title: string;
	description: string;
	noticeTitle: string;
	noticeDescription: string;
}

export interface ConsentManagerDialogTranslations {
	title: string;
	description: string;
	vendors?: Partial<VendorListTranslations>;
}

export interface VendorListTranslations {
	title: string;
	privacyPolicy: string;
	disabledByCategory: string;
	switchLabel: string;
}

export interface ConsentTypeTranslations {
	title: string;
	description: string;
}

export interface ConsentGateTranslations {
	title: string;
	actionButton: string;
	policyBlocked: string;
	loading?: string;
	error?: string;
}

export type FrameTranslations = ConsentGateTranslations;

export interface IABBannerTranslations {
	title: string;
	description: string;
	partnersLink: string;
	andMore: string;
	legitimateInterestNotice: string;
	scopeServiceSpecific: string;
	scopeGroup: string;
}

export interface IABPreferenceCenterTranslations {
	title: string;
	description: string;
	tabs: {
		purposes: string;
		vendors: string;
	};
	purposeItem: {
		partners: string;
		vendorsUseLegitimateInterest: string;
		examples: string;
		partnersUsingPurpose: string;
		withYourPermission: string;
		legitimateInterest: string;
		objectButton: string;
		objected: string;
		rightToObject: string;
	};
	specialPurposes: {
		title: string;
		tooltip: string;
	};
	features?: {
		title: string;
		description: string;
	};
	vendorList: {
		search: string;
		showingCount: string;
		iabVendorsHeading: string;
		iabVendorsNotice: string;
		customVendorsHeading: string;
		customVendorsNotice: string;
		adTechProvidersHeading: string;
		adTechProvidersNotice: string;
		purposes: string;
		specialPurposes: string;
		specialFeatures: string;
		features: string;
		dataCategories: string;
		usesCookies: string;
		nonCookieAccess: string;
		maxAge: string;
		maxAgeRefreshes?: string;
		retention: string;
		retainedDays?: string;
		legitimateInterest: string;
		privacyPolicy: string;
		storageDisclosure: string;
		requiredNotice: string;
		noVendorsFound?: string;
		partnerCount?: string;
		partnerSingular?: string;
		partnerPlural?: string;
	};
	footer: {
		consentStorage: string;
	};
}

export interface IABCommonTranslations {
	acceptAll: string;
	rejectAll: string;
	customize: string;
	saveSettings: string;
	loading: string;
	showingSelectedVendor: string;
	clearSelection: string;
	customPartner: string;
}

export interface IABTranslations {
	banner: IABBannerTranslations;
	preferenceCenter: IABPreferenceCenterTranslations;
	common: IABCommonTranslations;
}

export type ConsentTypesTranslations = {
	[key in AllConsentNames]: ConsentTypeTranslations;
};

export interface CompleteTranslations {
	common: CommonTranslations;
	cookieBanner: CookieBannerTranslations;
	consentManagerDialog: ConsentManagerDialogTranslations;
	consentTypes: ConsentTypesTranslations;
	consentGate: ConsentGateTranslations;
	legalLinks: LegalLinksTranslations;
	iab: IABTranslations;
	rights: RightsTranslations;
}

export interface Translations {
	common: Partial<CommonTranslations>;
	cookieBanner: Partial<CookieBannerTranslations>;
	consentManagerDialog: Partial<ConsentManagerDialogTranslations>;
	consentTypes: {
		[key in AllConsentNames]?: Partial<ConsentTypeTranslations>;
	};
	consentGate?: Partial<ConsentGateTranslations>;
	frame?: Partial<ConsentGateTranslations>;
	legalLinks?: Partial<LegalLinksTranslations>;
	iab?: DeepPartial<IABTranslations>;
	rights?: Partial<RightsTranslations>;
}

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface TranslationConfig {
	translations: Record<string, Partial<Translations>>;
	defaultLanguage?: string;
	disableAutoLanguageSwitch?: boolean;
}

export interface I18nConfig {
	messages: Record<string, Partial<Translations>>;
	locale?: string;
	detectBrowserLanguage?: boolean;
}

export interface TranslationInputConfig extends Partial<TranslationConfig> {
	i18n?: Partial<I18nConfig>;
}
