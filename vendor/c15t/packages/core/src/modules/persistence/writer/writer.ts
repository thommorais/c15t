import type {
	CategoryDecision,
	ConsentSubject,
	ExplicitChoice,
} from '../../../consent-record/types';
import type { ConsentSnapshot, HydrationRecords } from '../../../types';
import type { StoredRecords } from '../hydrate';
import type { StoredIabMetadata } from '../record-codec';
import {
	choiceToWrite,
	fingerprintStoredRecords,
	mayWriteNotice,
	mayWriteVendorChoice,
	sameRecord,
	selectReconciledRecords,
	subjectAfterClear,
	subjectToWrite,
} from './reconcile';
import type { StorageFingerprints, StoredRecordKind } from './reconcile';
import { createWriteScheduler } from './schedule';
import { createRecordStore } from './store';
import type {
	PersistenceContext,
	PersistenceTools,
	PersistenceWriter,
	WriteKind,
} from './types';
import {
	writeChoiceToStorage,
	writeNoticeToStorage,
	writeVendorChoiceToStorage,
} from './write';

export const createPersistenceWriter = function createPersistenceWriter(
	{ kernel, now, state, storageConfig }: PersistenceContext,
	tools: PersistenceTools
): PersistenceWriter {
	const store = createRecordStore(tools);

	let storedIab: StoredIabMetadata | null = null;

	let seen: StorageFingerprints = {};
	const unadopted = new Set<StoredRecordKind>();
	const ownDecisions = new Map<
		string,
		{ decision: CategoryDecision; epoch: number }
	>();
	let seenSubjectId: string | null | undefined;
	let memoryEpoch = 0;

	let seenNoticeSubject: ConsentSubject | null = null;
	let seenCarrier: StoredRecords['subjectCarrier'] | undefined;
	const rememberNoticeSubject = function rememberNoticeSubject(
		read: StoredRecords
	): void {
		if (read.records.noticeDismissal !== undefined) {
			seenNoticeSubject =
				read.subjectCarrier === 'notice' ? (read.noticeSubject ?? null) : null;
		}
	};

	let seenSubject: ConsentSubject | null = null;
	const rememberSubject = function rememberSubject(
		records: HydrationRecords
	): void {
		if (records.subject !== undefined) {
			seenSubjectId = records.subject?.subjectId ?? null;
			seenSubject = records.subject ?? null;
		}
	};

	const identityYields = function identityYields(): boolean {
		const { subject, user } = kernel.getSnapshot();
		const identity = [subject?.externalId, subject?.identityProvider];
		return (
			identity.some(Boolean) &&
			identity[0] === seenSubject?.externalId &&
			identity[1] === seenSubject?.identityProvider &&
			!(
				user?.externalId === identity[0] &&
				user?.identityProvider === identity[1]
			)
		);
	};

	const subjectYields = function subjectYields(): boolean {
		const id = kernel.getSnapshot().subject?.subjectId;
		return !id || id === state.freshSubjectId || id === seenSubjectId;
	};

	const observe = function observe(kind?: StoredRecordKind): void {
		if (typeof document === 'undefined') {
			return;
		}
		const read = tools.read(storageConfig, now());
		const prints = fingerprintStoredRecords(read);
		if (kind) {
			seen[kind] = prints[kind];
		} else {
			seen = prints;
		}
		if (kind === undefined || kind === 'notice') {
			rememberNoticeSubject(read);
		}
		if (kind === undefined || kind === 'choice') {
			rememberSubject(read.records);
		}
		if (kind === undefined) {
			memoryEpoch = read.epoch;
			seenCarrier = read.subjectCarrier;
		}
	};

	const subjectBornAfter = function subjectBornAfter(epoch: number): boolean {
		const id = kernel.getSnapshot().subject?.subjectId;
		return (
			id !== undefined &&
			id === state.freshSubjectId &&
			state.freshSubjectAt !== undefined &&
			state.freshSubjectAt > epoch
		);
	};

	const changedSinceSeen = function changedSinceSeen(
		kind: StoredRecordKind,
		read: StoredRecords
	): boolean {
		const print = fingerprintStoredRecords(read)[kind];
		return (print !== undefined && print !== seen[kind]) || unadopted.has(kind);
	};

	const markWritten = function markWritten(
		kind: StoredRecordKind,
		wroteOwnState: boolean
	): void {
		observe(kind);
		if (wroteOwnState) {
			unadopted.delete(kind);
		} else {
			unadopted.add(kind);
		}
	};

	const writtenSubject = function writtenSubject(
		snapshot: ConsentSnapshot,
		stored: ConsentSubject | null | undefined,
		subjectOnly: boolean,
		read: StoredRecords
	): ConsentSubject | null {
		if (subjectOnly) {
			return snapshot.subject;
		}
		if (read.epoch > memoryEpoch && !subjectBornAfter(read.epoch)) {
			return stored ?? subjectAfterClear(snapshot.subject);
		}
		return subjectToWrite(
			snapshot.subject,
			stored,
			subjectYields(),
			identityYields()
		);
	};

	const choiceWrites = createWriteScheduler(() => {
		const subjectOnly = !state.choiceRecorded;
		state.choiceRecorded = false;
		const snapshot = kernel.getSnapshot();
		const at = now();
		const read = tools.read(storageConfig, at);
		const clearMissed = read.epoch > memoryEpoch;
		const stored = read.records.choice ?? null;
		const explicitChoice =
			subjectOnly && clearMissed
				? null
				: choiceToWrite(
						tools.choiceSince(
							snapshot.explicitChoice,
							read.epoch,
							!clearMissed
						),
						stored,
						subjectOnly,
						changedSinceSeen('choice', read),
						tools.merge
					);
		if (!explicitChoice) {
			return;
		}
		const subject = writtenSubject(
			snapshot,
			stored ? read.records.subject : null,
			subjectOnly,
			read
		);
		writeChoiceToStorage(
			store,
			{ ...snapshot, explicitChoice, subject },
			storedIab,
			storageConfig,
			at,
			read.epoch
		);
		for (const [category, decision] of Object.entries(
			explicitChoice.categories
		)) {
			if (decision) {
				ownDecisions.set(category, { decision, epoch: read.epoch });
			}
		}
		markWritten(
			'choice',
			sameRecord(explicitChoice, snapshot.explicitChoice) &&
				sameRecord(subject, snapshot.subject)
		);
	});
	const noticeWrites = createWriteScheduler(() => {
		const subjectOnly = !state.noticeRecorded;
		state.noticeRecorded = false;
		const snapshot = kernel.getSnapshot();
		const at = now();
		const read = tools.read(storageConfig, at);
		const ours = tools.noticeSince(snapshot.noticeDismissal, read.epoch);
		if (
			subjectOnly &&
			(read.epoch > memoryEpoch ||
				!read.records.noticeDismissal ||
				changedSinceSeen('notice', read))
		) {
			return;
		}
		if (
			ours &&
			mayWriteNotice(
				ours,
				read.records.noticeDismissal ?? null,
				changedSinceSeen('notice', read)
			)
		) {
			const subject = writtenSubject(
				snapshot,
				read.noticeSubject,
				subjectOnly,
				read
			);
			writeNoticeToStorage(store, { ...snapshot, subject }, storageConfig, at);
			markWritten('notice', sameRecord(subject, snapshot.subject));
		}
	});
	const vendorWrites = createWriteScheduler(() => {
		const subjectOnly = !state.vendorsRecorded;
		state.vendorsRecorded = false;
		const snapshot = kernel.getSnapshot();
		const at = now();
		const read = tools.read(storageConfig, at);
		const clearMissed = read.epoch > memoryEpoch;
		const ours = tools.vendorsSince(snapshot.vendorChoice, read.epoch);
		if (
			(snapshot.vendorChoice && !ours) ||
			(subjectOnly && clearMissed) ||
			!mayWriteVendorChoice(
				ours,
				read.records.vendorChoice ?? null,
				subjectOnly,
				changedSinceSeen('vendors', read)
			)
		) {
			return;
		}
		const subject = writtenSubject(
			snapshot,
			read.vendorSubject,
			subjectOnly,
			read
		);
		writeVendorChoiceToStorage(
			store,
			{ ...snapshot, subject },
			storageConfig,
			at
		);
		markWritten('vendors', sameRecord(subject, snapshot.subject));
	});
	const writes = {
		choice: choiceWrites,
		notice: noticeWrites,
		vendors: vendorWrites,
	} satisfies Record<WriteKind, unknown>;

	const flush = function flush(): void {
		choiceWrites.flush();
		noticeWrites.flush();
		vendorWrites.flush();
	};

	const restoreLostWrites = function restoreLostWrites(
		read: StoredRecords
	): void {
		const snapshot = kernel.getSnapshot();
		const storedChoice = read.records.choice;
		if (storedChoice === undefined) {
			return;
		}
		const lost = [...ownDecisions].some(([category, written]) => {
			const { decision: own } = written;
			const key = category as keyof ExplicitChoice['categories'];
			const held = snapshot.explicitChoice?.categories[key];
			const stored = storedChoice?.categories[key];
			return (
				held !== undefined &&
				held.confirmedAt === own.confirmedAt &&
				held.value === own.value &&
				(own.confirmedAt > read.epoch ||
					(own.confirmedAt === read.epoch && written.epoch === read.epoch)) &&
				(!stored || stored.confirmedAt < own.confirmedAt)
			);
		});
		if (lost) {
			state.choiceRecorded = true;
			choiceWrites.schedule();
		}
	};

	const reconcile = function reconcile(): boolean {
		// oxlint-disable-next-line no-use-before-define -- Mutually recursive with the scheduler.
		scheduledReconcile.cancel();
		if (typeof document === 'undefined') {
			return false;
		}
		flush();
		const at = now();
		const stored = tools.read(storageConfig, at);
		const next = selectReconciledRecords(
			kernel.getSnapshot(),
			stored,
			seen,
			at,
			subjectYields(),
			unadopted,
			memoryEpoch,
			subjectBornAfter(stored.epoch),
			{
				identityYields: identityYields(),
				noticeCarried: seenNoticeSubject,
				seenCarrier,
			},
			tools
		);
		({ seen } = next);
		seenCarrier = stored.subjectCarrier;
		rememberNoticeSubject(stored);
		unadopted.clear();
		rememberSubject(stored.records);
		memoryEpoch = stored.epoch;
		const { records } = next;
		if (!records) {
			restoreLostWrites(stored);
			return false;
		}
		const result = kernel.hydrate(records);
		if (result.ok === false) {
			console.warn(
				'[c15t] Stored consent records were rejected.',
				result.issues
			);
			return false;
		}
		if (records.choice !== undefined) {
			storedIab = records.choice ? stored.iab : null;
		}
		restoreLostWrites(stored);
		return result.changed;
	};

	const scheduledReconcile = createWriteScheduler(reconcile);

	return {
		adopt(read, iab) {
			seen = fingerprintStoredRecords(read);
			seenCarrier = read.subjectCarrier;
			rememberNoticeSubject(read);
			rememberSubject(read.records);
			memoryEpoch = read.epoch;
			if (iab && read.records.choice !== undefined) {
				storedIab = read.iab;
			}
		},
		clearStorage(at) {
			choiceWrites.cancel();
			noticeWrites.cancel();
			vendorWrites.cancel();
			unadopted.clear();
			ownDecisions.clear();
			storedIab = null;
			tools.clear(storageConfig, at, memoryEpoch);
			observe();
		},
		dispose() {
			scheduledReconcile.cancel();
		},
		flush,
		reconcile,
		schedule(kind) {
			writes[kind].schedule();
		},
		scheduleReconcile: scheduledReconcile.schedule,
	};
};
