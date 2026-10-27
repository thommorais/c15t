import type {
	AdTechProvider,
	KernelIABState,
	GlobalVendorList,
	NonIABVendor,
	PublisherRestriction,
} from '@c15t/core';

export type HeadlessIABBannerAction = 'accept' | 'reject' | 'customize';
export type HeadlessIABDialogAction = 'accept' | 'reject' | 'customize';
export type HeadlessIABPreferenceTab = 'purposes' | 'vendors';
export type HeadlessIABVendorId = number | string;

export interface HeadlessIABStateInput {
	gvl: GlobalVendorList | null;
	gvlReference?: KernelIABState['gvlReference'];
	isLoadingGVL?: boolean;
	nonIABVendors?: NonIABVendor[];
	customVendors?: NonIABVendor[];
	adTechProviders?: AdTechProvider[];
	publisherRestrictions?: readonly PublisherRestriction[];
	language?: string;
}

export interface HeadlessIABBannerState {
	isReady: boolean;
	vendorCount: number;
	displayItems: string[];
	remainingCount: number;
}

export interface HeadlessIABDialogState {
	isLoading: boolean;
	activeTab: HeadlessIABPreferenceTab;
}

export interface HeadlessIABProcessedVendor {
	id: HeadlessIABVendorId;
	name: string;
	policyUrl: string;
	usesNonCookieAccess: boolean;
	deviceStorageDisclosureUrl: string | null;
	usesCookies: boolean;
	cookieMaxAgeSeconds: number | null;
	cookieRefresh?: boolean;
	specialPurposes: number[];
	specialFeatures: number[];
	features: number[];
	purposes: number[];
	legIntPurposes: number[];
	legitimateInterestUrl?: string | null;
	isCustom?: boolean;
	usesLegitimateInterest?: boolean;
	dataRetention?: {
		purposes?: Record<number, number>;
		specialPurposes?: Record<number, number>;
		stdRetention?: number;
	};
	dataDeclaration?: number[];
}

export interface HeadlessIABProcessedPurpose {
	id: number;
	name: string;
	description: string;
	descriptionLegal?: string;
	illustrations: string[];
	vendors: HeadlessIABProcessedVendor[];
	isSpecialPurpose?: boolean;
	neededByAdTechProviders?: boolean;
	adTechProviders?: AdTechProvider[];
}

export interface HeadlessIABProcessedSpecialFeature {
	id: number;
	name: string;
	description: string;
	descriptionLegal?: string;
	illustrations: string[];
	vendors: HeadlessIABProcessedVendor[];
}

export interface HeadlessIABProcessedFeature {
	id: number;
	name: string;
	description: string;
	descriptionLegal?: string;
	illustrations: string[];
	vendors: HeadlessIABProcessedVendor[];
}

export interface HeadlessIABProcessedStack {
	id: number;
	name: string;
	description: string;
	purposes: HeadlessIABProcessedPurpose[];
}

export interface HeadlessIABDialogData {
	purposes: HeadlessIABProcessedPurpose[];
	specialPurposes: HeadlessIABProcessedPurpose[];
	specialFeatures: HeadlessIABProcessedSpecialFeature[];
	features: HeadlessIABProcessedFeature[];
	stacks: HeadlessIABProcessedStack[];
	standalonePurposes: HeadlessIABProcessedPurpose[];
	totalVendors: number;
	isLoading: boolean;
	isReady: boolean;
}
