import type {
	ConsentItem,
	GetSubjectOutput,
	SubjectChoiceWire,
	VendorChoiceWire,
} from '@c15t/schema/types';

import { OPTIONAL_CONSENT_CATEGORIES } from '../consent-record/types';
import type {
	CategoryDecision,
	ConsentSubject,
	ExplicitChoice,
	OptionalConsentCategory,
} from '../consent-record/types';
import {
	checkTimestamp,
	validateExplicitChoice,
} from '../consent-record/validation';
import { isValidVendorId } from '../libs/vendors';
import type { HydrationRecords, VendorChoice } from '../types';

export type TransportHydrationRecords = HydrationRecords;

export type SubjectRecordWire = GetSubjectOutput;

export interface MapSubjectRecordOptions {
	now: number;
}

const COOKIE_BANNER = 'cookie_banner';

type ItemReceipts =
	| { kind: 'absent' }
	| { kind: 'unreadable' }
	| { kind: 'receipts'; categories: SubjectChoiceWire['categories'] };

const itemReceipts = (item: ConsentItem): ItemReceipts => {
	const { choice } = item;
	if (choice === undefined) {
		return { kind: 'absent' };
	}
	if (
		choice === null ||
		typeof choice !== 'object' ||
		choice.version !== 3 ||
		typeof choice.categories !== 'object' ||
		choice.categories === null
	) {
		return { kind: 'unreadable' };
	}
	return { categories: choice.categories, kind: 'receipts' };
};

const toTime = (value: Date | string | number): number =>
	value instanceof Date ? value.getTime() : new Date(value).getTime();

const legacyReceipts = (
	item: ConsentItem
): ExplicitChoice['categories'] | undefined => {
	if (item.type !== COOKIE_BANNER || item.preferences === undefined) {
		return undefined;
	}
	const confirmedAt = toTime(item.givenAt);
	const categories: ExplicitChoice['categories'] = {};
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		if (item.preferences[category] === true) {
			categories[category] = {
				basis: { kind: 'legacy-v2' },
				confirmedAt,
				value: true,
			};
		}
	}
	return categories;
};

const mergeItems = (
	items: readonly ConsentItem[]
): SubjectChoiceWire | null | undefined => {
	const categories = new Map<OptionalConsentCategory, CategoryDecision>();
	const ordered = [...items].sort(
		(left, right) => toTime(left.givenAt) - toTime(right.givenAt)
	);
	for (const item of ordered) {
		if (item.type !== COOKIE_BANNER) {
			continue;
		}
		const stored = itemReceipts(item);
		if (stored.kind === 'unreadable') {
			return null;
		}
		if (stored.kind === 'absent') {
			for (const category of OPTIONAL_CONSENT_CATEGORIES) {
				const current = categories.get(category);
				if (current?.value && current.confirmedAt <= toTime(item.givenAt)) {
					categories.delete(category);
				}
			}
		}
		const receipts =
			stored.kind === 'receipts' ? stored.categories : legacyReceipts(item);
		if (!receipts) {
			continue;
		}
		for (const category of OPTIONAL_CONSENT_CATEGORIES) {
			const receipt = receipts[category];
			if (!receipt) {
				continue;
			}
			const current = categories.get(category);
			if (current === undefined || receipt.confirmedAt >= current.confirmedAt) {
				categories.set(category, receipt);
			}
		}
	}
	return categories.size > 0
		? { categories: Object.fromEntries(categories), version: 3 }
		: undefined;
};

const mapSubject = (
	subject: GetSubjectOutput['subject']
): ConsentSubject | null => {
	const mapped: ConsentSubject = { subjectId: subject.id };
	if (typeof subject.externalId === 'string' && subject.externalId) {
		mapped.externalId = subject.externalId;
		if (
			typeof subject.identityProvider === 'string' &&
			subject.identityProvider
		) {
			mapped.identityProvider = subject.identityProvider;
		}
	}
	return mapped;
};

const mapVendorChoice = (
	wire: VendorChoiceWire | null | undefined,
	now: number
): VendorChoice | null => {
	if (
		!wire ||
		typeof wire !== 'object' ||
		wire.version !== 1 ||
		typeof wire.grants !== 'object' ||
		wire.grants === null ||
		Array.isArray(wire.grants) ||
		checkTimestamp(wire.confirmedAt, now)
	) {
		return null;
	}
	const denied: string[] = [];
	for (const [id, granted] of Object.entries(wire.grants)) {
		if (typeof granted !== 'boolean' || !isValidVendorId(id)) {
			return null;
		}
		if (!granted) {
			denied.push(id);
		}
	}
	return { confirmedAt: wire.confirmedAt, denied: denied.sort(), version: 1 };
};

const mergeItemVendors = (
	items: readonly ConsentItem[]
): VendorChoiceWire | null | undefined => {
	let newest: VendorChoiceWire | null | undefined;
	for (const item of items) {
		if (item.type !== COOKIE_BANNER || !item.vendorChoice) {
			continue;
		}
		if (!newest || item.vendorChoice.confirmedAt >= newest.confirmedAt) {
			newest = item.vendorChoice;
		}
	}
	return newest;
};

export const mapSubjectRecordToHydrationRecords =
	function mapSubjectRecordToHydrationRecords(
		record: SubjectRecordWire,
		options: MapSubjectRecordOptions
	): TransportHydrationRecords {
		const wire =
			record.subjectChoice === undefined
				? mergeItems(record.consents)
				: record.subjectChoice;
		const validated = wire
			? validateExplicitChoice(wire, options.now)
			: undefined;

		const vendorWire =
			record.subjectVendorChoice === undefined
				? mergeItemVendors(record.consents)
				: record.subjectVendorChoice;

		return {
			choice: validated?.ok ? validated.record : null,
			now: options.now,
			subject: mapSubject(record.subject),
			vendorChoice: mapVendorChoice(vendorWire, options.now),
		};
	};

export const reviveSubjectRecord = function reviveSubjectRecord(
	raw: unknown
): SubjectRecordWire | undefined {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return undefined;
	}
	const record = raw as Record<string, unknown>;
	const { subject, consents } = record;
	if (
		typeof subject !== 'object' ||
		subject === null ||
		typeof (subject as { id?: unknown }).id !== 'string' ||
		!Array.isArray(consents)
	) {
		return undefined;
	}
	const revive = (value: unknown): Date | undefined => {
		if (value instanceof Date) {
			return value;
		}
		if (typeof value === 'string' || typeof value === 'number') {
			return new Date(value);
		}
		return undefined;
	};
	const items: ConsentItem[] = [];
	for (const entry of consents) {
		if (typeof entry !== 'object' || entry === null) {
			continue;
		}
		const item = entry as Record<string, unknown>;
		const givenAt = revive(item.givenAt);
		if (
			!givenAt ||
			typeof item.id !== 'string' ||
			typeof item.type !== 'string'
		) {
			continue;
		}
		items.push({
			...(item as unknown as ConsentItem),
			givenAt,
			isLatestPolicy: item.isLatestPolicy === true,
			policyEffectiveDate: revive(item.policyEffectiveDate),
		});
	}
	const subjectRecord = subject as Record<string, unknown>;
	return {
		...(record as unknown as SubjectRecordWire),
		consents: items,
		subject: {
			...(subjectRecord as unknown as GetSubjectOutput['subject']),
			createdAt: revive(subjectRecord.createdAt),
		},
	};
};
