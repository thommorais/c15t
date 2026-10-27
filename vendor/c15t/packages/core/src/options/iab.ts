import type { GlobalVendorList, NonIABVendor } from '../types';
import type { PublisherRestriction, TCFConsentData } from './iab-tcf';

export interface AdditionalConsentConfig {
	providers: number[];
	url?: string;
}

export interface IABConfig {
	enabled: boolean;
	cmpId?: number;
	cmpVersion?: number | string;
	vendors?: number[];
	customVendors?: NonIABVendor[];
	additionalConsent?: AdditionalConsentConfig;
	publisherCountryCode?: string;
	isServiceSpecific?: boolean;
	publisherRestrictions?: PublisherRestriction[];
	gvl?: GlobalVendorList;
}

export interface CMPApiConfig {
	cmpId?: number;
	cmpVersion?: number | string;
	gvl: GlobalVendorList;
	gdprApplies?: boolean;
	getAddtlConsent?: (tcString: string) => string | undefined;
}

export interface CMPApi {
	updateVendorList: (gvl: GlobalVendorList | null) => void;
	updateConsent: (
		tcString: string,
		consentData?: TCFConsentData,
		gdprApplies?: boolean
	) => void;
	setDisplayStatus: (status: 'visible' | 'hidden' | 'disabled') => void;
	loadFromStorage: () => string | null;
	saveToStorage: (tcString: string) => void;
	getTcString: () => string;
	destroy: () => void;
}

export interface FetchGVLResult {
	gvl: GlobalVendorList;
	fromCache: boolean;
}
