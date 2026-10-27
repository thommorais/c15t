import type { AdTechProvider } from '@c15t/core';

import { processGVLForDialog } from './dialog-data';
import type {
	HeadlessIABDialogData,
	HeadlessIABProcessedPurpose,
	HeadlessIABProcessedVendor,
	HeadlessIABStateInput,
} from './types';

export type HeadlessIABDisplayRowKind =
	| 'purpose'
	| 'stack'
	| 'special-feature'
	| 'special-purpose'
	| 'feature';

export type HeadlessIABDisplayToggle = 'purpose' | 'special-feature' | 'none';

export interface HeadlessIABDisplayRow {
	kind: Exclude<HeadlessIABDisplayRowKind, 'stack'>;
	id: number;
	testId: string;
	name: string;
	description: string;
	illustrations: string[];
	vendors: HeadlessIABProcessedVendor[];
	adTechProviders?: AdTechProvider[];
	locked: boolean;
	toggle: HeadlessIABDisplayToggle;
	hasConsentBasis: boolean;
}

export interface HeadlessIABDisplayStackRow {
	kind: 'stack';
	id: number;
	testId: string;
	name: string;
	description: string;
	purposes: HeadlessIABDisplayRow[];
}

export type HeadlessIABDisplayConsentRow =
	| HeadlessIABDisplayRow
	| HeadlessIABDisplayStackRow;

export interface HeadlessIABDialogDisplayModel {
	consentRows: HeadlessIABDisplayConsentRow[];
	essentialRows: HeadlessIABDisplayRow[];
	featureRows: HeadlessIABDisplayRow[];
	featuresStandardText: string | null;
	purposeTabCount: number;
	vendorTabCount: number;
	essentialPartnerCount: number;
	isLoading: boolean;
	isReady: boolean;
	data: HeadlessIABDialogData;
}

const TEST_ID_PREFIX: Record<HeadlessIABDisplayRowKind, string> = {
	feature: 'feature-item',
	purpose: 'purpose-item',
	'special-feature': 'special-feature-item',
	'special-purpose': 'special-purpose-item',
	stack: 'stack-item',
};

export const iabDisplayTestId = function iabDisplayTestId(
	kind: HeadlessIABDisplayRowKind,
	id: number
): string {
	return `${TEST_ID_PREFIX[kind]}-${id}`;
};

export const countIABPartners = function countIABPartners(
	purposes: readonly {
		readonly adTechProviders?: readonly Pick<AdTechProvider, 'id'>[];
		readonly vendors: readonly Pick<HeadlessIABProcessedVendor, 'id'>[];
	}[]
): number {
	const vendors = new Set<HeadlessIABProcessedVendor['id']>();
	const providers = new Set<number>();
	for (const purpose of purposes) {
		for (const vendor of purpose.vendors) {
			vendors.add(vendor.id);
		}
		for (const provider of purpose.adTechProviders ?? []) {
			providers.add(provider.id);
		}
	}
	return vendors.size + providers.size;
};

const toRow = function toRow(
	purpose: HeadlessIABProcessedPurpose,
	kind: Exclude<HeadlessIABDisplayRowKind, 'stack'>,
	toggle: HeadlessIABDisplayToggle
): HeadlessIABDisplayRow {
	return {
		description: purpose.description,
		hasConsentBasis:
			toggle !== 'purpose' ||
			purpose.neededByAdTechProviders === true ||
			purpose.vendors.some((vendor) => vendor.purposes.includes(purpose.id)),
		id: purpose.id,
		illustrations: purpose.illustrations,
		kind,
		locked: kind === 'special-purpose',
		name: purpose.name,
		testId: iabDisplayTestId(kind, purpose.id),
		toggle,
		vendors: purpose.vendors,
		...(purpose.adTechProviders && {
			adTechProviders: purpose.adTechProviders,
		}),
	};
};

export const resolveIABDialogDisplayModel =
	function resolveIABDialogDisplayModel(
		iab: HeadlessIABStateInput | null
	): HeadlessIABDialogDisplayModel {
		const data = processGVLForDialog(iab);

		const consentRows: HeadlessIABDisplayConsentRow[] = [
			...data.standalonePurposes.map((purpose) =>
				toRow(purpose, 'purpose', 'purpose')
			),
			...data.stacks.map((stack): HeadlessIABDisplayStackRow => ({
				description: stack.description,
				id: stack.id,
				kind: 'stack',
				name: stack.name,
				purposes: stack.purposes.map((purpose) =>
					toRow(purpose, 'purpose', 'purpose')
				),
				testId: iabDisplayTestId('stack', stack.id),
			})),
			...data.specialFeatures.map((feature) =>
				toRow(feature, 'special-feature', 'special-feature')
			),
		];

		const essentialRows = data.specialPurposes.map((purpose) =>
			toRow(purpose, 'special-purpose', 'none')
		);
		const featureRows = data.features.map((feature) =>
			toRow(feature, 'feature', 'none')
		);

		const essentialPartners = new Set<HeadlessIABProcessedVendor['id']>();
		for (const row of essentialRows) {
			for (const vendor of row.vendors) {
				essentialPartners.add(vendor.id);
			}
		}

		return {
			consentRows,
			data,
			essentialPartnerCount: essentialPartners.size,
			essentialRows,
			featureRows,
			featuresStandardText: iab?.gvl?.standardTexts?.features || null,
			isLoading: data.isLoading,
			isReady: data.isReady,
			purposeTabCount:
				data.purposes.length +
				data.specialPurposes.length +
				data.specialFeatures.length +
				data.features.length,
			vendorTabCount: data.totalVendors,
		};
	};
