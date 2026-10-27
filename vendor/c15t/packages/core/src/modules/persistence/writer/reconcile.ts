import type {
	ConsentSubject,
	ExplicitChoice,
	NoticeDismissal,
} from '../../../consent-record/types';
import type {
	ConsentSnapshot,
	HydrationRecords,
	VendorChoice,
} from '../../../types';
import type { StoredRecords } from '../hydrate';
import type { PersistenceTools } from './types';

type Rules = Pick<
	PersistenceTools,
	'choiceSince' | 'merge' | 'noticeSince' | 'vendorsSince'
>;

export type StoredRead = Pick<
	StoredRecords,
	'records' | 'vendorSubject' | 'noticeSubject' | 'subjectCarrier' | 'epoch'
>;

const canonical = function canonical(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonical);
	}
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => (left < right ? -1 : 1))
			.map(([key, entry]) => [key, canonical(entry)]);
		return Object.fromEntries(entries);
	}
	return value;
};

export const sameRecord = function sameRecord(
	left: unknown,
	right: unknown
): boolean {
	return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};

const latestDecisionAt = function latestDecisionAt(
	choice: ExplicitChoice | null | undefined
): number {
	let latest = Number.NEGATIVE_INFINITY;
	for (const decision of Object.values(choice?.categories ?? {})) {
		if (decision && decision.confirmedAt > latest) {
			latest = decision.confirmedAt;
		}
	}
	return latest;
};

const hasNewerIdentity = function hasNewerIdentity(
	subject: ConsentSubject | null | undefined,
	than: ConsentSubject | null | undefined
): boolean {
	return Boolean(
		(subject?.externalId && subject.externalId !== than?.externalId) ||
		(subject?.identityProvider &&
			subject.identityProvider !== than?.identityProvider)
	);
};

export const subjectToWrite = function subjectToWrite(
	ours: ConsentSubject | null,
	stored: ConsentSubject | null | undefined,
	oursYields: boolean,
	identityYields = false
): ConsentSubject | null {
	if (!stored || Object.keys(stored).length === 0) {
		return ours;
	}
	if (!ours) {
		return { ...stored };
	}
	if ((!identityYields && hasNewerIdentity(ours, stored)) || !oursYields) {
		return { ...stored, ...ours };
	}
	return { ...ours, ...stored };
};

export const choiceToWrite = function choiceToWrite(
	ours: ExplicitChoice | null,
	stored: ExplicitChoice | null,
	subjectOnly: boolean,
	storedWinsTies: boolean,
	merge: Rules['merge']
): ExplicitChoice | null {
	if (!ours) {
		return null;
	}
	if (subjectOnly) {
		return !storedWinsTies &&
			stored !== null &&
			sameRecord(stored.categories, ours.categories)
			? ours
			: null;
	}
	if (!stored) {
		return ours;
	}
	return storedWinsTies ? merge(stored, ours) : merge(ours, stored);
};

const isNewerThanStored = function isNewerThanStored(
	oursAt: number,
	storedAt: number,
	storedWinsTies: boolean
): boolean {
	return storedWinsTies ? oursAt > storedAt : oursAt >= storedAt;
};

export const mayWriteVendorChoice = function mayWriteVendorChoice(
	ours: VendorChoice | null,
	stored: VendorChoice | null,
	subjectOnly: boolean,
	storedWinsTies: boolean
): boolean {
	if (!stored) {
		return !subjectOnly;
	}
	if (!ours) {
		return false;
	}
	if (subjectOnly) {
		return (
			!storedWinsTies &&
			stored.confirmedAt === ours.confirmedAt &&
			sameRecord(stored.denied, ours.denied)
		);
	}
	return isNewerThanStored(
		ours.confirmedAt,
		stored.confirmedAt,
		storedWinsTies
	);
};

export const mayWriteNotice = function mayWriteNotice(
	ours: NoticeDismissal | null,
	stored: NoticeDismissal | null,
	storedWinsTies: boolean
): boolean {
	if (!(ours && stored)) {
		return true;
	}
	return isNewerThanStored(
		ours.dismissedAt,
		stored.dismissedAt,
		storedWinsTies
	);
};

