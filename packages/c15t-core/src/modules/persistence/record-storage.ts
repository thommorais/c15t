import { normalizeLegacyConsentRecord } from '../../consent-record/normalize';
import type { LegacyRecordEncoding } from '../../consent-record/normalize';
import type {
	CategoryDecision,
	ConsentSubject,
	ExplicitChoice,
} from '../../consent-record/types';
import {
	isNonEmptyString,
	isPlainRecord,
	ownValue,
} from '../../consent-record/validation';
import {
	expandFlatKeys,
	getRawCookieValue,
	readCookieValueFromHeader,
	stringToFlat,
} from '../../libs/cookie';
import type { StorageConfig } from '../../libs/cookie';
import { resolveStorageKeys } from '../../libs/storage-keys';
import { choiceSinceEpoch } from './epoch';
import {
	decodeClearEpoch,
	decodeComponent,
	decodeNoticeDismissal,
	decodeNoticeDismissalCompact,
	decodeStoredConsentEnvelopeCompact,
	decodeVendorChoice,
	decodeVendorChoiceCompact,
	DIGITS_ONLY,
	validateIabMetadata,
	validateStoredConsentEnvelope,
} from './record-codec';
import type {
	DecodeResult,
	StorageIssue,
	StoredConsentEnvelope,
	StoredIabMetadata,
	StoredNoticeDismissal,
	StoredVendorChoice,
} from './record-codec';

export { resolveStorageKeys } from '../../libs/storage-keys';
export type { ResolvedStorageKeys } from '../../libs/storage-keys';

export type { LegacyRecordEncoding as StoredRecordEncoding };

export type StoredRecordSource =
	| 'cookie'
	| 'local-storage'
	| 'legacy-local-storage';

export type StoredRecordFormat = 'legacy-v2' | 'v3';

export type RawStoredCandidate =
	| { source: StoredRecordSource; key: string; status: 'absent' }
	| { source: StoredRecordSource; key: string; status: 'unparseable' }
	| {
			source: StoredRecordSource;
			key: string;
			status: 'parsed';
			encoding: LegacyRecordEncoding;
			format: 'compact-v3' | 'parsed';
			value: unknown;
			rawText: string;
	  };

export interface DecodedStoredConsent {
	source: StoredRecordSource;
	key: string;
	encoding: LegacyRecordEncoding;
	format: StoredRecordFormat;
	choice: ExplicitChoice;
	subject: ConsentSubject | null;
	iab: StoredIabMetadata | null;
	epoch: number;
}

export type StoredConsentCandidate =
	| { source: StoredRecordSource; key: string; status: 'absent' }
	| { source: StoredRecordSource; key: string; status: 'unparseable' }
	| {
			source: StoredRecordSource;
			key: string;
			status: 'invalid';
			encoding: LegacyRecordEncoding;
			format: StoredRecordFormat;
			issues: StorageIssue[];
	  }
	| {
			source: StoredRecordSource;
			key: string;
			status: 'valid';
			record: DecodedStoredConsent;
	  };

export interface StoredConsentSelection {
	selected: DecodedStoredConsent | null;
	candidates: StoredConsentCandidate[];
}

const parseJsonText = function parseJsonText(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
};

const LEGACY_BOOLEAN_MAPS: ReadonlySet<string> = new Set([
	'consents',
	'iabCustomVendorConsents',
	'iabCustomVendorLegitimateInterests',
]);

const typeLegacyCompactLeaf = function typeLegacyCompactLeaf(
	path: readonly string[],
	value: string
): unknown {
	const [head, ...rest] = path;
	if (head === 'consentInfo' && rest.length === 1 && rest[0] === 'time') {
		return DIGITS_ONLY.test(value) ? Number(value) : value;
	}
	if (
		head !== undefined &&
		LEGACY_BOOLEAN_MAPS.has(head) &&
		rest.length === 1
	) {
		if (value === '1') {
			return true;
		}
		if (value === '0') {
			return false;
		}
	}
	return value;
};

