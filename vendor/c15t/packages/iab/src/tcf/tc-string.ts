import type { GlobalVendorList } from '@c15t/core';
import type { PurposeRestrictionVector } from '@iabtechlabtcf/core';

import type { PublisherRestriction, TCFConsentData } from './iab-tcf-types';
import { getTCFCore } from './lazy-load';
import {
	PublisherRestrictionError,
	validatePublisherRestrictions,
} from './publisher-restrictions';

export const getDisclosedVendorIds = function getDisclosedVendorIds(
	vendorsDisclosed: Record<string | number, boolean>
): number[] {
	return Object.entries(vendorsDisclosed)
		.filter(
			([vendorId, value]) =>
				value && /^\d+$/u.test(vendorId) && Number(vendorId) > 0
		)
		.map(([vendorId]) => Number(vendorId));
};

let warnedServiceSpecific = false;

export const resolveIsServiceSpecific = function resolveIsServiceSpecific(
	value: boolean | undefined
): true {
	if (value === false && !warnedServiceSpecific) {
		warnedServiceSpecific = true;
		console.warn(
			'[c15t] `isServiceSpecific: false` is deprecated and ignored. TCF requires IsServiceSpecific=1, so c15t always encodes TC strings as service-specific.'
		);
	}
	return true;
};

export interface TCStringConfig {
	confirmedAt?: number;
	cmpId: number;

	cmpVersion?: number | string;

	consentScreen?: number;

	consentLanguage?: string;

	publisherCountryCode?: string;

	isServiceSpecific?: boolean;
}

// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
export const generateTCString = async function generateTCString(
	consentData: TCFConsentData,
	gvlData: GlobalVendorList,
	config: TCStringConfig
): Promise<string> {
	const now = Date.now();
	const confirmedAt =
		config.confirmedAt === undefined ? now : config.confirmedAt;
	if (
		!Number.isSafeInteger(confirmedAt) ||
		confirmedAt < 0 ||
		confirmedAt > now
	) {
		throw new TypeError(
			'TC confirmation time must be a valid past or current timestamp.'
		);
	}
	const isServiceSpecific = resolveIsServiceSpecific(config.isServiceSpecific);
	const publisherRestrictions = validatePublisherRestrictions(
		consentData.publisherRestrictions,
		{ gvl: gvlData }
	);
	const { TCModel, TCString, GVL, PurposeRestriction } = await getTCFCore();

	// oxlint-disable-next-line typescript/no-explicit-any -- GVL library types don't match our domain types
	const gvl = new GVL(gvlData as any);

	const tcModel = new TCModel(gvl);
	const confirmedDay = new Date(
		Math.floor(confirmedAt / 86_400_000) * 86_400_000
	);
	tcModel.created = confirmedDay;
	tcModel.lastUpdated = confirmedDay;

	tcModel.cmpId = config.cmpId;
	tcModel.cmpVersion =
		typeof config.cmpVersion === 'number'
			? config.cmpVersion
			: Number.parseInt(String(config.cmpVersion ?? '1'), 10) || 1;
	tcModel.consentScreen = config.consentScreen ?? 1;
	tcModel.consentLanguage = config.consentLanguage ?? 'EN';
	tcModel.publisherCountryCode = config.publisherCountryCode ?? 'US';
	tcModel.isServiceSpecific = isServiceSpecific;

	for (const [purposeId, value] of Object.entries(
		consentData.purposeConsents
	)) {
		if (value) {
			tcModel.purposeConsents.set(Number(purposeId));
		}
	}

	for (const [purposeId, value] of Object.entries(
		consentData.purposeLegitimateInterests
	)) {
		if (value) {
			tcModel.purposeLegitimateInterests.set(Number(purposeId));
		}
	}

	for (const [vendorId, value] of Object.entries(consentData.vendorConsents)) {
		const numericVendorId = Number(vendorId);
		if (value && Number.isFinite(numericVendorId)) {
			tcModel.vendorConsents.set(numericVendorId);
		}
	}

	for (const [vendorId, value] of Object.entries(
		consentData.vendorLegitimateInterests
	)) {
		const numericVendorId = Number(vendorId);
		if (value && Number.isFinite(numericVendorId)) {
			tcModel.vendorLegitimateInterests.set(numericVendorId);
		}
	}

	for (const [featureId, value] of Object.entries(
		consentData.specialFeatureOptIns
	)) {
		if (value) {
			tcModel.specialFeatureOptins.set(Number(featureId));
		}
	}

	for (const vendorId of getDisclosedVendorIds(consentData.vendorsDisclosed)) {
		tcModel.vendorsDisclosed.set(vendorId);
	}

	for (const {
		purposeId,
		restrictionType,
		vendorIds,
	} of publisherRestrictions) {
		const restriction = new PurposeRestriction(purposeId, restrictionType);
		for (const vendorId of vendorIds) {
			tcModel.publisherRestrictions.add(vendorId, restriction);
			if (
				tcModel.publisherRestrictions.getRestrictionType(
					vendorId,
					purposeId
				) !== restrictionType
			) {
				throw new PublisherRestrictionError(
					`The TC string encoder rejected restriction type ${restrictionType} for vendor ${vendorId} and purpose ${purposeId}.`
				);
			}
		}
	}

	return TCString.encode(tcModel);
};

