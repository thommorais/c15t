import type { GlobalVendorList, PublisherRestriction } from '@c15t/core';

const CONSENT_ONLY_PURPOSES: readonly number[] = [1, 3, 4, 5, 6];

type Vendor = GlobalVendorList['vendors'][number];

const without = (list: readonly number[], purposeId: number): number[] =>
	list.filter((id) => id !== purposeId);

const including = (list: readonly number[], purposeId: number): number[] =>
	list.includes(purposeId) ? [...list] : [...list, purposeId];

const restrictVendor = function restrictVendor(
	vendor: Vendor,
	{ purposeId, restrictionType }: PublisherRestriction
): Vendor {
	const purposes = vendor.purposes ?? [];
	const legIntPurposes = vendor.legIntPurposes ?? [];
	const flexible = vendor.flexiblePurposes?.includes(purposeId) === true;
	const consent = purposes.includes(purposeId);
	const legitimateInterest = legIntPurposes.includes(purposeId);
	const remove = (): Vendor => ({
		...vendor,
		flexiblePurposes: without(vendor.flexiblePurposes ?? [], purposeId),
		legIntPurposes: without(legIntPurposes, purposeId),
		purposes: without(purposes, purposeId),
	});
	if (restrictionType === 0) {
		return consent || legitimateInterest ? remove() : vendor;
	}
	if (restrictionType === 1 && legitimateInterest) {
		return flexible
			? {
					...vendor,
					legIntPurposes: without(legIntPurposes, purposeId),
					purposes: including(purposes, purposeId),
				}
			: remove();
	}
	if (restrictionType === 2 && consent) {
		return flexible && !CONSENT_ONLY_PURPOSES.includes(purposeId)
			? {
					...vendor,
					legIntPurposes: including(legIntPurposes, purposeId),
					purposes: without(purposes, purposeId),
				}
			: remove();
	}
	return vendor;
};

export const applyPublisherRestrictionsToGVL =
	function applyPublisherRestrictionsToGVL(
		gvl: GlobalVendorList,
		restrictions: readonly PublisherRestriction[] | undefined
	): GlobalVendorList {
		if (!restrictions?.length) {
			return gvl;
		}
		let vendors: GlobalVendorList['vendors'] | null = null;
		for (const restriction of restrictions) {
			for (const vendorId of restriction.vendorIds) {
				const current = (vendors ?? gvl.vendors)[vendorId];
				if (!current) {
					continue;
				}
				const next = restrictVendor(current, restriction);
				if (next !== current) {
					vendors ??= { ...gvl.vendors };
					vendors[vendorId] = next;
				}
			}
		}
		return vendors ? { ...gvl, vendors } : gvl;
	};

export interface IntroducedLegitimateInterest {
	purposes: number[];
	vendors: number[];
}

export const introducedLegitimateInterest =
	function introducedLegitimateInterest(
		gvl: GlobalVendorList,
		restrictions: readonly PublisherRestriction[] | undefined
	): IntroducedLegitimateInterest {
		const effective = applyPublisherRestrictionsToGVL(
			gvl,
			restrictions
		).vendors;
		const purposes = new Set<number>();
		const vendors = new Set<number>();
		for (const { purposeId, restrictionType, vendorIds } of restrictions ??
			[]) {
			if (restrictionType !== 2) {
				continue;
			}
			for (const vendorId of vendorIds) {
				const before = gvl.vendors[vendorId]?.legIntPurposes ?? [];
				const after = effective[vendorId]?.legIntPurposes ?? [];
				if (after.includes(purposeId) && !before.includes(purposeId)) {
					purposes.add(purposeId);
					vendors.add(vendorId);
				}
			}
		}
		const sorted = (ids: Set<number>) => [...ids].sort((a, b) => a - b);
		return { purposes: sorted(purposes), vendors: sorted(vendors) };
	};