const decodeLegacyCompact = function decodeLegacyCompact(
	text: string
): Record<string, unknown> | null {
	const expanded = expandFlatKeys(stringToFlat(text));
	const result: Record<string, unknown> = {};
	let leaves = 0;
	for (const [flatKey, value] of Object.entries(expanded)) {
		const path = flatKey.split('.');
		if (path.length === 0 || path.includes('__proto__')) {
			continue;
		}
		let current = result;
		for (const segment of path.slice(0, -1)) {
			const existing = Object.hasOwn(current, segment)
				? current[segment]
				: undefined;
			if (!isPlainRecord(existing)) {
				current[segment] = {};
			}
			current = current[segment] as Record<string, unknown>;
		}
		const leaf = path.at(-1);
		if (leaf === undefined) {
			continue;
		}
		current[leaf] = typeLegacyCompactLeaf(path, value);
		leaves += 1;
	}
	return leaves > 0 ? result : null;
};

type RecognizedCookieForm =
	| { kind: 'versioned'; text: string }
	| { kind: 'json'; text: string }
	| { kind: 'legacy-compact'; text: string };

const VERSION_FIELD_START = /^v=/u;

const recognizeCookieForm = function recognizeCookieForm(
	value: string
): RecognizedCookieForm | null {
	const text = value.trim();
	if (text.length === 0) {
		return null;
	}
	if (VERSION_FIELD_START.test(text)) {
		return { kind: 'versioned', text };
	}
	if (text.startsWith('{')) {
		return { kind: 'json', text };
	}
	if (text.includes(':')) {
		return { kind: 'legacy-compact', text };
	}
	return null;
};

export const parseRawCookieCandidate = function parseRawCookieCandidate(
	rawValue: string | null | undefined,
	key: string
): RawStoredCandidate {
	const source: StoredRecordSource = 'cookie';
	if (rawValue === null || rawValue === undefined || rawValue === '') {
		return { key, source, status: 'absent' };
	}
	let form = recognizeCookieForm(rawValue);
	if (!form && rawValue.includes('%')) {
		const unwrapped = decodeComponent(rawValue);
		if (unwrapped !== null) {
			form = recognizeCookieForm(unwrapped);
		}
	}
	if (!form) {
		return { key, source, status: 'unparseable' };
	}
	if (form.kind === 'versioned') {
		return {
			encoding: 'compact',
			format: 'compact-v3',
			key,
			rawText: form.text,
			source,
			status: 'parsed',
			value: undefined,
		};
	}
	if (form.kind === 'json') {
		const value = parseJsonText(form.text);
		if (!isPlainRecord(value)) {
			return { key, source, status: 'unparseable' };
		}
		return {
			encoding: 'json',
			format: 'parsed',
			key,
			rawText: form.text,
			source,
			status: 'parsed',
			value,
		};
	}
	const value = decodeLegacyCompact(form.text);
	if (value === null) {
		return { key, source, status: 'unparseable' };
	}
	return {
		encoding: 'compact',
		format: 'parsed',
		key,
		rawText: form.text,
		source,
		status: 'parsed',
		value,
	};
};

const readLocalStorageText = function readLocalStorageText(
	key: string,
	onUnavailable?: () => void
): string | null {
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			return window.localStorage.getItem(key);
		}
	} catch (error) {
		console.warn('Failed to read consent from localStorage:', error);
	}
	onUnavailable?.();
	return null;
};

const parseLocalStorageCandidate = function parseLocalStorageCandidate(
	source: StoredRecordSource,
	key: string,
	onUnavailable?: () => void
): RawStoredCandidate {
	const text = readLocalStorageText(key, onUnavailable);
	if (text === null || text === '') {
		return { key, source, status: 'absent' };
	}
	const value = parseJsonText(text);
	if (!isPlainRecord(value)) {
		return { key, source, status: 'unparseable' };
	}
	return {
		encoding: 'json',
		format: 'parsed',
		key,
		rawText: text,
		source,
		status: 'parsed',
		value,
	};
};

