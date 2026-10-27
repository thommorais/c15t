import type { OptionalConsentCategory } from '../../consent-record/types';
import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../transports/save-rejection';
import type {
	ConsentSnapshot,
	KernelTransport,
	SavePayload,
	SaveResult,
} from '../../types';
import type { KernelRuntime } from '../runtime';
import type { EnqueueResult, QueueWorker, QueueWorkerOptions } from './queue';
import { queueTools } from './queue-tools';
import type { SaveOutboxStore } from './store';
import {
	liveSupersession,
	withoutSuperseded,
	withSubjectId,
} from './supersession';
import { warnInDevelopment } from './warn';

export type { OutboxSlot, OutboxTransaction, SaveOutboxStore } from './store';
export { createBrowserOutboxStore, createMemoryOutboxStore } from './store';

export interface RecordedAction {
	generation: number;
	snapshot: ConsentSnapshot;
	confirmed: readonly OptionalConsentCategory[];
}

export interface SaveOutbox {
	send: (payload: SavePayload, action: RecordedAction) => Promise<SaveResult>;
	replay: () => Promise<void>;
	clear: () => Promise<void>;
	hold: (until: Promise<unknown>) => void;
}

export interface SaveOutboxOptions {
	runtime: KernelRuntime;
	transport: KernelTransport | undefined;
	store: SaveOutboxStore;
	retryWhenOnline: () => void;
	loadQueue?: () => Promise<{
		createQueueWorker: (options: QueueWorkerOptions) => QueueWorker;
	}>;
}

const SAVE_FAILED_WARNINGS = {
	queued:
		'[c15t] Consent save failed. The choice is kept in this browser and queued, and is resent on the next init or when the browser comes back online.',
	rejected:
		'[c15t] The backend refused the consent save, so it will not be resent. The choice is kept in this browser only.',
	unstored:
		'[c15t] Consent save failed, and storage refused to queue it, so it will not be resent. The choice is kept in this browser only.',
} as const;

const warnSaveFailed = function warnSaveFailed(
	outcome: keyof typeof SAVE_FAILED_WARNINGS | 'superseded',
	error?: unknown
): void {
	if (outcome !== 'superseded') {
		warnInDevelopment(SAVE_FAILED_WARNINGS[outcome], error);
	}
};

