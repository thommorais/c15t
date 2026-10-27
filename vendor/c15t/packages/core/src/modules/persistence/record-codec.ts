import type {
	CategoryDecision,
	ChoiceBasis,
	ConsentSubject,
	ExplicitChoice,
	NoticeDismissal,
	OptionalConsentCategory,
} from '../../consent-record/types';
import {
	checkTimestamp,
	isNonEmptyString,
	isPlainRecord,
	ownKeys,
	ownValue,
	validateExplicitChoice,
	validateNoticeDismissal,
} from '../../consent-record/validation';
import type { RecordIssue } from '../../consent-record/validation';
import { isValidVendorId } from '../../libs/vendors';
import type { VendorChoice } from '../../types';

export interface StoredIabMetadata {
	customVendorConsents?: Readonly<Record<string, boolean>>;
	customVendorLegitimateInterests?: Readonly<Record<string, boolean>>;
}

export interface StoredConsentEnvelope {
	version: 3;
	subject?: ConsentSubject;
	epoch?: number;
	categories: ExplicitChoice['categories'];
	iab?: StoredIabMetadata;
}

export type StoredNoticeDismissal = NoticeDismissal & {
	subject?: ConsentSubject;
};

export type StoredVendorChoice = VendorChoice & {
	subject?: ConsentSubject;
};

export type StorageIssue =
	| RecordIssue
	| {
			code: 'duplicate-key' | 'malformed-encoding';
			path: string;
	  };

export type DecodeResult<RecordType> =
	| { ok: true; record: RecordType }
	| { ok: false; issues: StorageIssue[] };

export const COMPACT_ENVELOPE_PREFIX = 'v=3';

const FIELD_SEPARATOR = '&';
const KEY_VALUE_SEPARATOR = '=';
const LIST_SEPARATOR = '|';
const TUPLE_SEPARATOR = '.';

export const CATEGORY_CODES = {
	experience: 'ex',
	functionality: 'fn',
	marketing: 'mk',
	measurement: 'me',
} as const satisfies Record<OptionalConsentCategory, string>;

const CODE_TO_CATEGORY: ReadonlyMap<string, OptionalConsentCategory> = new Map(
	Object.entries(CATEGORY_CODES).map(([category, code]) => [
		code,
		category as OptionalConsentCategory,
	])
);

export const SUBJECT_CODES = {
	externalId: 'eid',
	identityProvider: 'idp',
	subjectId: 'sid',
} as const satisfies Record<keyof ConsentSubject, string>;

const CODE_TO_SUBJECT_KEY: ReadonlyMap<string, keyof ConsentSubject> = new Map(
	Object.entries(SUBJECT_CODES).map(([key, code]) => [
		code,
		key as keyof ConsentSubject,
	])
);

export const IAB_CODES = {
	customVendorConsents: 'icv',
	customVendorLegitimateInterests: 'icvli',
} as const satisfies Record<keyof StoredIabMetadata, string>;

const CODE_TO_IAB_KEY: ReadonlyMap<string, keyof StoredIabMetadata> = new Map(
	Object.entries(IAB_CODES).map(([key, code]) => [
		code,
		key as keyof StoredIabMetadata,
	])
);

const BASIS_FIELD = 'b';
const EPOCH_FIELD = 'e';
const VERSION_FIELD = 'v';

const SUBJECT_KEYS = ['subjectId', 'externalId', 'identityProvider'] as const;
const IAB_KEYS = [
	'customVendorConsents',
	'customVendorLegitimateInterests',
] as const;

export const DIGITS_ONLY = /^\d+$/u;

const setOwn = function setOwn(
	target: Record<string, boolean>,
	key: string,
	value: boolean
): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
};

export const decodeComponent = function decodeComponent(
	value: string
): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
};

const validateSubject = function validateSubject(
	input: unknown,
	issues: StorageIssue[]
): ConsentSubject | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (!isPlainRecord(input)) {
		issues.push({ code: 'not-an-object', path: 'subject' });
		return undefined;
	}
	const subject: ConsentSubject = {};
	for (const key of ownKeys(input)) {
		if (!SUBJECT_KEYS.includes(key as (typeof SUBJECT_KEYS)[number])) {
			issues.push({ code: 'unknown-key', path: `subject.${key}` });
			continue;
		}
		const value = input[key];
		if (value === undefined) {
			continue;
		}
		if (!isNonEmptyString(value)) {
			issues.push({ code: 'invalid-identifier', path: `subject.${key}` });
			continue;
		}
		subject[key as keyof ConsentSubject] = value;
	}
	return Object.keys(subject).length > 0 ? subject : undefined;
};