export type StoredRecordKind = 'choice' | 'notice' | 'vendors';

export type StorageFingerprints = Partial<Record<StoredRecordKind, string>>;

const fingerprint = function fingerprint(value: unknown): string {
	return JSON.stringify(canonical(value));
};

const ABSENT: Record<StoredRecordKind, string> = {
	choice: fingerprint(null),
	notice: fingerprint([null, null]),
	vendors: fingerprint([null, null]),
};

export const fingerprintStoredRecords = function fingerprintStoredRecords(
	read: StoredRead
): StorageFingerprints {
	const { records: stored } = read;
	const prints: StorageFingerprints = {};
	if (stored.choice !== undefined) {
		prints.choice =
			stored.choice === null
				? ABSENT.choice
				: fingerprint([stored.choice, stored.subject ?? null]);
	}
	if (stored.noticeDismissal !== undefined) {
		prints.notice = fingerprint([
			stored.noticeDismissal,
			read.noticeSubject ?? null,
		]);
	}
	if (stored.vendorChoice !== undefined) {
		prints.vendors = fingerprint([
			stored.vendorChoice,
			stored.vendorChoice ? read.vendorSubject : null,
		]);
	}
	return prints;
};

interface Movement {
	changed: (kind: StoredRecordKind) => boolean;
	removed: (kind: StoredRecordKind) => boolean;
}

const adoptNewer = function adoptNewer<RecordType>(
	current: RecordType | null,
	stored: RecordType | null,
	removed: boolean,
	timeOf: (record: RecordType) => number
): boolean {
	if (sameRecord(current, stored)) {
		return false;
	}
	if (stored === null) {
		return removed;
	}
	if (current === null) {
		return true;
	}
	return timeOf(stored) >= timeOf(current);
};

export const subjectAfterClear = function subjectAfterClear(
	subject: ConsentSubject | null | undefined
): ConsentSubject | null {
	return subject?.subjectId ? { subjectId: subject.subjectId } : null;
};

export interface SubjectProvenance {
	identityYields: boolean;
	noticeCarried: ConsentSubject | null;
	seenCarrier: StoredRead['subjectCarrier'] | undefined;
}

const prefersStoredSubject = function prefersStoredSubject(
	memory: ConsentSubject | null,
	stored: ConsentSubject | null | undefined,
	storedAt: number,
	memoryAt: number,
	subjectYields: boolean,
	provenance: SubjectProvenance
): stored is ConsentSubject {
	if (
		!stored ||
		(!provenance.identityYields && hasNewerIdentity(memory, stored))
	) {
		return false;
	}
	return subjectYields ? storedAt >= memoryAt : storedAt > memoryAt;
};

const subjectAfterRemoval = function subjectAfterRemoval(
	snapshot: ConsentSnapshot,
	stored: HydrationRecords,
	carried: ConsentSubject | null,
	movement: Movement,
	subjectYields: boolean,
	provenance: SubjectProvenance
): HydrationRecords['subject'] {
	if (!(stored.subject && carried)) {
		return subjectAfterClear(snapshot.subject);
	}
	return movement.changed('vendors') &&
		prefersStoredSubject(
			snapshot.subject,
			stored.subject,
			stored.vendorChoice?.confirmedAt ?? Number.NEGATIVE_INFINITY,
			snapshot.vendorChoice?.confirmedAt ?? Number.NEGATIVE_INFINITY,
			subjectYields,
			provenance
		)
		? stored.subject
		: undefined;
};

