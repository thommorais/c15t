import { AD_TECH_PROVIDER_PURPOSES } from '@c15t/schema/types';

import type { KernelIABState } from '../types';

type HeadlessIABStateInput = Pick<KernelIABState, 'gvl'> &
	Partial<Pick<KernelIABState, 'customVendors' | 'adTechProviders'>> & {
		gvlReference?: KernelIABState['gvlReference'];
		nonIABVendors?: KernelIABState['customVendors'];
	};

export interface HeadlessIABBannerState {
	isReady: boolean;
	vendorCount: number;
	displayItems: string[];
	remainingCount: number;
}

export const IAB_BANNER_MAX_DISPLAY_ITEMS = 5;

const STANDALONE_PURPOSE_ID = 1;

export interface ResolveIABBannerSummaryOptions {
	maxItems?: number;
}

const referencedSummary = (
	iab: HeadlessIABStateInput | null,
	maxItems: number
): HeadlessIABBannerState => {
	if (iab?.gvlReference?.summary) {
		const { items, vendorCount } = iab.gvlReference.summary;
		return {
			displayItems: items.slice(0, maxItems),
			isReady: true,
			remainingCount: Math.max(0, items.length - maxItems),
			vendorCount:
				vendorCount +
				(iab.nonIABVendors ?? iab.customVendors ?? []).length +
				(iab.adTechProviders?.length ?? 0),
		};
	}
	return {
		displayItems: [],
		isReady: false,
		remainingCount: 0,
		vendorCount: 0,
	};
};

const declaredPurposes = (
	gvl: NonNullable<HeadlessIABStateInput['gvl']>,
	adTechProviders: HeadlessIABStateInput['adTechProviders']
): { id: number; name: string }[] => {
	const providerPurposes = new Set<number>(
		adTechProviders?.length ? AD_TECH_PROVIDER_PURPOSES : []
	);
	return Object.entries(gvl.purposes)
		.filter(
			([id]) =>
				providerPurposes.has(Number(id)) ||
				Object.values(gvl.vendors).some(
					(vendor) =>
						vendor.purposes?.includes(Number(id)) ||
						vendor.legIntPurposes?.includes(Number(id))
				)
		)
		.map(([id, purpose]) => ({ id: Number(id), name: purpose.name }));
};

export const resolveIABBannerSummary = function resolveIABBannerSummary(
	iab: HeadlessIABStateInput | null,
	options: ResolveIABBannerSummaryOptions = {}
): HeadlessIABBannerState {
	const maxItems = options.maxItems ?? IAB_BANNER_MAX_DISPLAY_ITEMS;
	if (!iab?.gvl) {
		return referencedSummary(iab, maxItems);
	}

	const { gvl } = iab;
	const customVendors = iab.nonIABVendors ?? iab.customVendors ?? [];
	const vendorCount =
		Object.keys(gvl.vendors).length +
		customVendors.length +
		(iab.adTechProviders?.length ?? 0);

	const purposesWithVendors = declaredPurposes(gvl, iab.adTechProviders);

	const standalonePurpose = purposesWithVendors.find(
		(purpose) => purpose.id === STANDALONE_PURPOSE_ID
	);
	const otherPurposes = purposesWithVendors.filter(
		(purpose) => purpose.id !== STANDALONE_PURPOSE_ID
	);
	const otherPurposeIds = new Set(otherPurposes.map((purpose) => purpose.id));

	const stackScores: {
		name: string;
		coveredPurposeIds: number[];
		score: number;
	}[] = [];

	for (const stack of Object.values(gvl.stacks || {})) {
		const coveredPurposeIds = stack.purposes.filter((purposeId) =>
			otherPurposeIds.has(purposeId)
		);
		if (coveredPurposeIds.length >= 2) {
			stackScores.push({
				coveredPurposeIds,
				name: stack.name,
				score: coveredPurposeIds.length,
			});
		}
	}

	stackScores.sort((a, b) => b.score - a.score);

	const selectedStacks: string[] = [];
	const assignedPurposeIds = new Set<number>();
	for (const { name, coveredPurposeIds } of stackScores) {
		const unassignedPurposes = coveredPurposeIds.filter(
			(purposeId) => !assignedPurposeIds.has(purposeId)
		);
		if (unassignedPurposes.length >= 2) {
			selectedStacks.push(name);
			for (const purposeId of unassignedPurposes) {
				assignedPurposeIds.add(purposeId);
			}
		}
	}

	const uncoveredPurposes = otherPurposes.filter(
		(purpose) => !assignedPurposeIds.has(purpose.id)
	);

	const specialFeaturesWithVendors = Object.entries(gvl.specialFeatures || {})
		.filter(([id]) =>
			Object.values(gvl.vendors).some((vendor) =>
				vendor.specialFeatures?.includes(Number(id))
			)
		)
		.map(([, feature]) => feature.name);

	const items: string[] = [];
	if (standalonePurpose) {
		items.push(standalonePurpose.name);
	}
	for (const stackName of selectedStacks) {
		items.push(stackName);
	}
	for (const purpose of uncoveredPurposes) {
		items.push(purpose.name);
	}
	for (const featureName of specialFeaturesWithVendors) {
		items.push(featureName);
	}

	return {
		displayItems: items.slice(0, maxItems),
		isReady: true,
		remainingCount: Math.max(0, items.length - maxItems),
		vendorCount,
	};
};
