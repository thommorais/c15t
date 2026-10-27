import type { GlobalVendorList } from '@c15t/schema/types';

export type {
	GlobalVendorList,
	GVLDataCategory,
	GVLFeature,
	GVLPurpose,
	GVLSpecialFeature,
	GVLSpecialPurpose,
	GVLStack,
	GVLStandardTexts,
	GVLVendor,
	GVLVendorUrl,
} from '@c15t/schema/types';

export interface TCFConsentData {
	purposeConsents: Record<number, boolean>;

	purposeLegitimateInterests: Record<number, boolean>;

	vendorConsents: Record<string, boolean>;

	vendorLegitimateInterests: Record<string, boolean>;

	specialFeatureOptIns: Record<number, boolean>;

	vendorsDisclosed: Record<number, boolean>;

	publisherRestrictions?: PublisherRestriction[];
}

export interface PublisherRestriction {
	purposeId: number;

	restrictionType: 0 | 1 | 2;

	vendorIds: number[];
}

export type CMPStatus = 'stub' | 'loading' | 'loaded' | 'error';

export type DisplayStatus = 'visible' | 'hidden' | 'disabled';

export type EventStatus =
	| 'tcloaded'
	| 'cmpuishown'
	| 'useractioncomplete'
	| 'visible';

export interface PingData {
	gdprApplies: boolean | undefined;

	cmpLoaded: boolean;

	cmpStatus: CMPStatus;

	displayStatus: DisplayStatus;

	apiVersion: string;

	cmpVersion: string;

	cmpId: number;

	gvlVersion: number;

	tcfPolicyVersion: number;
}

export interface TCData {
	tcString: string;

	addtlConsent?: string;

	tcfPolicyVersion?: number;

	cmpId?: number;

	cmpVersion?: number;

	gdprApplies: true;

	listenerId?: number;

	eventStatus?: EventStatus;

	cmpStatus: CMPStatus;

	isServiceSpecific: boolean;

	useNonStandardTexts: boolean;

	publisherCC: string;

	purposeOneTreatment: boolean;

	purpose: {
		consents: Record<number, boolean>;
		legitimateInterests: Record<number, boolean>;
	};

	vendor: {
		consents: Record<number, boolean>;
		legitimateInterests: Record<number, boolean>;
		disclosedVendors: Record<string | number, boolean>;
	};

	specialFeatureOptins: Record<number, boolean>;

	publisher: {
		consents: Record<number, boolean>;
		legitimateInterests: Record<number, boolean>;
		customPurpose: {
			consents: Record<number, boolean>;
			legitimateInterests: Record<number, boolean>;
		};
		restrictions: Record<number, Record<number, number>>;
	};
}

export interface TCDataOutsideTCF {
	gdprApplies: false;

	tcfPolicyVersion: number;

	cmpId: number;

	cmpVersion: number;

	cmpStatus: CMPStatus;

	eventStatus?: EventStatus;

	listenerId?: number;
}

export type TCFApiCallback<
	T = TCData | TCDataOutsideTCF | PingData | GlobalVendorList | boolean,
> = (data: T | null, success: boolean) => void;

export interface TCFApi {
	(command: 'ping', version: number, callback: TCFApiCallback<PingData>): void;
	(
		command: 'getTCData',
		version: number,
		callback: TCFApiCallback<TCData | TCDataOutsideTCF>,
		vendorIds?: number[]
	): void;
	(
		command: 'getInAppTCData' | 'addEventListener',
		version: number,
		callback: TCFApiCallback<TCData | TCDataOutsideTCF>
	): void;
	(
		command: 'getVendorList',
		version: number,
		callback: TCFApiCallback<GlobalVendorList>,
		vendorListVersion?: number
	): void;
	(
		command: 'removeEventListener',
		version: number,
		callback: TCFApiCallback<boolean>,
		listenerId: number
	): void;
	queue?: Parameters<TCFApi>[];
}
declare global {
	interface Window {
		__tcfapi?: TCFApi;
	}
}

export const IAB_PURPOSES = {
	CREATE_AD_PROFILE: 3,
	CREATE_CONTENT_PROFILE: 5,
	MARKET_RESEARCH: 9,
	MEASURE_AD_PERFORMANCE: 7,
	MEASURE_CONTENT_PERFORMANCE: 8,
	PRODUCT_DEVELOPMENT: 10,
	SELECT_BASIC_ADS: 2,
	SELECT_BASIC_CONTENT: 11,
	SELECT_PERSONALISED_ADS: 4,
	SELECT_PERSONALISED_CONTENT: 6,
	STORE_ACCESS_INFO: 1,
} as const;

export const IAB_SPECIAL_FEATURES = {
	DEVICE_SCANNING: 2,
	PRECISE_GEOLOCATION: 1,
} as const;

export const IAB_FEATURES = {
	IDENTIFY_DEVICES: 3,
	LINK_DEVICES: 2,
	MATCH_COMBINE_DATA: 1,
} as const;

export const IAB_DATA_CATEGORIES = {
	AUTH_IDENTIFIERS: 5,
	BROWSING_DATA: 6,
	DEVICE_CHARACTERISTICS: 2,
	DEVICE_IDENTIFIERS: 3,
	IP_ADDRESSES: 1,
	NON_PRECISE_LOCATION: 8,
	PRECISE_LOCATION: 9,
	PRIVACY_CHOICES: 11,
	PROBABILISTIC_IDENTIFIERS: 4,
	USER_PROFILES: 10,
	USER_PROVIDED_DATA: 7,
} as const;
