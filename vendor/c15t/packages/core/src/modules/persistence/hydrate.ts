import type { ConsentSubject } from '../../consent-record/types';
import type { InternalKernel } from '../../kernel/internals';
import type { HydrationRecords } from '../../types';
import {
	choiceSinceEpoch,
	noticeSinceEpoch,
	vendorChoiceSinceEpoch,
} from './epoch';
import type {
	StoredIabMetadata,
	StoredNoticeDismissal,
	StoredVendorChoice,
} from './record-codec';
import {
	readStoredClearEpoch,
	readStoredClearEpochFromCookieHeader,
	readStoredConsentRecord,
	readStoredConsentRecordFromCookieHeader,
	readStoredNoticeDismissal,
	readStoredNoticeDismissalFromCookieHeader,
	readStoredSubjectId,
	readStoredSubjectIdFromCookieHeader,
	readStoredVendorChoice,
	readStoredVendorChoiceFromCookieHeader,
} from './record-storage';
import type { StoredConsentSelection } from './record-storage';
import type { StorageConfig } from './types';

export interface StoredRecords {
	records: HydrationRecords;
	iab: StoredIabMetadata | null;
	found: boolean;
	candidates: StoredConsentSelection['candidates'];
	vendorSubject: ConsentSubject | null;
	noticeSubject?: ConsentSubject | null;
	recordedSubjectId: string | null;
	subjectCarrier: 'choice' | 'vendors' | 'notice' | null;
	epoch: number;
}

const kernelVendorChoice = function kernelVendorChoice(
	record: StoredVendorChoice | null
): HydrationRecords['vendorChoice'] {
	if (!record) {
		return null;
	}
	const { subject: _subject, ...vendorChoice } = record;
	return vendorChoice;
};

const kernelNoticeDismissal = function kernelNoticeDismissal(
	record: StoredNoticeDismissal | null
): HydrationRecords['noticeDismissal'] {
	if (!record) {
		return null;
	}
	const { subject: _subject, ...dismissal } = record;
	return dismissal;
};

const envelopeSinceEpoch = function envelopeSinceEpoch(
	selected: StoredConsentSelection['selected'],
	writtenUnderEpoch: boolean
): StoredConsentSelection['selected'] {
	if (!selected || writtenUnderEpoch) {
		return selected;
	}
	return { ...selected, iab: null, subject: null };
};

const composeSubject = function composeSubject(
	recorded: ConsentSubject | null,
	storedSubjectId: string | null
): ConsentSubject | null {
	if (recorded?.subjectId || !storedSubjectId) {
		return recorded;
	}
	return { ...recorded, subjectId: storedSubjectId };
};

const subjectCarrier = function subjectCarrier(
	selected: StoredConsentSelection['selected'],
	vendorRecord: StoredVendorChoice | null,
	noticeRecord: StoredNoticeDismissal | null
): StoredRecords['subjectCarrier'] {
	if (selected?.subject) {
		return 'choice';
	}
	if (vendorRecord?.subject) {
		return 'vendors';
	}
	return noticeRecord?.subject ? 'notice' : null;
};

const recordedSubject = function recordedSubject(
	selected: StoredConsentSelection['selected'],
	vendorRecord: StoredVendorChoice | null,
	noticeRecord: StoredNoticeDismissal | null
): ConsentSubject | null {
	return (
		selected?.subject ?? vendorRecord?.subject ?? noticeRecord?.subject ?? null
	);
};

const composeRecords = function composeRecords(
	selection: StoredConsentSelection,
	notice: ReturnType<typeof readStoredNoticeDismissal>,
	vendors: ReturnType<typeof readStoredVendorChoice>,
	clearEpoch: number,
	storedSubjectId: string | null,
	now: number
): StoredRecords {
	const envelopeEpoch = selection.selected?.epoch ?? 0;
	const epoch = Math.max(clearEpoch, envelopeEpoch);
	const choice = choiceSinceEpoch(
		selection.selected?.choice ?? null,
		epoch,
		envelopeEpoch === epoch
	);
	const selected = choice
		? envelopeSinceEpoch(selection.selected, envelopeEpoch === epoch)
		: null;
	const vendorRecord = vendorChoiceSinceEpoch(
		vendors?.ok ? vendors.record : null,
		epoch
	);
	const noticeRecord = noticeSinceEpoch(
		notice?.ok ? notice.record : null,
		epoch
	);
	const recorded = recordedSubject(selected, vendorRecord, noticeRecord);
	const records: HydrationRecords = {
		choice,
		noticeDismissal: kernelNoticeDismissal(noticeRecord),
		now,
		subject: composeSubject(recorded, storedSubjectId),
		vendorChoice: kernelVendorChoice(vendorRecord),
	};
	return {
		candidates: selection.candidates,
		epoch,
		found:
			selected !== null ||
			vendorRecord !== null ||
			records.noticeDismissal !== null,
		iab: selected?.iab ?? null,
		noticeSubject: noticeRecord?.subject ?? null,
		recordedSubjectId: recorded?.subjectId ?? null,
		records,
		subjectCarrier: subjectCarrier(selected, vendorRecord, noticeRecord),
		vendorSubject: vendorRecord?.subject ?? null,
	};
};