const validateBooleanMap = function validateBooleanMap(
	input: unknown,
	path: string,
	issues: StorageIssue[]
): Record<string, boolean> | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (!isPlainRecord(input)) {
		issues.push({ code: 'not-an-object', path });
		return undefined;
	}
	const map: Record<string, boolean> = {};
	for (const key of ownKeys(input)) {
		const value = input[key];
		if (typeof value !== 'boolean') {
			issues.push({ code: 'invalid-boolean', path: `${path}.${key}` });
			continue;
		}
		setOwn(map, key, value);
	}
	return Object.keys(map).length > 0 ? map : undefined;
};

export const validateIabMetadata = function validateIabMetadata(
	consents: unknown,
	legitimateInterests: unknown,
	path: string,
	issues: StorageIssue[]
): StoredIabMetadata | undefined {
	const customVendorConsents = validateBooleanMap(
		consents,
		`${path}.customVendorConsents`,
		issues
	);
	const customVendorLegitimateInterests = validateBooleanMap(
		legitimateInterests,
		`${path}.customVendorLegitimateInterests`,
		issues
	);
	if (!customVendorConsents && !customVendorLegitimateInterests) {
		return undefined;
	}
	const metadata: StoredIabMetadata = {};
	if (customVendorConsents) {
		metadata.customVendorConsents = customVendorConsents;
	}
	if (customVendorLegitimateInterests) {
		metadata.customVendorLegitimateInterests = customVendorLegitimateInterests;
	}
	return metadata;
};

const ENVELOPE_KEYS = [
	'version',
	'subject',
	'epoch',
	'categories',
	'iab',
] as const;

export const EPOCH_CLOCK_TOLERANCE_MS = 60 * 60 * 1000;

const readEpoch = function readEpoch(
	value: unknown,
	now: number
): number | undefined {
	return typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		value >= 0 &&
		value <= now + EPOCH_CLOCK_TOLERANCE_MS
		? value
		: undefined;
};

const envelopeResult = function envelopeResult(
	issues: StorageIssue[],
	categories: ExplicitChoice['categories'],
	subject: ConsentSubject | undefined,
	epoch: number | undefined,
	iab: StoredIabMetadata | undefined
): DecodeResult<StoredConsentEnvelope> {
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	const envelope: StoredConsentEnvelope = { categories, version: 3 };
	if (subject && Object.keys(subject).length > 0) {
		envelope.subject = subject;
	}
	if (epoch) {
		envelope.epoch = epoch;
	}
	if (iab && Object.keys(iab).length > 0) {
		envelope.iab = iab;
	}
	return { ok: true, record: envelope };
};

export const validateStoredConsentEnvelope =
	function validateStoredConsentEnvelope(
		input: unknown,
		now: number
	): DecodeResult<StoredConsentEnvelope> {
		if (!isPlainRecord(input)) {
			return { issues: [{ code: 'not-an-object', path: '' }], ok: false };
		}
		const choice = validateExplicitChoice(input, now);
		if (choice.ok === false) {
			return { issues: choice.issues, ok: false };
		}
		const issues: StorageIssue[] = [];
		for (const key of ownKeys(input)) {
			if (!ENVELOPE_KEYS.includes(key as (typeof ENVELOPE_KEYS)[number])) {
				issues.push({ code: 'unknown-key', path: key });
			}
		}
		const subject = validateSubject(ownValue(input, 'subject'), issues);
		const rawEpoch = ownValue(input, 'epoch');
		const epoch = rawEpoch === undefined ? undefined : readEpoch(rawEpoch, now);
		const rawIab = ownValue(input, 'iab');
		let iab: StoredIabMetadata | undefined;
		if (isPlainRecord(rawIab)) {
			for (const key of ownKeys(rawIab)) {
				if (!IAB_KEYS.includes(key as (typeof IAB_KEYS)[number])) {
					issues.push({ code: 'unknown-key', path: `iab.${key}` });
				}
			}
			iab = validateIabMetadata(
				ownValue(rawIab, 'customVendorConsents'),
				ownValue(rawIab, 'customVendorLegitimateInterests'),
				'iab',
				issues
			);
		} else if (rawIab !== undefined) {
			issues.push({ code: 'not-an-object', path: 'iab' });
		}
		return envelopeResult(
			issues,
			choice.record.categories,
			subject,
			epoch,
			iab
		);
	};