export const readRawStoredConsentCandidates =
	function readRawStoredConsentCandidates(
		config?: StorageConfig,
		onUnavailable?: () => void
	): RawStoredCandidate[] {
		const keys = resolveStorageKeys(config);
		const candidates: RawStoredCandidate[] = [
			parseRawCookieCandidate(
				getRawCookieValue(keys.consent, onUnavailable),
				keys.consent
			),
			parseLocalStorageCandidate('local-storage', keys.consent, onUnavailable),
		];
		if (keys.legacyConsent) {
			candidates.push(
				parseLocalStorageCandidate(
					'legacy-local-storage',
					keys.legacyConsent,
					onUnavailable
				)
			);
		}
		return candidates;
	};

export const readRawStoredConsentCandidateFromCookieHeader =
	function readRawStoredConsentCandidateFromCookieHeader(
		cookieHeader: string | undefined,
		config?: StorageConfig
	): RawStoredCandidate {
		const keys = resolveStorageKeys(config);
		return parseRawCookieCandidate(
			readCookieValueFromHeader(cookieHeader, keys.consent),
			keys.consent
		);
	};

const LEGACY_IAB_KEYS = {
	consents: 'iabCustomVendorConsents',
	legitimateInterests: 'iabCustomVendorLegitimateInterests',
} as const;

const decodeLegacyRecord = function decodeLegacyRecord(
	value: unknown,
	encoding: LegacyRecordEncoding,
	now: number
): DecodeResult<Omit<DecodedStoredConsent, 'source' | 'key' | 'encoding'>> {
	const normalized = normalizeLegacyConsentRecord(value, { encoding, now });
	if (normalized.ok === false) {
		return { issues: normalized.issues, ok: false };
	}
	const issues: StorageIssue[] = [];
	const record = value as Record<string, unknown>;
	const iab = validateIabMetadata(
		ownValue(record, LEGACY_IAB_KEYS.consents),
		ownValue(record, LEGACY_IAB_KEYS.legitimateInterests),
		'iab',
		issues
	);
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	return {
		ok: true,
		record: {
			choice: normalized.choice,
			epoch: 0,
			format: 'legacy-v2',
			iab: iab ?? null,
			subject: normalized.subject,
		},
	};
};

const decodeEnvelope = function decodeEnvelope(
	result: DecodeResult<StoredConsentEnvelope>
): DecodeResult<Omit<DecodedStoredConsent, 'source' | 'key' | 'encoding'>> {
	if (result.ok === false) {
		return result;
	}
	const { record } = result;
	return {
		ok: true,
		record: {
			choice: { categories: record.categories, version: 3 },
			epoch: record.epoch ?? 0,
			format: 'v3',
			iab: record.iab ?? null,
			subject: record.subject ?? null,
		},
	};
};

export const decodeStoredConsentCandidate =
	function decodeStoredConsentCandidate(
		candidate: RawStoredCandidate,
		now: number
	): StoredConsentCandidate {
		if (candidate.status !== 'parsed') {
			return candidate;
		}
		const { encoding, key, source } = candidate;
		let format: StoredRecordFormat;
		let result: DecodeResult<
			Omit<DecodedStoredConsent, 'source' | 'key' | 'encoding'>
		>;
		if (candidate.format === 'compact-v3') {
			format = 'v3';
			result = decodeEnvelope(
				decodeStoredConsentEnvelopeCompact(candidate.rawText, now)
			);
		} else if (
			isPlainRecord(candidate.value) &&
			Object.hasOwn(candidate.value, 'version')
		) {
			format = 'v3';
			result = decodeEnvelope(
				validateStoredConsentEnvelope(candidate.value, now)
			);
		} else {
			format = 'legacy-v2';
			result = decodeLegacyRecord(candidate.value, encoding, now);
		}
		if (result.ok === false) {
			return {
				encoding,
				format,
				issues: result.issues,
				key,
				source,
				status: 'invalid',
			};
		}
		return {
			key,
			record: { ...result.record, encoding, key, source },
			source,
			status: 'valid',
		};
	};

