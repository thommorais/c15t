import { OPTIONAL_CONSENT_CATEGORIES } from '../consent-record/types';
import type {
	ConsentSubject,
	ExplicitChoice,
	NoticeDismissal,
} from '../consent-record/types';
import {
	checkTimestamp,
	isNonEmptyString,
	isPlainRecord,
	ownKeys,
	ownValue,
	validateExplicitChoice,
	validateNoticeDismissal,
} from '../consent-record/validation';
import type { RecordIssue } from '../consent-record/validation';
import { isValidVendorId } from '../libs/vendors';
import type { HydrationRecords, VendorChoice } from '../types';

export interface ValidatedRecords {
	choice?: ExplicitChoice | null;
	subject?: ConsentSubject | null;
	noticeDismissal?: NoticeDismissal | null;
	vendorChoice?: VendorChoice | null;
}

export type ValidateRecordsResult =
	| { ok: true; records: ValidatedRecords }
	| { ok: false; issues: RecordIssue[] };

const SUBJECT_KEYS = ['subjectId', 'externalId', 'identityProvider'] as const;

const validateSubject = function validateSubject(
	input: unknown,
	issues: RecordIssue[]
): ConsentSubject | null {
	if (!isPlainRecord(input)) {
		issues.push({ code: 'not-an-object', path: 'subject' });
		return null;
	}
	const subject: ConsentSubject = {};
	let any = false;
	for (const key of ownKeys(input)) {
		if (!SUBJECT_KEYS.includes(key as (typeof SUBJECT_KEYS)[number])) {
			issues.push({ code: 'unknown-key', path: `subject.${key}` });
			continue;
		}
		const value = ownValue(input, key);
		if (value === undefined) {
			continue;
		}
		if (!isNonEmptyString(value)) {
			issues.push({ code: 'invalid-identifier', path: `subject.${key}` });
			continue;
		}
		subject[key as (typeof SUBJECT_KEYS)[number]] = value;
		any = true;
	}
	return any ? subject : null;
};

export const validateVendorChoice = function validateVendorChoice(
	input: unknown,
	now: number
): { ok: true; record: VendorChoice } | { ok: false; issues: RecordIssue[] } {
	if (!isPlainRecord(input)) {
		return { issues: [{ code: 'not-an-object', path: '' }], ok: false };
	}
	if (ownValue(input, 'version') !== 1) {
		return {
			issues: [{ code: 'unsupported-version', path: 'version' }],
			ok: false,
		};
	}
	const issues: RecordIssue[] = [];
	for (const key of ownKeys(input)) {
		if (key !== 'version' && key !== 'confirmedAt' && key !== 'denied') {
			issues.push({ code: 'unknown-key', path: key });
		}
	}
	const confirmedAt = ownValue(input, 'confirmedAt');
	const timestampIssue = checkTimestamp(confirmedAt, now);
	if (timestampIssue) {
		issues.push({ code: timestampIssue, path: 'confirmedAt' });
	}
	const rawDenied = ownValue(input, 'denied');
	const denied = new Set<string>();
	if (Array.isArray(rawDenied)) {
		for (const [index, entry] of rawDenied.entries()) {
			if (!isNonEmptyString(entry) || !isValidVendorId(entry)) {
				issues.push({ code: 'invalid-identifier', path: `denied[${index}]` });
				continue;
			}
			denied.add(entry);
		}
	} else {
		issues.push({ code: 'not-an-object', path: 'denied' });
	}
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	return {
		ok: true,
		record: {
			confirmedAt: confirmedAt as number,
			denied: [...denied].sort(),
			version: 1,
		},
	};
};

export const validateHydrationRecords = function validateHydrationRecords(
	input: HydrationRecords,
	now: number
): ValidateRecordsResult {
	const issues: RecordIssue[] = [];
	const records: ValidatedRecords = {};

	if (input.choice !== undefined) {
		if (input.choice === null) {
			records.choice = null;
		} else {
			const result = validateExplicitChoice(input.choice, now);
			if (result.ok === true) {
				records.choice = result.record;
			} else {
				issues.push(
					...result.issues.map((issue) => ({
						...issue,
						path: `choice.${issue.path}`,
					}))
				);
			}
		}
	}
	if (input.subject !== undefined) {
		records.subject =
			input.subject === null ? null : validateSubject(input.subject, issues);
	}
	if (input.noticeDismissal !== undefined) {
		if (input.noticeDismissal === null) {
			records.noticeDismissal = null;
		} else {
			const result = validateNoticeDismissal(input.noticeDismissal, now);
			if (result.ok === true) {
				records.noticeDismissal = result.record;
			} else {
				issues.push(
					...result.issues.map((issue) => ({
						...issue,
						path: `noticeDismissal.${issue.path}`,
					}))
				);
			}
		}
	}
	if (input.vendorChoice !== undefined) {
		if (input.vendorChoice === null) {
			records.vendorChoice = null;
		} else {
			const result = validateVendorChoice(input.vendorChoice, now);
			if (result.ok === true) {
				records.vendorChoice = result.record;
			} else {
				issues.push(
					...result.issues.map((issue) => ({
						...issue,
						path: `vendorChoice.${issue.path}`,
					}))
				);
			}
		}
	}

	if (issues.length > 0) {
		return { issues, ok: false };
	}
	return { ok: true, records };
};

export const mergeNewestVendorChoice = function mergeNewestVendorChoice(
	current: VendorChoice | null,
	incoming: VendorChoice | null
): VendorChoice | null {
	if (!current) {
		return incoming;
	}
	if (!incoming) {
		return current;
	}
	return incoming.confirmedAt > current.confirmedAt ? incoming : current;
};

export const mergeNewestChoice = function mergeNewestChoice(
	current: ExplicitChoice | null,
	incoming: ExplicitChoice | null
): ExplicitChoice | null {
	if (!current) {
		return incoming;
	}
	if (!incoming) {
		return current;
	}
	const categories: ExplicitChoice['categories'] = { ...current.categories };
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const theirs = incoming.categories[category];
		const ours = categories[category];
		if (theirs && (!ours || theirs.confirmedAt > ours.confirmedAt)) {
			categories[category] = theirs;
		}
	}
	return { categories, version: 3 };
};