export const isCompactStoredConsentEnvelope =
	function isCompactStoredConsentEnvelope(rawValue: string): boolean {
		return (
			rawValue === COMPACT_ENVELOPE_PREFIX ||
			rawValue.startsWith(`${COMPACT_ENVELOPE_PREFIX}${FIELD_SEPARATOR}`)
		);
	};

const parseBasisList = function parseBasisList(
	value: string,
	issues: StorageIssue[]
): ChoiceBasis[] | null {
	if (value.length === 0) {
		issues.push({ code: 'malformed-encoding', path: BASIS_FIELD });
		return null;
	}
	const bases: ChoiceBasis[] = [];
	for (const [index, entry] of value.split(LIST_SEPARATOR).entries()) {
		const path = `${BASIS_FIELD}[${index}]`;
		const kind = entry.charAt(0);
		const encoded = entry.slice(1);
		const fingerprint = encoded.length > 0 ? decodeComponent(encoded) : '';
		if (fingerprint === null) {
			issues.push({ code: 'malformed-encoding', path });
			continue;
		}
		if (kind === 'c') {
			if (fingerprint.length === 0) {
				issues.push({ code: 'invalid-fingerprint', path });
				continue;
			}
			bases.push({ fingerprint, kind: 'choice-v1' });
			continue;
		}
		if (kind === 'l') {
			bases.push(
				fingerprint.length === 0
					? { kind: 'legacy-v2' }
					: { kind: 'legacy-v2', materialFingerprint: fingerprint }
			);
			continue;
		}
		issues.push({ code: 'invalid-basis', path });
	}
	return bases;
};

const parseDecision = function parseDecision(
	value: string,
	path: string,
	bases: readonly ChoiceBasis[],
	now: number,
	issues: StorageIssue[]
): CategoryDecision | null {
	const parts = value.split(TUPLE_SEPARATOR);
	if (parts.length !== 3) {
		issues.push({ code: 'malformed-encoding', path });
		return null;
	}
	const [rawValue, rawTime, rawIndex] = parts as [string, string, string];
	let ok = true;
	if (rawValue !== '0' && rawValue !== '1') {
		issues.push({ code: 'invalid-boolean', path: `${path}.value` });
		ok = false;
	}
	let confirmedAt: number | null = null;
	if (DIGITS_ONLY.test(rawTime)) {
		confirmedAt = Number(rawTime);
		const timestampIssue = checkTimestamp(confirmedAt, now);
		if (timestampIssue) {
			issues.push({ code: timestampIssue, path: `${path}.confirmedAt` });
			ok = false;
		}
	} else {
		issues.push({ code: 'invalid-timestamp', path: `${path}.confirmedAt` });
		ok = false;
	}
	let basis: ChoiceBasis | undefined;
	if (DIGITS_ONLY.test(rawIndex)) {
		basis = bases[Number(rawIndex)];
	}
	if (!basis) {
		issues.push({ code: 'invalid-basis', path: `${path}.basis` });
		ok = false;
	}
	if (!ok || confirmedAt === null || !basis) {
		return null;
	}
	return { basis, confirmedAt, value: rawValue === '1' };
};

const parseBooleanMap = function parseBooleanMap(
	value: string,
	path: string,
	issues: StorageIssue[]
): Record<string, boolean> | null {
	if (value.length === 0) {
		issues.push({ code: 'malformed-encoding', path });
		return null;
	}
	const map: Record<string, boolean> = {};
	for (const [index, entry] of value.split(LIST_SEPARATOR).entries()) {
		const entryPath = `${path}[${index}]`;
		const separator = entry.indexOf(TUPLE_SEPARATOR);
		if (separator === -1) {
			issues.push({ code: 'malformed-encoding', path: entryPath });
			continue;
		}
		const flag = entry.slice(0, separator);
		const id = decodeComponent(entry.slice(separator + 1));
		if ((flag !== '0' && flag !== '1') || id === null || id.length === 0) {
			issues.push({ code: 'malformed-encoding', path: entryPath });
			continue;
		}
		if (Object.hasOwn(map, id)) {
			issues.push({ code: 'duplicate-key', path: entryPath });
			continue;
		}
		setOwn(map, id, flag === '1');
	}
	return map;
};

const readSubjectField = function readSubjectField(
	key: string,
	value: string,
	subject: ConsentSubject,
	issues: StorageIssue[]
): boolean {
	const subjectKey = CODE_TO_SUBJECT_KEY.get(key);
	if (subjectKey) {
		const decoded = decodeComponent(value);
		if (decoded) {
			subject[subjectKey] = decoded;
		} else {
			issues.push({ code: 'invalid-identifier', path: key });
		}
	}
	return subjectKey !== undefined;
};