const readPublisherRestrictions = function readPublisherRestrictions(
	vector: PurposeRestrictionVector,
	isServiceSpecific: boolean,
	policyVersion: number
): PublisherRestriction[] {
	const restrictions = vector.getRestrictions();
	if (restrictions.length > 0 && !isServiceSpecific) {
		throw new PublisherRestrictionError(
			'Publisher restrictions are only allowed in service-specific TC strings.'
		);
	}
	return validatePublisherRestrictions(
		restrictions.map((restriction) => ({
			purposeId: restriction.purposeId,
			restrictionType: restriction.restrictionType,
			vendorIds: vector.getVendors(restriction),
		})),
		{ policyVersion }
	);
};

export interface DecodedTCString {
	cmpId: number;

	cmpVersion: number;

	consentLanguage: string;

	isServiceSpecific: boolean;

	purposeConsents: Record<number, boolean>;

	purposeLegitimateInterests: Record<number, boolean>;

	vendorConsents: Record<number, boolean>;

	vendorLegitimateInterests: Record<number, boolean>;

	specialFeatureOptIns: Record<number, boolean>;

	vendorsDisclosed: Record<number, boolean>;

	created: Date;

	lastUpdated: Date;

	vendorListVersion: number;

	policyVersion: number;

	publisherRestrictions: PublisherRestriction[];
}

export const decodeTCString = async function decodeTCString(
	tcString: string
): Promise<DecodedTCString> {
	const { TCString } = await getTCFCore();

	const tcModel = TCString.decode(tcString);

	const vectorToRecord = (
		vector: { has: (id: number) => boolean },
		maxId: number
	): Record<number, boolean> => {
		const record: Record<number, boolean> = {};
		for (let i = 1; i <= maxId; i += 1) {
			if (vector.has(i)) {
				record[i] = true;
			}
		}
		return record;
	};

	return {
		cmpId: tcModel.cmpId as number,
		cmpVersion: tcModel.cmpVersion as number,
		consentLanguage: tcModel.consentLanguage,
		created: tcModel.created,
		isServiceSpecific: tcModel.isServiceSpecific,
		lastUpdated: tcModel.lastUpdated,
		policyVersion: tcModel.policyVersion as number,
		publisherRestrictions: readPublisherRestrictions(
			tcModel.publisherRestrictions,
			tcModel.isServiceSpecific,
			tcModel.policyVersion as number
		),
		purposeConsents: vectorToRecord(tcModel.purposeConsents, 11),
		purposeLegitimateInterests: vectorToRecord(
			tcModel.purposeLegitimateInterests,
			11
		),
		specialFeatureOptIns: vectorToRecord(tcModel.specialFeatureOptins, 2),
		vendorConsents: vectorToRecord(
			tcModel.vendorConsents,
			tcModel.vendorConsents.maxId
		),
		vendorLegitimateInterests: vectorToRecord(
			tcModel.vendorLegitimateInterests,
			tcModel.vendorLegitimateInterests.maxId
		),
		vendorListVersion: tcModel.vendorListVersion as number,
		vendorsDisclosed: vectorToRecord(
			tcModel.vendorsDisclosed,
			tcModel.vendorsDisclosed.maxId
		),
	};
};

export const isValidTCStringFormat = function isValidTCStringFormat(
	tcString: string
): boolean {
	if (!tcString || typeof tcString !== 'string') {
		return false;
	}

	const base64urlRegex = /^[A-Za-z0-9_-]+$/u;
	if (!base64urlRegex.test(tcString)) {
		return false;
	}

	if (tcString.length < 10) {
		return false;
	}

	return true;
};

export const hasVendorConsent = async function hasVendorConsent(
	tcString: string,
	vendorId: number
): Promise<boolean> {
	const decoded = await decodeTCString(tcString);
	return decoded.vendorConsents[vendorId] === true;
};

export const hasPurposeConsent = async function hasPurposeConsent(
	tcString: string,
	purposeId: number
): Promise<boolean> {
	const decoded = await decodeTCString(tcString);
	return decoded.purposeConsents[purposeId] === true;
};