const categoriesSinceEpoch = function categoriesSinceEpoch(
	record: DecodedStoredConsent,
	epoch: number
): ExplicitChoice['categories'] {
	return (
		choiceSinceEpoch(record.choice, epoch, record.epoch === epoch)
			?.categories ?? {}
	);
};

export const isNewerDenial = function isNewerDenial(
	decision: CategoryDecision | undefined,
	current: CategoryDecision | undefined
): decision is CategoryDecision {
	return (
		decision?.value === false &&
		(!current ||
			decision.confirmedAt > current.confirmedAt ||
			(decision.confirmedAt === current.confirmedAt && current.value))
	);
};

const withNewerLocalDenials = function withNewerLocalDenials(
	cookie: DecodedStoredConsent,
	local: DecodedStoredConsent,
	localIsNewer: boolean
): DecodedStoredConsent {
	const epoch = Math.max(cookie.epoch, local.epoch);
	const categories = categoriesSinceEpoch(cookie, epoch);
	const cut =
		Object.keys(categories).length !==
		Object.keys(cookie.choice.categories).length;
	let changed = cut || epoch !== cookie.epoch;
	for (const [category, decision] of Object.entries(
		categoriesSinceEpoch(local, epoch)
	)) {
		if (
			isNewerDenial(decision, categories[category as keyof typeof categories])
		) {
			categories[category as keyof typeof categories] = decision;
			changed = true;
		}
	}
	const identity =
		local.epoch > cookie.epoch || (local.epoch === epoch && localIsNewer)
			? local
			: cookie;
	if (!changed && identity === cookie) {
		return cookie;
	}
	return {
		...cookie,
		choice: changed ? { categories, version: 3 } : cookie.choice,
		epoch,
		iab: identity.iab,
		subject: identity.subject,
	};
};

export const selectStoredConsent = function selectStoredConsent(
	rawCandidates: readonly RawStoredCandidate[],
	now: number,
	localIsNewer = false
): StoredConsentSelection {
	const candidates: StoredConsentCandidate[] = [];
	const valid = new Map<StoredRecordSource, DecodedStoredConsent>();
	for (const raw of rawCandidates) {
		const candidate = decodeStoredConsentCandidate(raw, now);
		candidates.push(candidate);
		if (candidate.status === 'valid' && !valid.has(candidate.source)) {
			valid.set(candidate.source, candidate.record);
		}
	}
	const cookie = valid.get('cookie');
	const local = valid.get('local-storage');
	let selected: DecodedStoredConsent | null = null;
	if (cookie && local) {
		selected = withNewerLocalDenials(cookie, local, localIsNewer);
	} else {
		selected = cookie ?? local ?? valid.get('legacy-local-storage') ?? null;
	}
	return { candidates, selected };
};

export const readStoredConsentRecord = function readStoredConsentRecord(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void
): StoredConsentSelection {
	const keys = resolveStorageKeys(config);
	const miss = readLocalStorageText(keys.cookieMiss);
	return selectStoredConsent(
		readRawStoredConsentCandidates(config, onUnavailable),
		now,
		miss !== null && miss === (getRawCookieValue(keys.consent) ?? '')
	);
};

export const readStoredConsentRecordFromCookieHeader =
	function readStoredConsentRecordFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): StoredConsentSelection {
		return selectStoredConsent(
			[readRawStoredConsentCandidateFromCookieHeader(cookieHeader, config)],
			now
		);
	};

const readLocalJson = function readLocalJson<RecordType>(
	key: string,
	decode: (value: unknown) => DecodeResult<RecordType>,
	onUnavailable?: () => void
): DecodeResult<RecordType> | null {
	const text = readLocalStorageText(key, onUnavailable);
	if (text === null || text === '') {
		return null;
	}
	const value = parseJsonText(text);
	if (value === undefined) {
		return {
			issues: [{ code: 'malformed-encoding', path: '' }],
			ok: false,
		};
	}
	return decode(value);
};

