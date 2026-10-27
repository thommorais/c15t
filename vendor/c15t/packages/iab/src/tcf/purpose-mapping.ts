import type { AllConsentNames } from '@c15t/core';

export const IAB_PURPOSE_TO_C15T_MAP: Record<number, AllConsentNames> = {
	1: 'necessary',
	10: 'functionality',
	11: 'functionality',
	2: 'marketing',
	3: 'marketing',
	4: 'marketing',
	5: 'experience',
	6: 'experience',
	7: 'measurement',
	8: 'measurement',
	9: 'measurement',
};

export const C15T_TO_IAB_PURPOSE_MAP: Record<AllConsentNames, number[]> = {
	experience: [5, 6],
	functionality: [10, 11],
	marketing: [2, 3, 4],
	measurement: [7, 8, 9],
	necessary: [1],
};

export const iabPurposeToC15t = function iabPurposeToC15t(
	purposeId: number
): AllConsentNames | null {
	return IAB_PURPOSE_TO_C15T_MAP[purposeId] ?? null;
};

export const c15tToIabPurposes = function c15tToIabPurposes(
	category: AllConsentNames
): number[] {
	return C15T_TO_IAB_PURPOSE_MAP[category] ?? [];
};

export const c15tConsentsToIabPurposes = function c15tConsentsToIabPurposes(
	consents: Record<AllConsentNames, boolean>
): Record<number, boolean> {
	const purposeConsents: Record<number, boolean> = {};

	for (const [category, value] of Object.entries(consents)) {
		const purposes = C15T_TO_IAB_PURPOSE_MAP[category as AllConsentNames];
		if (purposes) {
			for (const purposeId of purposes) {
				purposeConsents[purposeId] = value;
			}
		}
	}

	return purposeConsents;
};

export const iabPurposesToC15tConsents = function iabPurposesToC15tConsents(
	purposeConsents: Record<number, boolean>,
	consentPurposes?: ReadonlySet<number>
): Record<AllConsentNames, boolean> {
	const c15tConsents: Record<AllConsentNames, boolean> = {
		experience: false,
		functionality: false,
		marketing: false,
		measurement: false,
		necessary: true,
	};

	for (const [category, purposes] of Object.entries(C15T_TO_IAB_PURPOSE_MAP)) {
		if (category === 'necessary') {
			continue;
		}
		const deciding = consentPurposes
			? purposes.filter((purposeId) => consentPurposes.has(purposeId))
			: [];
		const allConsented = (deciding.length ? deciding : purposes).every(
			(purposeId) => purposeConsents[purposeId] === true
		);
		c15tConsents[category as AllConsentNames] = allConsented;
	}

	return c15tConsents;
};

export const categorizeVendorPurposes = function categorizeVendorPurposes(
	vendorPurposes: number[],
	vendorLegIntPurposes: number[] = []
): {
	consentRequired: number[];
	legitInterest: number[];
	all: number[];
} {
	return {
		all: [...new Set([...vendorPurposes, ...vendorLegIntPurposes])],
		consentRequired: vendorPurposes,
		legitInterest: vendorLegIntPurposes,
	};
};

export const vendorHasRequiredConsents = function vendorHasRequiredConsents(
	vendorPurposes: number[],
	vendorLegIntPurposes: number[],
	purposeConsents: Record<number, boolean>,
	purposeLegitInterests: Record<number, boolean>
): boolean {
	const hasAllConsents = vendorPurposes.every(
		(purposeId) => purposeConsents[purposeId] === true
	);

	const hasAllLegitInterests = vendorLegIntPurposes.every(
		(purposeId) => purposeLegitInterests[purposeId] === true
	);

	return hasAllConsents && hasAllLegitInterests;
};