const hasUndecodableChoice = function hasUndecodableChoice(
	selection: StoredConsentSelection
): boolean {
	return (
		selection.selected === null &&
		selection.candidates.some(
			(candidate) =>
				candidate.status === 'invalid' || candidate.status === 'unparseable'
		)
	);
};

interface Unreadable {
	choice: boolean;
	notice: boolean;
	vendors: boolean;
}

const markUndecodable = function markUndecodable(
	unreadable: Unreadable,
	selection: StoredConsentSelection,
	results: Record<'notice' | 'vendors', { ok: boolean } | null>
): void {
	unreadable.choice ||= hasUndecodableChoice(selection);
	unreadable.notice ||= results.notice?.ok === false;
	unreadable.vendors ||= results.vendors?.ok === false;
};

const readRecords = function readRecords(
	storageConfig: StorageConfig | undefined,
	now: number,
	preserveUndecodable: boolean
): StoredRecords {
	const unreadable: Unreadable = {
		choice: false,
		notice: false,
		vendors: false,
	};
	const selection = readStoredConsentRecord(storageConfig, now, () => {
		unreadable.choice = true;
	});
	const notice = readStoredNoticeDismissal(storageConfig, now, () => {
		unreadable.notice = true;
	});
	const clearEpoch = readStoredClearEpoch(storageConfig, now);
	const vendors = readStoredVendorChoice(
		storageConfig,
		now,
		() => {
			unreadable.vendors = true;
		},
		Math.max(clearEpoch, selection.selected?.epoch ?? 0)
	);
	const storedSubjectId = readStoredSubjectId(storageConfig);
	if (preserveUndecodable) {
		markUndecodable(unreadable, selection, { notice, vendors });
	}
	const {
		choice: choiceUnavailable,
		notice: noticeUnavailable,
		vendors: vendorsUnavailable,
	} = unreadable;
	const stored = composeRecords(
		selection,
		notice,
		vendors,
		clearEpoch,
		storedSubjectId,
		now
	);
	if (!selection.selected && choiceUnavailable) {
		delete stored.records.choice;
		if (!stored.records.vendorChoice && stored.subjectCarrier !== 'notice') {
			delete stored.records.subject;
		}
	}
	if (!notice?.ok && noticeUnavailable) {
		delete stored.records.noticeDismissal;
	}
	if (!vendors?.ok && vendorsUnavailable) {
		delete stored.records.vendorChoice;
	}
	return stored;
};

export const readStoredRecords = function readStoredRecords(
	storageConfig: StorageConfig | undefined,
	now: number
): StoredRecords {
	return readRecords(storageConfig, now, false);
};

export const readStoredRecordsForReconcile =
	function readStoredRecordsForReconcile(
		storageConfig: StorageConfig | undefined,
		now: number
	): StoredRecords {
		return readRecords(storageConfig, now, true);
	};

const composeFromCookieHeader = function composeFromCookieHeader(
	cookieHeader: string | undefined,
	storageConfig: StorageConfig | undefined,
	now: number
): StoredRecords {
	return composeRecords(
		readStoredConsentRecordFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredNoticeDismissalFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredVendorChoiceFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredClearEpochFromCookieHeader(cookieHeader, storageConfig, now),
		readStoredSubjectIdFromCookieHeader(cookieHeader, storageConfig),
		now
	);
};

export const readStoredRecordsFromCookieHeader =
	function readStoredRecordsFromCookieHeader(
		cookieHeader: string | undefined,
		storageConfig: StorageConfig | undefined,
		now: number
	): HydrationRecords {
		return composeFromCookieHeader(cookieHeader, storageConfig, now).records;
	};

export const readRecordedSubjectIdFromCookieHeader =
	function readRecordedSubjectIdFromCookieHeader(
		cookieHeader: string | undefined,
		storageConfig: StorageConfig | undefined,
		now: number
	): string | null {
		return composeFromCookieHeader(cookieHeader, storageConfig, now)
			.recordedSubjectId;
	};

export const hydrateFromStorage = function hydrateFromStorage(
	kernel: InternalKernel,
	storageConfig: StorageConfig | undefined,
	now: number,
	apply: (records: HydrationRecords, stored: StoredRecords) => HydrationRecords
): StoredRecords | null {
	if (typeof document === 'undefined') {
		return null;
	}
	const stored = readStoredRecords(storageConfig, now);
	const result = kernel.hydrate(apply(stored.records, stored));
	if (result.ok === false) {
		console.warn('[c15t] Stored consent records were rejected.', result.issues);
	}
	return stored;
};