const readCompactCookie = function readCompactCookie<RecordType>(
	rawValue: string | null | undefined,
	decode: (text: string) => DecodeResult<RecordType>
): DecodeResult<RecordType> | null {
	if (rawValue === null || rawValue === undefined) {
		return null;
	}
	const text = rawValue.trim();
	if (text === '') {
		return null;
	}
	if (text.startsWith('v=')) {
		return decode(text);
	}
	if (text.includes('%')) {
		const unwrapped = decodeComponent(text);
		if (unwrapped !== null && unwrapped.trim().startsWith('v=')) {
			return decode(unwrapped.trim());
		}
	}
	return { issues: [{ code: 'malformed-encoding', path: '' }], ok: false };
};

const noticeWithSubjectCookie = function noticeWithSubjectCookie(
	notice: DecodeResult<StoredNoticeDismissal> | null,
	rawSubject: string | null | undefined,
	now: number
): DecodeResult<StoredNoticeDismissal> | null {
	if (!notice?.ok) {
		return notice;
	}
	const subject = readCompactCookie(rawSubject, (text) =>
		decodeNoticeDismissalCompact(text, now)
	);
	if (
		subject?.ok &&
		subject.record.subject &&
		subject.record.dismissedAt === notice.record.dismissedAt &&
		subject.record.fingerprint === notice.record.fingerprint
	) {
		return {
			ok: true,
			record: { ...notice.record, subject: subject.record.subject },
		};
	}
	return notice;
};

export const readStoredNoticeDismissal = function readStoredNoticeDismissal(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void
): DecodeResult<StoredNoticeDismissal> | null {
	const keys = resolveStorageKeys(config);
	const fromCookie = noticeWithSubjectCookie(
		readCompactCookie(getRawCookieValue(keys.notice, onUnavailable), (text) =>
			decodeNoticeDismissalCompact(text, now)
		),
		getRawCookieValue(keys.noticeSubject, onUnavailable),
		now
	);
	const fromLocal = readLocalJson(
		keys.notice,
		(value) => decodeNoticeDismissal(value, now),
		onUnavailable
	);
	if (fromCookie?.ok && fromLocal?.ok) {
		if (fromLocal.record.dismissedAt > fromCookie.record.dismissedAt) {
			return fromLocal;
		}
		if (
			fromLocal.record.dismissedAt === fromCookie.record.dismissedAt &&
			fromLocal.record.fingerprint === fromCookie.record.fingerprint &&
			readLocalStorageText(keys.noticeCookieMiss) ===
				JSON.stringify([
					getRawCookieValue(keys.notice) ?? '',
					getRawCookieValue(keys.noticeSubject) ?? '',
				])
		) {
			return fromLocal;
		}
		return fromCookie;
	}
	if (fromCookie?.ok) {
		return fromCookie;
	}
	return fromLocal ?? fromCookie;
};

export const readStoredNoticeDismissalFromCookieHeader =
	function readStoredNoticeDismissalFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): DecodeResult<StoredNoticeDismissal> | null {
		const keys = resolveStorageKeys(config);
		return noticeWithSubjectCookie(
			readCompactCookie(
				readCookieValueFromHeader(cookieHeader, keys.notice),
				(text) => decodeNoticeDismissalCompact(text, now)
			),
			readCookieValueFromHeader(cookieHeader, keys.noticeSubject),
			now
		);
	};

const newerEpoch = function newerEpoch(
	result: DecodeResult<number> | null,
	current: number
): number {
	return result?.ok && result.record > current ? result.record : current;
};

const readRawEpoch = function readRawEpoch(
	text: string | null | undefined,
	now: number
): DecodeResult<number> | null {
	const trimmed = text?.trim();
	return trimmed ? decodeClearEpoch(trimmed, now) : null;
};

export const readStoredClearEpoch = function readStoredClearEpoch(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void
): number {
	const keys = resolveStorageKeys(config);
	const fromCookie = readRawEpoch(
		getRawCookieValue(keys.epoch, onUnavailable),
		now
	);
	const fromLocal = readRawEpoch(
		readLocalStorageText(keys.epoch, onUnavailable),
		now
	);
	return newerEpoch(fromLocal, newerEpoch(fromCookie, 0));
};