const parseCompactFields = function parseCompactFields(
	rawValue: string,
	prefix: string,
	issues: StorageIssue[]
): Map<string, string> | null {
	const parts = rawValue.split(FIELD_SEPARATOR);
	if (parts[0] !== prefix) {
		issues.push({ code: 'unsupported-version', path: VERSION_FIELD });
		return null;
	}
	const fields = new Map<string, string>();
	for (const part of parts.slice(1)) {
		const separator = part.indexOf(KEY_VALUE_SEPARATOR);
		if (separator <= 0) {
			issues.push({ code: 'malformed-encoding', path: part });
			return null;
		}
		const key = part.slice(0, separator);
		if (fields.has(key)) {
			issues.push({ code: 'duplicate-key', path: key });
			return null;
		}
		fields.set(key, part.slice(separator + 1));
	}
	return fields;
};

// oxlint-disable-next-line complexity -- One pass over a fixed set of typed fields.
export const decodeStoredConsentEnvelopeCompact =
	function decodeStoredConsentEnvelopeCompact(
		rawValue: string,
		now: number
	): DecodeResult<StoredConsentEnvelope> {
		const issues: StorageIssue[] = [];
		const fields = parseCompactFields(
			rawValue,
			COMPACT_ENVELOPE_PREFIX,
			issues
		);
		if (!fields) {
			return { issues, ok: false };
		}

		const rawBases = fields.get(BASIS_FIELD);
		fields.delete(BASIS_FIELD);
		const bases =
			rawBases === undefined ? [] : parseBasisList(rawBases, issues);
		const rawEpoch = fields.get(EPOCH_FIELD);
		fields.delete(EPOCH_FIELD);
		const epoch =
			rawEpoch === undefined
				? undefined
				: readEpoch(
						DIGITS_ONLY.test(rawEpoch) ? Number(rawEpoch) : rawEpoch,
						now
					);

		const subject: ConsentSubject = {};
		const categories: ExplicitChoice['categories'] = {};
		const iab: StoredIabMetadata = {};

		for (const [key, value] of fields) {
			if (readSubjectField(key, value, subject, issues)) {
				continue;
			}
			const category = CODE_TO_CATEGORY.get(key);
			if (category) {
				const decision = parseDecision(value, key, bases ?? [], now, issues);
				if (decision) {
					categories[category] = decision;
				}
				continue;
			}
			const iabKey = CODE_TO_IAB_KEY.get(key);
			if (iabKey) {
				const map = parseBooleanMap(value, key, issues);
				if (map) {
					iab[iabKey] = map;
				}
				continue;
			}
			issues.push({ code: 'unknown-key', path: key });
		}

		return envelopeResult(issues, categories, subject, epoch, iab);
	};

export const decodeNoticeDismissal = function decodeNoticeDismissal(
	input: unknown,
	now: number
): DecodeResult<StoredNoticeDismissal> {
	if (!isPlainRecord(input)) {
		return validateNoticeDismissal(input, now);
	}
	const { subject: rawSubject, ...dismissal } = input;
	const decoded = validateNoticeDismissal(dismissal, now);
	if (!decoded.ok) {
		return decoded;
	}
	const issues: StorageIssue[] = [];
	const subject = validateSubject(rawSubject, issues);
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	return {
		ok: true,
		record: subject ? { ...decoded.record, subject } : decoded.record,
	};
};

export const COMPACT_NOTICE_PREFIX = 'v=1';

const parseCompactInteger = function parseCompactInteger(
	value: string | undefined
): unknown {
	if (value === undefined || !DIGITS_ONLY.test(value)) {
		return value;
	}
	return Number(value);
};

export const decodeNoticeDismissalCompact =
	function decodeNoticeDismissalCompact(
		rawValue: string,
		now: number
	): DecodeResult<StoredNoticeDismissal> {
		const issues: StorageIssue[] = [];
		const fields = parseCompactFields(rawValue, COMPACT_NOTICE_PREFIX, issues);
		if (!fields) {
			return { issues, ok: false };
		}
		const subject: ConsentSubject = {};
		for (const [key, value] of fields) {
			if (readSubjectField(key, value, subject, issues)) {
				continue;
			}
			if (key !== 't' && key !== 'f') {
				issues.push({ code: 'unknown-key', path: key });
			}
		}
		if (issues.length > 0) {
			return { issues, ok: false };
		}
		const fingerprintText = fields.get('f');
		const fingerprint =
			fingerprintText === undefined
				? undefined
				: decodeComponent(fingerprintText);
		if (fingerprint === null) {
			return { issues: [{ code: 'malformed-encoding', path: 'f' }], ok: false };
		}
		const candidate: Record<string, unknown> = {
			dismissedAt: parseCompactInteger(fields.get('t')),
			fingerprint,
			version: 1,
		};
		if (Object.keys(subject).length > 0) {
			candidate.subject = subject;
		}
		return decodeNoticeDismissal(candidate, now);
	};

