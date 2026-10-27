import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import type { OptionalConsentCategory } from '../../consent-record/types';
import type { ConsentSnapshot, SavePayload } from '../../types';

export interface PendingSaveEntry {
	payload: SavePayload;
	queuedAt: number;
	attempts: number;
}

export interface Supersession {
	category: (category: OptionalConsentCategory) => boolean;
	vendors: boolean;
}

const NOTHING_SUPERSEDED: Supersession = {
	category: () => false,
	vendors: false,
};

export const withoutSuperseded = function withoutSuperseded(
	payload: SavePayload,
	by: Supersession
): SavePayload | null {
	const keys = OPTIONAL_CONSENT_CATEGORIES.filter((category) =>
		Object.hasOwn(payload.confirmed.categories, category)
	);
	const kept = keys.filter((category) => !by.category(category));
	let selected = payload;
	if (kept.length === 0 && keys.length > 0) {
		return null;
	}
	if (kept.length < keys.length) {
		const categories: Partial<Record<OptionalConsentCategory, boolean>> = {};
		const receipts: SavePayload['choice']['categories'] = {};
		const consents = {
			experience: false,
			functionality: false,
			marketing: false,
			measurement: false,
			necessary: true,
		};
		for (const category of kept) {
			const receipt = payload.choice.categories[category];
			if (receipt) {
				categories[category] = receipt.value;
				receipts[category] = receipt;
				consents[category] = payload.consents[category];
			}
		}
		const { addtlConsent: _addtlConsent, ...rest } = payload;
		selected = {
			...rest,
			choice: { categories: receipts, version: 3 },
			confirmed: { ...payload.confirmed, categories },
			consentAction: 'custom',
			consents,
			tcString: null,
		};
	}
	if (selected.vendorChoice === undefined || !by.vendors) {
		return selected;
	}
	const { vendorChoice: _superseded, ...remaining } = selected;
	return Object.keys(remaining.confirmed.categories).length > 0
		? remaining
		: null;
};

export const supersededBy = function supersededBy(
	older: SavePayload,
	newer: SavePayload
): Supersession {
	if (
		older.subjectId !== newer.subjectId ||
		older.confirmed.actionAt > newer.confirmed.actionAt
	) {
		return NOTHING_SUPERSEDED;
	}
	return {
		category: (category) => Object.hasOwn(newer.confirmed.categories, category),
		vendors: newer.vendorChoice !== undefined,
	};
};

export const liveSupersession = function liveSupersession(
	action: ConsentSnapshot,
	current: ConsentSnapshot
): Supersession {
	return {
		category: (category) =>
			current.explicitChoice?.categories[category] !==
			action.explicitChoice?.categories[category],
		vendors: current.vendorChoice !== action.vendorChoice,
	};
};

export const withSubjectId = function withSubjectId(
	payload: SavePayload,
	subjectId: string
): SavePayload {
	return {
		...payload,
		subject: { ...payload.subject, subjectId },
		subjectId,
	};
};
