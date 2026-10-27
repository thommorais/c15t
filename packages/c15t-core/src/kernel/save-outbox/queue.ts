import type { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import type {
	isPlainRecord,
	validateExplicitChoice,
} from '../../consent-record/validation';
import { isExperimentAssignment } from '../../libs/experiment-record';
import type { generateSubjectId } from '../../libs/generate-subject-id';
import type {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../transports/save-rejection';
import type { ConsentSubject, KernelTransport, SavePayload } from '../../types';
import type { KernelRuntime } from '../runtime';
import type { OutboxTransaction, SaveOutboxStore } from './store';
import type {
	PendingSaveEntry,
	supersededBy,
	withoutSuperseded,
	withSubjectId,
} from './supersession';
import type { warnInDevelopment } from './warn';

export interface QueueTools {
	generateSubjectId: typeof generateSubjectId;
	isConsentSaveRejection: typeof isConsentSaveRejection;
	isPlainRecord: typeof isPlainRecord;
	isSubjectConflict: typeof isSubjectConflict;
	optionalCategories: typeof OPTIONAL_CONSENT_CATEGORIES;
	supersededBy: typeof supersededBy;
	validateExplicitChoice: typeof validateExplicitChoice;
	warnInDevelopment: typeof warnInDevelopment;
	withoutSuperseded: typeof withoutSuperseded;
	withSubjectId: typeof withSubjectId;
}

const MAX_PENDING_SAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPLAY_ATTEMPTS = 10;

interface SubjectReassignment {
	from: string;
	to: string;
	at: number;
}

// oxlint-disable-next-line max-lines-per-function -- The stored-list readers share the validators.
const createStoredLists = function createStoredLists(
	tools: QueueTools,
	onExpired: (count: number) => void
) {
	const {
		isPlainRecord,
		optionalCategories,
		supersededBy,
		validateExplicitChoice,
		withoutSuperseded,
	} = tools;

	const isBooleanRecord = function isBooleanRecord(value: unknown): boolean {
		return (
			isPlainRecord(value) &&
			Object.values(value).every((item) => typeof item === 'boolean')
		);
	};

	const isScalarRecord = function isScalarRecord(value: unknown): boolean {
		return (
			isPlainRecord(value) &&
			Object.values(value).every(
				(item) =>
					typeof item === 'string' ||
					typeof item === 'number' ||
					typeof item === 'boolean'
			)
		);
	};

	const isOptionalString = function isOptionalString(value: unknown): boolean {
		return value === undefined || typeof value === 'string';
	};

	const isOptionalFiniteNumber = function isOptionalFiniteNumber(
		value: unknown
	): boolean {
		return (
			value === undefined ||
			(typeof value === 'number' && Number.isFinite(value))
		);
	};

	const isSaveUser = function isSaveUser(value: unknown): boolean {
		if (value === null) {
			return true;
		}
		if (!isPlainRecord(value) || typeof value.externalId !== 'string') {
			return false;
		}
		return (
			isOptionalString(value.externalIdType) &&
			isOptionalString(value.identityProvider) &&
			isOptionalString(value.identityToken) &&
			(value.properties === undefined || isScalarRecord(value.properties))
		);
	};

	const isSubject = function isSubject(value: unknown): boolean {
		return (
			isPlainRecord(value) &&
			isOptionalString(value.subjectId) &&
			isOptionalString(value.externalId) &&
			isOptionalString(value.identityProvider)
		);
	};

	const isConfirmedCoverage = function isConfirmedCoverage(
		value: unknown
	): boolean {
		if (!isPlainRecord(value) || !isPlainRecord(value.categories)) {
			return false;
		}
		if (
			typeof value.actionAt !== 'number' ||
			!Number.isSafeInteger(value.actionAt) ||
			value.actionAt < 0
		) {
			return false;
		}
		const known = new Set<string>(optionalCategories);
		return Object.entries(value.categories).every(
			([key, item]) => known.has(key) && typeof item === 'boolean'
		);
	};

	const isDecisionInputs = (value: unknown): boolean =>
		value === undefined ||
		(isPlainRecord(value) &&
			(value.policyId === null ||
				(typeof value.policyId === 'string' &&
					value.policyId.length > 0 &&
					typeof value.fingerprint === 'string' &&
					value.fingerprint.length > 0)) &&
			(value.country === null || typeof value.country === 'string') &&
			(value.region === null || typeof value.region === 'string') &&
			typeof value.language === 'string' &&
			typeof value.gpc === 'boolean');

	const isVendorChoicePayload = function isVendorChoicePayload(
		value: unknown
	): boolean {
		return (
			value === undefined ||
			(isPlainRecord(value) &&
				value.version === 1 &&
				typeof value.confirmedAt === 'number' &&
				Number.isSafeInteger(value.confirmedAt) &&
				value.confirmedAt >= 0 &&
				isBooleanRecord(value.grants))
		);
	};

	// oxlint-disable-next-line complexity
	const isSavePayload = function isSavePayload(
		value: unknown
	): value is SavePayload {
		if (!isPlainRecord(value)) {
			return false;
		}
		if (
			!isSubject(value.subject) ||
			!isDecisionInputs(value.decisionInputs) ||
			!isConfirmedCoverage(value.confirmed) ||
			!validateExplicitChoice(value.choice, Date.now()).ok
		) {
			return false;
		}

		const validModel =
			value.model === null ||
			value.model === 'opt-in' ||
			value.model === 'opt-out' ||
			value.model === 'iab' ||
			value.model === 'none';
		const validUiSource =
			value.uiSource === null ||
			value.uiSource === 'none' ||
			value.uiSource === 'banner' ||
			value.uiSource === 'dialog' ||
			value.uiSource === 'widget';
		const validAction =
			value.consentAction === 'all' ||
			value.consentAction === 'necessary' ||
			value.consentAction === 'custom';

		return (
			typeof value.subjectId === 'string' &&
			isBooleanRecord(value.consents) &&
			isPlainRecord(value.overrides) &&
			isSaveUser(value.user) &&
			validModel &&
			validUiSource &&
			validAction &&
			isOptionalFiniteNumber(value.givenAt) &&
			isOptionalFiniteNumber(value.timeToDecisionMs) &&
			(value.experiment === undefined ||
				isExperimentAssignment(value.experiment)) &&
			(value.policySnapshotToken === null ||
				typeof value.policySnapshotToken === 'string') &&
			(value.tcString === undefined ||
				value.tcString === null ||
				typeof value.tcString === 'string') &&
			(value.addtlConsent === undefined ||
				typeof value.addtlConsent === 'string') &&
			isVendorChoicePayload(value.vendorChoice)
		);
	};

	const isPendingSaveEntry = function isPendingSaveEntry(
		value: unknown
	): value is PendingSaveEntry {
		return (
			isPlainRecord(value) &&
			isSavePayload(value.payload) &&
			typeof value.queuedAt === 'number' &&
			Number.isFinite(value.queuedAt) &&
			value.queuedAt >= 0 &&
			typeof value.attempts === 'number' &&
			Number.isInteger(value.attempts) &&
			value.attempts >= 0
		);
	};

	const isSubjectReassignment = function isSubjectReassignment(
		value: unknown
	): value is SubjectReassignment {
		return (
			isPlainRecord(value) &&
			typeof value.from === 'string' &&
			typeof value.to === 'string' &&
			typeof value.at === 'number' &&
			Number.isFinite(value.at)
		);
	};

	const normalizePendingSaves = function normalizePendingSaves(
		value: unknown,
		now: number
	): PendingSaveEntry[] {
		if (!Array.isArray(value)) {
			return [];
		}

		const cutoff = now - MAX_PENDING_SAVE_AGE_MS;
		const entries: PendingSaveEntry[] = [];
		for (const entry of value) {
			if (
				!isPendingSaveEntry(entry) ||
				entry.queuedAt < cutoff ||
				entry.attempts >= MAX_REPLAY_ATTEMPTS
			) {
				continue;
			}
			entries.push(entry);
		}
		entries.sort(
			(left, right) =>
				left.payload.confirmed.actionAt - right.payload.confirmed.actionAt ||
				left.queuedAt - right.queuedAt
		);
		return entries.flatMap((entry, index) => {
			let payload: SavePayload | null = entry.payload;
			for (const later of entries.slice(index + 1)) {
				if (payload) {
					payload = withoutSuperseded(
						payload,
						supersededBy(payload, later.payload)
					);
				}
			}
			return payload ? [{ ...entry, payload }] : [];
		});
	};

	const readPendingSaves = function readPendingSaves(
		tx: OutboxTransaction,
		now = Date.now()
	): PendingSaveEntry[] {
		const stored = tx.read('saves');
		if (stored === undefined) {
			return [];
		}
		const normalized = normalizePendingSaves(stored, now);
		if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
			if (!tx.write('saves', normalized)) {
				return normalized;
			}
			const cutoff = now - MAX_PENDING_SAVE_AGE_MS;
			const expired = Array.isArray(stored)
				? stored.filter(
						(entry) =>
							isPendingSaveEntry(entry) &&
							entry.queuedAt < cutoff &&
							entry.attempts < MAX_REPLAY_ATTEMPTS
					).length
				: 0;
			if (expired > 0) {
				onExpired(expired);
			}
		}
		return normalized;
	};

	const readReassignments = function readReassignments(
		tx: OutboxTransaction,
		now = Date.now()
	): SubjectReassignment[] {
		const stored = tx.read('reassignments');
		if (!Array.isArray(stored)) {
			return [];
		}
		const cutoff = now - MAX_PENDING_SAVE_AGE_MS;
		const queued = new Set(
			readPendingSaves(tx, now).map((entry) => entry.payload.subjectId)
		);
		return stored.filter(
			(item): item is SubjectReassignment =>
				isSubjectReassignment(item) &&
				(item.at >= cutoff || queued.has(item.from))
		);
	};

	return { normalizePendingSaves, readPendingSaves, readReassignments };
};

const isSamePendingSave = function isSamePendingSave(
	left: PendingSaveEntry,
	right: PendingSaveEntry
): boolean {
	return (
		left.queuedAt === right.queuedAt &&
		left.attempts === right.attempts &&
		JSON.stringify(left.payload) === JSON.stringify(right.payload)
	);
};

export type EnqueueResult = 'queued' | 'superseded' | 'unstored';

type ReplayOutcome = 'saved' | 'retry' | 'rejected';

interface ReplayResult {
	event: { ok: boolean; rejected?: string; subjectId: string };
	kept: boolean;
	error: unknown;
}

export interface QueueWorkerOptions {
	runtime: KernelRuntime;
	store: SaveOutboxStore;
	tools: QueueTools;
	isSending?: (payload: SavePayload) => boolean;
}

export interface QueueWorker {
	enqueue: (current: () => SavePayload | null) => Promise<EnqueueResult>;
	discard: (payload: SavePayload) => Promise<void>;
	reassignSubject: (from: string) => Promise<string | null>;
	replay: (save: NonNullable<KernelTransport['save']>) => Promise<boolean>;
}

// oxlint-disable-next-line max-lines-per-function -- Queueing, replay and reassignment share the subject claims through closures.
export const createQueueWorker = function createQueueWorker({
	runtime,
	store,
	tools,
	isSending = () => false,
}: QueueWorkerOptions): QueueWorker {
	const { batch, commit, emit, getSnapshot } = runtime;
	const {
		generateSubjectId,
		isConsentSaveRejection,
		isSubjectConflict,
		supersededBy,
		warnInDevelopment,
		withoutSuperseded,
		withSubjectId,
	} = tools;

	const reportDropped = function reportDropped(error: unknown): void {
		emit({ command: 'save', error, type: 'command:error' });
		warnInDevelopment(
			'[c15t] A queued consent save was dropped and will not be resent. The choice is kept in this browser only.',
			error
		);
	};

	const reportExpired = function reportExpired(count: number): void {
		const saves =
			count === 1 ? 'a queued consent save' : `${count} queued consent saves`;
		const error = new Error(
			`c15t save outbox: dropped ${saves} that waited more than 7 days without reaching the backend`
		);
		queueMicrotask(() => {
			reportDropped(error);
		});
	};

	const { normalizePendingSaves, readPendingSaves, readReassignments } =
		createStoredLists(tools, reportExpired);
	const reassignedSubjects = new Map<
		string,
		{ claim: Promise<string | null>; generation: number }
	>();
	let activeReplay: Promise<boolean> | null = null;

	const currentSubjectId = () => getSnapshot().subject?.subjectId;

	const enqueue = function enqueue(
		current: () => SavePayload | null
	): Promise<EnqueueResult> {
		return store.transact((tx) => {
			const payload = current();
			if (!payload) {
				return 'superseded';
			}
			const now = Date.now();
			const pending = readPendingSaves(tx, now);
			pending.push({ attempts: 0, payload, queuedAt: now });
			return tx.write('saves', normalizePendingSaves(pending, now))
				? 'queued'
				: 'unstored';
		});
	};

	const discard = function discard(payload: SavePayload): Promise<void> {
		const settled = JSON.stringify(payload);
		return store.transact((tx) => {
			const pending = readPendingSaves(tx);
			const remaining = pending.flatMap((candidate) => {
				if (JSON.stringify(candidate.payload) === settled) {
					return [];
				}
				const kept = withoutSuperseded(
					candidate.payload,
					supersededBy(candidate.payload, payload)
				);
				return kept ? [{ ...candidate, payload: kept }] : [];
			});
			if (JSON.stringify(remaining) !== JSON.stringify(pending)) {
				tx.write('saves', remaining);
			}
		});
	};

	const claimReassignment = function claimReassignment(
		from: string,
		proposed: string,
		isCurrent: () => boolean
	): Promise<string | null> {
		return store.transact((tx) => {
			if (!isCurrent()) {
				return null;
			}
			const now = Date.now();
			const reassignments = readReassignments(tx, now);
			const recorded = reassignments.find((item) => item.from === from);
			const to = recorded?.to ?? proposed;
			if (!recorded) {
				tx.write('reassignments', [...reassignments, { at: now, from, to }]);
			}

			const pending = readPendingSaves(tx, now);
			if (pending.some((entry) => entry.payload.subjectId === from)) {
				const moved = pending.map((entry) =>
					entry.payload.subjectId === from
						? { ...entry, payload: withSubjectId(entry.payload, to) }
						: entry
				);
				tx.write('saves', normalizePendingSaves(moved, now));
			}
			return to;
		});
	};

	const followRecordedReassignment = async function followRecordedReassignment(
		from: string
	): Promise<string | null> {
		const to = await store.transact(
			(tx) => readReassignments(tx).find((item) => item.from === from)?.to
		);
		if (to === undefined || currentSubjectId() !== to) {
			return null;
		}
		const moved = await claimReassignment(
			from,
			to,
			() => currentSubjectId() === to
		);
		return moved === null ? null : to;
	};

	const reassignSubject = async function reassignSubject(
		from: string
	): Promise<string | null> {
		const generation = runtime.getGeneration();
		const cached = reassignedSubjects.get(from);
		const earlier =
			cached?.generation === generation ? cached.claim : undefined;
		if (earlier === undefined && currentSubjectId() !== from) {
			return followRecordedReassignment(from);
		}
		const unchanged = (to?: string) => () => {
			const id = currentSubjectId();
			return id === from || (to !== undefined && id === to);
		};
		let claim = earlier;
		if (claim === undefined) {
			claim = claimReassignment(from, generateSubjectId(), unchanged());
			reassignedSubjects.set(from, { claim, generation });
		}
		const to = await claim;
		if (to === null) {
			return null;
		}
		if (
			earlier !== undefined &&
			(await claimReassignment(from, to, unchanged(to))) === null
		) {
			return null;
		}

		const current = getSnapshot().subject;
		if (current?.subjectId === to) {
			return to;
		}
		if (current?.subjectId !== from) {
			return null;
		}
		const subject: ConsentSubject = { ...current, subjectId: to };
		batch(() => {
			commit({ subject });
			emit({
				previousSubjectId: from,
				snapshot: getSnapshot(),
				type: 'subject:resolved',
			});
		});
		return to;
	};

	const replayEntry = async function replayEntry(
		save: NonNullable<KernelTransport['save']>,
		entry: PendingSaveEntry,
		moved: Map<string, string> | null
	): Promise<ReplayResult | null> {
		const stillQueued = await store.transact((tx) =>
			readPendingSaves(tx).some((candidate) =>
				isSamePendingSave(candidate, entry)
			)
		);
		if (!stillQueued || isSending(entry.payload)) {
			return null;
		}

		let outcome: ReplayOutcome = 'retry';
		let rejected: string | undefined;
		let failure: unknown;
		try {
			const { ok } = await save(entry.payload);
			outcome = ok ? 'saved' : 'retry';
		} catch (error) {
			failure = error;
			if (moved && isSubjectConflict(error)) {
				const subjectId = await reassignSubject(entry.payload.subjectId);
				if (subjectId !== null) {
					moved.set(entry.payload.subjectId, subjectId);
					return replayEntry(
						save,
						{ ...entry, payload: withSubjectId(entry.payload, subjectId) },
						null
					);
				}
			}
			if (isConsentSaveRejection(error)) {
				outcome = 'rejected';
				rejected = error.code;
			}
		}
		const { attempts, written } = await store.transact((tx) => {
			let counted: number | null = null;
			const next: PendingSaveEntry[] = [];
			for (const candidate of readPendingSaves(tx)) {
				if (!isSamePendingSave(candidate, entry)) {
					next.push(candidate);
					continue;
				}
				counted = candidate.attempts + 1;
				if (outcome === 'retry' && counted < MAX_REPLAY_ATTEMPTS) {
					next.push({ ...candidate, attempts: counted });
				}
			}
			return { attempts: counted, written: tx.write('saves', next) };
		});
		const removed =
			attempts !== null &&
			written &&
			(outcome === 'rejected' ||
				(outcome === 'retry' && attempts >= MAX_REPLAY_ATTEMPTS));
		const kept = attempts !== null && outcome !== 'saved' && !removed;
		if (removed && outcome === 'rejected') {
			reportDropped(failure);
		} else if (removed) {
			reportDropped(
				new Error(
					`c15t save outbox: dropped a queued consent save after ${MAX_REPLAY_ATTEMPTS} failed attempts`,
					{ cause: failure }
				)
			);
		}
		const { subjectId } = entry.payload;
		return {
			error: failure,
			event:
				rejected === undefined
					? { ok: outcome === 'saved', subjectId }
					: { ok: false, rejected, subjectId },
			kept,
		};
	};

	const runReplay = async function runReplay(
		save: NonNullable<KernelTransport['save']>
	): Promise<boolean> {
		const pending = await store.transact((tx) => readPendingSaves(tx));
		let kept = 0;
		let lastError: unknown;
		const moved = new Map<string, string>();
		for (const queued of pending) {
			const to = moved.get(queued.payload.subjectId);
			const entry =
				to === undefined
					? queued
					: { ...queued, payload: withSubjectId(queued.payload, to) };
			// oxlint-disable-next-line no-await-in-loop
			const result = await replayEntry(save, entry, moved);
			if (result !== null) {
				emit({ ...result.event, type: 'save:replayed' });
				if (result.kept) {
					kept += 1;
					lastError = result.error ?? lastError;
				}
			}
		}
		if (kept > 0) {
			warnInDevelopment(
				kept === 1
					? '[c15t] Resending a queued consent save failed. It stays queued and is resent on the next init or when the browser comes back online.'
					: `[c15t] Resending ${kept} queued consent saves failed. They stay queued and are resent on the next init or when the browser comes back online.`,
				lastError
			);
		}
		return store.transact((tx) => readPendingSaves(tx).length > 0);
	};

	const runSharedReplay = async function runSharedReplay(
		save: NonNullable<KernelTransport['save']>
	): Promise<boolean> {
		try {
			return await runReplay(save);
		} finally {
			activeReplay = null;
		}
	};

	return {
		discard,
		enqueue,
		reassignSubject,
		replay(save) {
			activeReplay ??= runSharedReplay(save);
			return activeReplay;
		},
	};
};