export const readStoredClearEpochFromCookieHeader =
	function readStoredClearEpochFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): number {
		const keys = resolveStorageKeys(config);
		return newerEpoch(
			readRawEpoch(readCookieValueFromHeader(cookieHeader, keys.epoch), now),
			0
		);
	};

const validSubjectId = function validSubjectId(
	text: string | null | undefined
): string | null {
	return isNonEmptyString(text) ? text : null;
};

const cookieSubjectId = function cookieSubjectId(
	raw: string | null | undefined
): string | null {
	return raw ? validSubjectId(decodeComponent(raw)) : null;
};

export const readStoredCookieSubjectId = function readStoredCookieSubjectId(
	config: StorageConfig | undefined
): string | null {
	return cookieSubjectId(getRawCookieValue(resolveStorageKeys(config).subject));
};

export const readStoredSubjectId = function readStoredSubjectId(
	config: StorageConfig | undefined,
	onUnavailable?: () => void
): string | null {
	const keys = resolveStorageKeys(config);
	return (
		cookieSubjectId(getRawCookieValue(keys.subject, onUnavailable)) ??
		validSubjectId(readLocalStorageText(keys.subject, onUnavailable))
	);
};

export const readSyncedSubjectId = function readSyncedSubjectId(
	config: StorageConfig | undefined
): string | null {
	const keys = resolveStorageKeys(config);
	let cookieBlocked = false;
	let localBlocked = false;
	const cookie = cookieSubjectId(
		getRawCookieValue(keys.subject, () => {
			cookieBlocked = true;
		})
	);
	const local = validSubjectId(
		readLocalStorageText(keys.subject, () => {
			localBlocked = true;
		})
	);
	if (cookieBlocked) {
		return local;
	}
	if (localBlocked) {
		return cookie;
	}
	return cookie === local ? cookie : null;
};

export const readStoredSubjectIdFromCookieHeader =
	function readStoredSubjectIdFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined
	): string | null {
		return cookieSubjectId(
			readCookieValueFromHeader(
				cookieHeader,
				resolveStorageKeys(config).subject
			)
		);
	};

export const readStoredVendorChoice = function readStoredVendorChoice(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void,
	epoch: number = readStoredClearEpoch(config, now)
): DecodeResult<StoredVendorChoice> | null {
	const keys = resolveStorageKeys(config);
	const sinceEpoch = (
		read: DecodeResult<StoredVendorChoice> | null
	): DecodeResult<StoredVendorChoice> | null =>
		read?.ok && read.record.confirmedAt < epoch ? null : read;
	const fromCookie = sinceEpoch(
		readCompactCookie(getRawCookieValue(keys.vendors, onUnavailable), (text) =>
			decodeVendorChoiceCompact(text, now)
		)
	);
	const fromLocal = sinceEpoch(
		readLocalJson(
			keys.vendors,
			(value) => decodeVendorChoice(value, now),
			onUnavailable
		)
	);
	if (fromCookie?.ok && fromLocal?.ok) {
		if (fromLocal.record.confirmedAt < fromCookie.record.confirmedAt) {
			return fromCookie;
		}
		const denied = [
			...new Set([...fromCookie.record.denied, ...fromLocal.record.denied]),
		].sort();
		return { ok: true, record: { ...fromLocal.record, denied } };
	}
	if (fromCookie?.ok) {
		return fromCookie;
	}
	return fromLocal ?? fromCookie;
};

export const readStoredVendorChoiceFromCookieHeader =
	function readStoredVendorChoiceFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): DecodeResult<StoredVendorChoice> | null {
		const keys = resolveStorageKeys(config);
		return readCompactCookie(
			readCookieValueFromHeader(cookieHeader, keys.vendors),
			(text) => decodeVendorChoiceCompact(text, now)
		);
	};