const reconcileNoticeSubject = function reconcileNoticeSubject(
	snapshot: ConsentSnapshot,
	stored: HydrationRecords,
	carries: boolean,
	movement: Movement,
	subjectYields: boolean,
	provenance: SubjectProvenance,
	candidate: HydrationRecords['subject']
): HydrationRecords['subject'] {
	if (carries && movement.changed('notice')) {
		if (movement.removed('notice')) {
			return stored.choice === null && stored.vendorChoice === null
				? subjectAfterClear(snapshot.subject)
				: candidate;
		} else if (
			prefersStoredSubject(
				snapshot.subject,
				stored.subject,
				stored.noticeDismissal?.dismissedAt ?? Number.NEGATIVE_INFINITY,
				snapshot.noticeDismissal?.dismissedAt ?? Number.NEGATIVE_INFINITY,
				subjectYields,
				provenance
			)
		) {
			return stored.subject;
		}
	}
	return candidate;
};

const subjectAfterNoticeLeft = function subjectAfterNoticeLeft(
	snapshot: ConsentSnapshot,
	carrier: StoredRead['subjectCarrier'],
	noticeCarried: ConsentSubject | null,
	movement: Movement,
	candidate: HydrationRecords['subject']
): HydrationRecords['subject'] {
	return carrier === null &&
		noticeCarried &&
		movement.changed('notice') &&
		sameRecord(snapshot.subject, noticeCarried)
		? subjectAfterClear(snapshot.subject)
		: candidate;
};

const reconcileSubject = function reconcileSubject(
	snapshot: ConsentSnapshot,
	stored: HydrationRecords,
	carried: ConsentSubject | null,
	carrier: StoredRead['subjectCarrier'],
	provenance: SubjectProvenance,
	records: HydrationRecords,
	recordMovement: Movement,
	subjectYields: boolean
): HydrationRecords['subject'] {
	const { explicitChoice, vendorChoice } = snapshot;
	const carries = (kind: StoredRecordKind, present: boolean): boolean =>
		carrier === kind || (carrier === null && present);
	const movement: Movement = {
		changed: (kind) =>
			recordMovement.changed(kind) ||
			(carrier === kind && provenance.seenCarrier !== carrier),
		removed: recordMovement.removed,
	};
	let candidate: HydrationRecords['subject'];
	if (records.choice === null) {
		candidate = subjectAfterRemoval(
			snapshot,
			stored,
			carried,
			movement,
			subjectYields,
			provenance
		);
	} else if (stored.choice && carries('choice', true)) {
		const relevant = movement.changed('choice') || records.choice !== undefined;
		if (
			relevant &&
			prefersStoredSubject(
				snapshot.subject,
				stored.subject,
				latestDecisionAt(stored.choice),
				latestDecisionAt(explicitChoice),
				subjectYields,
				provenance
			)
		) {
			candidate = stored.subject;
		}
	} else if (
		carries('vendors', explicitChoice === null) &&
		movement.changed('vendors')
	) {
		if (stored.choice === null && movement.removed('vendors')) {
			candidate = subjectAfterClear(snapshot.subject);
		} else if (
			prefersStoredSubject(
				snapshot.subject,
				stored.subject,
				stored.vendorChoice?.confirmedAt ?? Number.NEGATIVE_INFINITY,
				vendorChoice?.confirmedAt ?? Number.NEGATIVE_INFINITY,
				subjectYields,
				provenance
			)
		) {
			candidate = stored.subject;
		}
	}
	candidate = subjectAfterNoticeLeft(
		snapshot,
		carrier,
		provenance.noticeCarried,
		movement,
		candidate
	);
	candidate = reconcileNoticeSubject(
		snapshot,
		stored,
		carries(
			'notice',
			explicitChoice === null && !stored.choice && !stored.vendorChoice
		),
		movement,
		subjectYields,
		provenance,
		candidate
	);
	return candidate !== undefined && !sameRecord(snapshot.subject, candidate)
		? candidate
		: undefined;
};

const reconcileChoice = function reconcileChoice(
	snapshot: ConsentSnapshot,
	stored: HydrationRecords,
	carried: ConsentSubject | null,
	carrier: StoredRead['subjectCarrier'],
	provenance: SubjectProvenance,
	movement: Movement,
	subjectYields: boolean,
	merge: Rules['merge']
): HydrationRecords {
	const records: HydrationRecords = {};
	const { explicitChoice } = snapshot;
	if (stored.choice === null) {
		if (movement.removed('choice') && explicitChoice !== null) {
			records.choice = null;
		}
	} else if (stored.choice && movement.changed('choice')) {
		const merged = merge(stored.choice, explicitChoice);
		if (!sameRecord(merged, explicitChoice)) {
			records.choice = merged;
		}
	}
	const subject = reconcileSubject(
		snapshot,
		stored,
		carried,
		carrier,
		provenance,
		records,
		movement,
		subjectYields
	);
	if (subject !== undefined) {
		records.subject = subject;
	}
	return records;
};