export const COMPACT_VENDORS_PREFIX = 'v=1';

const VENDOR_CHOICE_KEYS = [
	'version',
	'confirmedAt',
	'denied',
	'subject',
] as const;

export const decodeVendorChoice = function decodeVendorChoice(
	input: unknown,
	now: number
): DecodeResult<StoredVendorChoice> {
	if (!isPlainRecord(input)) {
		return { issues: [{ code: 'not-an-object', path: '' }], ok: false };
	}
	if (ownValue(input, 'version') !== 1) {
		return {
			issues: [{ code: 'unsupported-version', path: 'version' }],
			ok: false,
		};
	}
	const issues: StorageIssue[] = [];
	for (const key of ownKeys(input)) {
		if (
			!VENDOR_CHOICE_KEYS.includes(key as (typeof VENDOR_CHOICE_KEYS)[number])
		) {
			issues.push({ code: 'unknown-key', path: key });
		}
	}
	const confirmedAt = ownValue(input, 'confirmedAt');
	const timestampIssue = checkTimestamp(confirmedAt, now);
	if (timestampIssue) {
		issues.push({ code: timestampIssue, path: 'confirmedAt' });
	}
	const subject = validateSubject(ownValue(input, 'subject'), issues);
	const rawDenied = ownValue(input, 'denied');
	const denied: string[] = [];
	if (Array.isArray(rawDenied)) {
		for (const [index, entry] of rawDenied.entries()) {
			if (!isNonEmptyString(entry) || !isValidVendorId(entry)) {
				issues.push({ code: 'invalid-identifier', path: `denied[${index}]` });
				continue;
			}
			if (denied.includes(entry)) {
				issues.push({ code: 'duplicate-key', path: `denied[${index}]` });
				continue;
			}
			denied.push(entry);
		}
	} else {
		issues.push({ code: 'not-an-object', path: 'denied' });
	}
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	const record: StoredVendorChoice = {
		confirmedAt: confirmedAt as number,
		denied: denied.sort(),
		version: 1,
	};
	if (subject) {
		record.subject = subject;
	}
	return { ok: true, record };
};

export const decodeVendorChoiceCompact = function decodeVendorChoiceCompact(
	rawValue: string,
	now: number
): DecodeResult<StoredVendorChoice> {
	const issues: StorageIssue[] = [];
	const fields = parseCompactFields(rawValue, COMPACT_VENDORS_PREFIX, issues);
	if (!fields) {
		return { issues, ok: false };
	}
	const subject: ConsentSubject = {};
	for (const [key, value] of fields) {
		if (readSubjectField(key, value, subject, issues)) {
			continue;
		}
		if (key !== 't' && key !== 'd') {
			issues.push({ code: 'unknown-key', path: key });
		}
	}
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	const list = fields.get('d');
	const denied: unknown[] = [];
	if (list !== undefined && list !== '') {
		for (const [index, entry] of list.split(LIST_SEPARATOR).entries()) {
			const id = decodeComponent(entry);
			if (id === null) {
				return {
					issues: [{ code: 'malformed-encoding', path: `d[${index}]` }],
					ok: false,
				};
			}
			denied.push(id);
		}
	}
	const candidate: Record<string, unknown> = {
		confirmedAt: parseCompactInteger(fields.get('t')),
		denied,
		version: 1,
	};
	if (Object.keys(subject).length > 0) {
		candidate.subject = subject;
	}
	return decodeVendorChoice(candidate, now);
};

export const decodeClearEpoch = function decodeClearEpoch(
	text: string,
	now: number
): DecodeResult<number> {
	const epoch = DIGITS_ONLY.test(text)
		? readEpoch(Number(text), now)
		: undefined;
	if (epoch === undefined) {
		return { issues: [{ code: 'malformed-encoding', path: '' }], ok: false };
	}
	return { ok: true, record: epoch };
};