export const createSaveOutbox = function createSaveOutbox({
	runtime,
	transport,
	store,
	retryWhenOnline,
	loadQueue = () => import('./queue'),
}: SaveOutboxOptions): SaveOutbox {
	const { batch, commit, emit, getSnapshot } = runtime;
	let worker: QueueWorker | undefined;
	const directSends = new Set<SavePayload>();
	const isSending = (payload: SavePayload): boolean =>
		[...directSends].some(
			(pending) =>
				pending.subjectId === payload.subjectId &&
				pending.confirmed.actionAt === payload.confirmed.actionAt &&
				Object.keys(payload.confirmed.categories).every((category) =>
					Object.hasOwn(pending.confirmed.categories, category)
				)
		);
	let held: Promise<unknown> | undefined;

	const loadWorker = async function loadWorker(): Promise<
		QueueWorker | undefined
	> {
		if (!worker) {
			try {
				const { createQueueWorker } = await loadQueue();
				worker ??= createQueueWorker({
					isSending,
					runtime,
					store,
					tools: queueTools,
				});
			} catch {
			}
		}
		return worker;
	};

	const hasQueued = function hasQueued(): Promise<boolean> {
		return store.transact((tx) => tx.read('saves') !== undefined);
	};

	const enqueue = function enqueue(
		current: () => SavePayload | null
	): Promise<EnqueueResult> {
		if (worker) {
			return worker.enqueue(current);
		}
		void loadWorker();
		return store.transact((tx) => {
			const payload = current();
			if (!payload) {
				return 'superseded';
			}
			const stored = tx.read('saves');
			return tx.write('saves', [
				...(Array.isArray(stored) ? stored : []),
				{ attempts: 0, payload, queuedAt: Date.now() },
			])
				? 'queued'
				: 'unstored';
		});
	};

	const discard = async function discard(payload: SavePayload): Promise<void> {
		if (await hasQueued()) {
			await (await loadWorker())?.discard(payload);
		}
	};

	const clear = function clear(): Promise<void> {
		store.clear();
		return store.transact((tx) => {
			tx.write('saves', []);
			tx.write('reassignments', []);
		});
	};

	const replay = async function replay(): Promise<void> {
		const save = transport?.save;
		if (!save || !(await hasQueued())) {
			return;
		}
		const resend: NonNullable<KernelTransport['save']> = (payload) =>
			save(payload, { replay: true });
		if (await (await loadWorker())?.replay(resend)) {
			retryWhenOnline();
		}
	};

	const settleThrownSave = async function settleThrownSave(
		payload: SavePayload,
		ensureQueued: () => Promise<EnqueueResult>,
		error: unknown
	): Promise<void> {
		if (isConsentSaveRejection(error)) {
			warnSaveFailed('rejected', error);
			await discard(payload);
			return;
		}
		warnSaveFailed(await ensureQueued(), error);
		retryWhenOnline();
	};

	const adoptServerSubject = function adoptServerSubject(
		subjectId: string | undefined,
		action: ConsentSnapshot
	): void {
		const current = getSnapshot();
		if (
			!subjectId ||
			subjectId === current.subject?.subjectId ||
			current.explicitChoice !== action.explicitChoice ||
			current.subject?.subjectId !== action.subject?.subjectId
		) {
			return;
		}
		batch(() => {
			commit({ subject: { ...current.subject, subjectId } });
			emit({
				previousSubjectId: current.subject?.subjectId,
				snapshot: getSnapshot(),
				type: 'subject:resolved',
			});
		});
	};

	const trackDirectSend = async function trackDirectSend(
		payload: SavePayload,
		send: () => Promise<SaveResult>
	): Promise<SaveResult> {
		directSends.add(payload);
		try {
			return await send();
		} finally {
			directSends.delete(payload);
		}
	};

	const performSendAction = async function performSendAction(
		payload: SavePayload,
		action: RecordedAction,
		reassign: boolean
	): Promise<SaveResult> {
		const { confirmed, generation, snapshot: actionSnapshot } = action;
		const currentPayload = (): SavePayload | null => {
			const current = getSnapshot();
			if (
				runtime.getGeneration() !== generation ||
				current.user !== actionSnapshot.user ||
				current.evaluationPolicy.choice.fingerprint !==
					actionSnapshot.evaluationPolicy.choice.fingerprint
			) {
				return null;
			}
			return withoutSuperseded(
				payload,
				liveSupersession(actionSnapshot, current)
			);
		};
		const save = transport?.save;
		let staged: EnqueueResult = 'unstored';
		if (save) {
			staged = await enqueue(currentPayload);
		}
		const ensureQueued = (): Promise<EnqueueResult> =>
			staged === 'queued' && currentPayload() === payload
				? Promise.resolve(staged)
				: enqueue(currentPayload);
		if (held) {
			await held;
		}
		if (!save) {
			return { confirmed, ok: true, subjectId: payload.subjectId };
		}
		try {
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			const sending = currentPayload();
			if (!sending) {
				await discard(payload);
				return { confirmed, ok: false };
			}
			const result = await save(sending);
			const remaining = currentPayload();
			if (!remaining) {
				await discard(payload);
				return { ...result, confirmed };
			}
			if (result.ok) {
				await discard(payload);
			} else {
				warnSaveFailed(await ensureQueued());
				retryWhenOnline();
			}
			if (result.ok && currentPayload()) {
				adoptServerSubject(result.subjectId, actionSnapshot);
			}
			return { ...result, confirmed };
		} catch (error) {
			const remaining = currentPayload();
			const queue =
				reassign && remaining && isSubjectConflict(error)
					? await loadWorker()
					: undefined;
			const subjectId =
				queue && remaining
					? await queue.reassignSubject(remaining.subjectId)
					: null;
			if (subjectId !== null) {
				const reassigned = withSubjectId(payload, subjectId);
				return trackDirectSend(reassigned, () =>
					performSendAction(
						reassigned,
						{
							...action,
							snapshot: {
								...actionSnapshot,
								subject: { ...actionSnapshot.subject, subjectId },
							},
						},
						false
					)
				);
			}
			emit({ command: 'save', error, type: 'command:error' });
			if (remaining) {
				await settleThrownSave(payload, ensureQueued, error);
			} else {
				await discard(payload);
			}
			return { confirmed, ok: false };
		}
	};

	return {
		clear,
		hold(until) {
			held = Promise.allSettled([held, until]);
		},
		replay,
		send: (payload, action) =>
			trackDirectSend(payload, () => performSendAction(payload, action, true)),
	};
};