export interface ReconciledRecords {
	records: HydrationRecords | null;
	seen: StorageFingerprints;
}

const sinceEpoch = function sinceEpoch(
	snapshot: ConsentSnapshot,
	epoch: number,
	clearMissed: boolean,
	subjectSurvives: boolean,
	rules: Rules
): ConsentSnapshot {
	return {
		...snapshot,
		explicitChoice: rules.choiceSince(
			snapshot.explicitChoice,
			epoch,
			!clearMissed
		),
		noticeDismissal: rules.noticeSince(snapshot.noticeDismissal, epoch),
		subject:
			clearMissed && !subjectSurvives
				? subjectAfterClear(snapshot.subject)
				: snapshot.subject,
		vendorChoice: rules.vendorsSince(snapshot.vendorChoice, epoch),
	};
};

const EPOCH_FIELDS = [
	['choice', 'explicitChoice'],
	['noticeDismissal', 'noticeDismissal'],
	['subject', 'subject'],
	['vendorChoice', 'vendorChoice'],
] as const;

const applyVoided = function applyVoided(
	records: HydrationRecords,
	view: ConsentSnapshot,
	snapshot: ConsentSnapshot
): void {
	for (const [recordKey, snapshotKey] of EPOCH_FIELDS) {
		if (
			records[recordKey] === undefined &&
			view[snapshotKey] !== snapshot[snapshotKey]
		) {
			Object.assign(records, { [recordKey]: view[snapshotKey] });
		}
	}
};

export const selectReconciledRecords = function selectReconciledRecords(
	snapshot: ConsentSnapshot,
	read: StoredRead,
	seen: StorageFingerprints,
	now: number,
	subjectYields: boolean,
	unadopted: ReadonlySet<StoredRecordKind>,
	memoryEpoch: number,
	subjectBornAfterEpoch: boolean,
	provenance: SubjectProvenance,
	rules: Rules
): ReconciledRecords {
	const { records: stored } = read;
	const clearMissed = read.epoch > memoryEpoch;
	const view = sinceEpoch(
		snapshot,
		read.epoch,
		clearMissed,
		subjectBornAfterEpoch,
		rules
	);
	const current = fingerprintStoredRecords(read);
	const movement: Movement = {
		changed: (kind) =>
			current[kind] !== undefined &&
			(current[kind] !== seen[kind] || unadopted.has(kind)),
		removed: (kind) =>
			current[kind] === ABSENT[kind] &&
			seen[kind] !== undefined &&
			seen[kind] !== ABSENT[kind],
	};
	const records = reconcileChoice(
		view,
		stored,
		read.vendorSubject ?? read.noticeSubject ?? null,
		read.subjectCarrier,
		provenance,
		movement,
		subjectYields || clearMissed,
		rules.merge
	);

	if (
		movement.changed('vendors') &&
		adoptNewer(
			view.vendorChoice,
			stored.vendorChoice ?? null,
			movement.removed('vendors'),
			(record) => record.confirmedAt
		)
	) {
		records.vendorChoice = stored.vendorChoice ?? null;
	}

	if (
		movement.changed('notice') &&
		adoptNewer(
			view.noticeDismissal,
			stored.noticeDismissal ?? null,
			movement.removed('notice'),
			(record) => record.dismissedAt
		)
	) {
		records.noticeDismissal = stored.noticeDismissal ?? null;
	}

	applyVoided(records, view, snapshot);

	return {
		records: Object.keys(records).length > 0 ? { ...records, now } : null,
		seen: { ...seen, ...current },
	};
};
