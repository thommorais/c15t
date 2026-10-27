import { clearKernelRecords } from '../../kernel/clear-records';
import type { InternalKernel } from '../../kernel/internals';
import { generateSubjectId } from '../../libs/generate-subject-id';
import type {
	ConsentSnapshot,
	ConsentSubject,
	HydrationRecords,
} from '../../types';
import { clearStoredRecords, writeStoredSubjectId } from './clear';
import {
	hydrateFromStorage,
	readRecordedSubjectIdFromCookieHeader,
	readStoredRecordsForReconcile,
	readStoredRecordsFromCookieHeader,
} from './hydrate';
import type { StoredRecords } from './hydrate';
import {
	isNewerDenial,
	readStoredSubjectId,
	readSyncedSubjectId,
	resolveStorageKeys,
} from './record-storage';
import { persistenceTools } from './tools';
import type { PersistenceHandle, PersistenceOptions } from './types';
import { pageWriterLoader, preloadWriter } from './writer-loader';
import type { WriterLoader, WriterModule } from './writer-loader';
import type {
	PersistenceContext,
	PersistenceWriter,
	WriteKind,
} from './writer/types';

const RETRY_BASE_MS = 1000;
const RETRIES = 3;

export const queuedWrites = new Map<string, InternalKernel>();

const handedOver = new WeakMap<InternalKernel, InternalKernel>();

const readCookieHeader = function readCookieHeader(): string | null {
	try {
		return document.cookie;
	} catch {
		return null;
	}
};

const sameSubject = function sameSubject(
	left: ConsentSubject | null | undefined,
	right: ConsentSubject | null | undefined
): boolean {
	return (
		left?.subjectId === right?.subjectId &&
		left?.externalId === right?.externalId &&
		left?.identityProvider === right?.identityProvider
	);
};

const recordedSubjectOf = function recordedSubjectOf(
	read: StoredRecords | null | undefined
): ConsentSubject | null {
	if (!read?.recordedSubjectId) {
		return null;
	}
	return { ...read.records.subject, subjectId: read.recordedSubjectId };
};

const subjectHolder = function subjectHolder(
	kernel: InternalKernel
): InternalKernel {
	let holder = kernel;
	for (let next = handedOver.get(holder); next; next = handedOver.get(holder)) {
		holder = next;
	}
	return holder;
};

const withHolderSubject = function withHolderSubject(
	owner: InternalKernel
): InternalKernel {
	return {
		...owner,
		getSnapshot: () => ({
			...owner.getSnapshot(),
			subject: subjectHolder(owner).getSnapshot().subject,
		}),
	};
};

export const mountPersistence = function mountPersistence(
	options: PersistenceOptions,
	loader: WriterLoader = pageWriterLoader
): PersistenceHandle {
	const { storageConfig } = options;
	const kernel = options.kernel as InternalKernel;
	const now = options.now ?? (() => Date.now());
	const state: PersistenceContext['state'] = {
		choiceRecorded: false,
		vendorsRecorded: false,
	};
	const browser = typeof document !== 'undefined';
	const listenable =
		browser &&
		typeof window !== 'undefined' &&
		typeof window.addEventListener === 'function' &&
		typeof document.addEventListener === 'function';
	let disposed = false;
	const keys = resolveStorageKeys(storageConfig);
	const consentKey = keys.consent;

	let writer: PersistenceWriter | undefined;
	let baseline: [StoredRecords, boolean] | undefined;
	const requested = new Set<WriteKind>();
	let reconcileRequested = false;
	let hydrateRequested = false;
	let markLanded: () => void = () => undefined;
	const landing = new Promise<void>((resolve) => {
		markLanded = resolve;
	});
	let retries = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let subjectId: string | undefined;
	let storedSubjectId: string | null = null;
	let pendingSubjectId: string | undefined;
	let unusedSubjectId: string | undefined;
	let followingSubject = false;
	let adopting = false;
	let refused: [own: string, stored: string] | undefined;

	const land = function land(module: WriterModule): void {
		if (writer) {
			return;
		}
		clearTimeout(retryTimer);
		const handed = handedOver.has(kernel);
		writer = module.createPersistenceWriter(
			{
				kernel: handed ? withHolderSubject(kernel) : kernel,
				now,
				state,
				storageConfig,
			},
			persistenceTools
		);
		if (baseline) {
			writer.adopt(...baseline);
			baseline = undefined;
		}
		for (const kind of requested) {
			writer.schedule(kind);
		}
		requested.clear();
		writer.flush();
		const publish = handed
			? subjectHolder(kernel).getSnapshot().subject?.subjectId
			: pendingSubjectId;
		pendingSubjectId = undefined;
		if (publish) {
			// oxlint-disable-next-line no-use-before-define -- Runs only after assembly.
			storeSubjectId(publish);
		}
		if (queuedWrites.get(consentKey) === kernel) {
			queuedWrites.delete(consentKey);
		}
		markLanded();
		if (hydrateRequested && !disposed) {
			hydrateRequested = false;
			// oxlint-disable-next-line no-use-before-define -- Runs only after assembly.
			hydrate();
		}
		if (reconcileRequested && !disposed) {
			reconcileRequested = false;
			writer.reconcile();
		}
	};

	const landedWriter = function landedWriter(): PersistenceWriter | undefined {
		if (!writer && loader.module) {
			land(loader.module);
		}
		return writer;
	};

	const withWriter = async function withWriter(): Promise<void> {
		let module: WriterModule;
		try {
			module = await loader.load();
		} catch {
			if (requested.size > 0 && retries < RETRIES && !retryTimer) {
				retryTimer = setTimeout(
					() => {
						retryTimer = undefined;
						void withWriter();
					},
					RETRY_BASE_MS * 4 ** retries
				);
				retries += 1;
			}
			return;
		}
		land(module);
	};

	const request = function request(...kinds: WriteKind[]): void {
		const landed = landedWriter();
		if (landed) {
			queuedWrites.delete(consentKey);
			for (const kind of kinds) {
				landed.schedule(kind);
			}
			if (pendingSubjectId) {
				// oxlint-disable-next-line no-use-before-define -- Runs only after assembly.
				storeSubjectId(pendingSubjectId);
			}
			return;
		}
		queuedWrites.set(consentKey, kernel);
		for (const kind of kinds) {
			requested.add(kind);
		}
		kernel.holdSaves(landing);
		void withWriter();
	};

	const scheduleReconcile = function scheduleReconcile(): void {
		const landed = landedWriter();
		if (landed) {
			landed.scheduleReconcile();
			return;
		}
		reconcileRequested = true;
		void withWriter();
	};

	let saving = false;
	let noticeBeforeSave: ConsentSnapshot['noticeDismissal'] = null;

	const noteGeneratedSubject = function noteGeneratedSubject(
		snapshot: ConsentSnapshot,
		actionAt: number
	): void {
		const id = snapshot.subject?.subjectId;
		if (id && !state.subjectBeforeSave) {
			state.freshSubjectId = id;
			state.freshSubjectAt = actionAt;
		}
	};

	const rekeyRecords = function rekeyRecords(snapshot: ConsentSnapshot): void {
		const kinds: WriteKind[] = [];
		if (snapshot.explicitChoice) {
			kinds.push('choice');
		}
		if (snapshot.noticeDismissal) {
			kinds.push('notice');
		}
		if (snapshot.vendorChoice) {
			kinds.push('vendors');
		}
		if (kinds.length > 0) {
			request(...kinds);
		}
	};

	const unsubscribers = [
		kernel.events.on('command:save:started', () => {
			saving = true;
			state.subjectBeforeSave = kernel.getSnapshot().subject?.subjectId;
			noticeBeforeSave = kernel.getSnapshot().noticeDismissal;
			unusedSubjectId = undefined;
		}),
		kernel.events.on('command:save:completed', () => {
			saving = false;
		}),
		kernel.events.on('user:identified', () => {
			unusedSubjectId = undefined;
		}),
		kernel.events.on('choice:recorded', ({ actionAt, snapshot }) => {
			noteGeneratedSubject(snapshot, actionAt);
			state.choiceRecorded = true;
			state.noticeRecorded = snapshot.noticeDismissal !== null;
			request('choice', 'notice');
		}),
		kernel.events.on('subject:resolved', ({ snapshot }) => {
			if (!followingSubject) {
				rekeyRecords(snapshot);
			}
		}),
		kernel.events.on('notice:dismissed', ({ snapshot, dismissal }) => {
			if (saving) {
				noteGeneratedSubject(snapshot, dismissal.dismissedAt);
			}
			state.noticeRecorded = true;
			request('notice');
		}),
		kernel.events.on('vendors:recorded', ({ actionAt, snapshot }) => {
			noteGeneratedSubject(snapshot, actionAt);
			state.vendorsRecorded = true;
			if (
				snapshot.noticeDismissal &&
				snapshot.noticeDismissal !== noticeBeforeSave
			) {
				state.noticeRecorded = true;
				request('vendors', 'notice');
			} else {
				request('vendors');
			}
		}),
	];

	const withQueued = function withQueued(
		records: HydrationRecords
	): HydrationRecords {
		const snapshot = queuedWrites.get(consentKey)?.getSnapshot();
		return snapshot
			? { ...records, ...snapshot, choice: snapshot.explicitChoice }
			: records;
	};

	const applyNewerStoredRecords =
		function applyNewerStoredRecords(): ConsentSubject | null {
			const at = now();
			const read = readStoredRecordsForReconcile(storageConfig, at);
			baseline = [read, false];
			const records = withQueued(read.records);
			const snapshot = kernel.getSnapshot();
			const patch: HydrationRecords = {};
			const seeded = snapshot.explicitChoice?.categories ?? {};
			const denials = Object.entries(records.choice?.categories ?? {}).filter(
				([category, decision]) =>
					isNewerDenial(decision, seeded[category as keyof typeof seeded])
			);
			if (denials.length > 0) {
				patch.choice = {
					categories: { ...seeded, ...Object.fromEntries(denials) },
					version: 3,
				};
			}
			const { vendorChoice } = records;
			if (
				vendorChoice &&
				vendorChoice.confirmedAt > (snapshot.vendorChoice?.confirmedAt ?? -1)
			) {
				patch.vendorChoice = vendorChoice;
			}
			if (Object.keys(patch).length > 0) {
				kernel.hydrate({ ...patch, now: at });
			}
			return recordedSubjectOf(read);
		};

	const handlesSubject = function handlesSubject(): boolean {
		return !options.keepSubject && !kernel.getSnapshot().externalPermissions;
	};

	const withoutStoredSubjectId = function withoutStoredSubjectId(
		records: HydrationRecords,
		read: StoredRecords
	): HydrationRecords {
		if (handlesSubject() || read.recordedSubjectId || !records.subject) {
			return records;
		}
		const { subjectId: _subjectId, ...subject } = records.subject;
		return {
			...records,
			subject: Object.keys(subject).length > 0 ? subject : null,
		};
	};

	const hydrateStored = function hydrateStored(): StoredRecords | null {
		const landed = landedWriter();
		if (landed) {
			landed.flush();
		} else if (requested.size > 0) {
			hydrateRequested = true;
			void withWriter();
			return null;
		}
		const stored = hydrateFromStorage(
			kernel,
			storageConfig,
			now(),
			(records, read) => withQueued(withoutStoredSubjectId(records, read))
		);
		if (!stored) {
			return null;
		}
		if (landed) {
			landed.adopt(stored, true);
		} else {
			baseline = [stored, true];
		}
		return stored;
	};

	const hydrate = function hydrate(): boolean {
		return hydrateStored()?.found ?? false;
	};

	const recordsCarryOther = function recordsCarryOther(id: string): boolean {
		const recorded = readStoredRecordsForReconcile(
			storageConfig,
			now()
		).recordedSubjectId;
		return recorded !== null && recorded !== id;
	};

	const storeSubjectId = function storeSubjectId(id: string): void {
		writer?.flush();
		if (
			(!writer &&
				(requested.has('choice') ||
					requested.has('notice') ||
					requested.has('vendors'))) ||
			recordsCarryOther(id)
		) {
			pendingSubjectId = id;
			return;
		}
		pendingSubjectId = undefined;
		if (id !== storedSubjectId) {
			writeStoredSubjectId(id, storageConfig);
			storedSubjectId = id;
		}
	};

	const followSubjectId = function followSubjectId(
		snapshot: ConsentSnapshot
	): void {
		const id = snapshot.subject?.subjectId;
		if (id === subjectId) {
			return;
		}
		const previous = subjectId;
		subjectId = id;
		if (!id) {
			const next = generateSubjectId();
			unusedSubjectId =
				snapshot.explicitChoice ||
				snapshot.vendorChoice ||
				snapshot.noticeDismissal
					? undefined
					: next;
			state.freshSubjectId = next;
			state.freshSubjectAt = now();
			kernel.hydrate({ subject: { ...snapshot.subject, subjectId: next } });
			return;
		}
		if (
			(snapshot.explicitChoice ||
				snapshot.vendorChoice ||
				snapshot.noticeDismissal) &&
			readStoredRecordsForReconcile(storageConfig, now()).recordedSubjectId !==
				id
		) {
			rekeyRecords(snapshot);
		}
		storeSubjectId(id);
		if (previous !== undefined && previous === unusedSubjectId) {
			unusedSubjectId = adopting ? id : undefined;
			if (adopting) {
				state.freshSubjectId = id;
			}
			followingSubject = true;
			try {
				kernel.events.emit({
					previousSubjectId: previous,
					snapshot,
					type: 'subject:resolved',
				});
			} finally {
				followingSubject = false;
			}
		}
	};

	const fromCookiesAlone = function fromCookiesAlone(id: string): boolean {
		const header = readCookieHeader();
		return (
			header === null ||
			readStoredRecordsFromCookieHeader(header, storageConfig, now()).subject
				?.subjectId === id
		);
	};

	const seedBringsIdentity = function seedBringsIdentity(
		seed: ConsentSubject
	): boolean {
		if (!(seed.externalId || seed.identityProvider)) {
			return false;
		}
		const header = readCookieHeader();
		return (
			header !== null &&
			!sameSubject(
				readStoredRecordsFromCookieHeader(header, storageConfig, now()).subject,
				seed
			)
		);
	};

	const startingSubject = function startingSubject(
		before: ConsentSubject | null,
		recorded: ConsentSubject | null,
		stored: string | null
	): [subject: ConsentSubject, local: boolean] {
		const { subject } = kernel.getSnapshot();
		if (!recorded) {
			if (before?.subjectId) {
				return [{ ...subject, ...before }, false];
			}
			return [
				{
					...subject,
					subjectId: subject?.subjectId ?? stored ?? generateSubjectId(),
				},
				true,
			];
		}
		if (
			subject &&
			subject.subjectId === recorded.subjectId &&
			seedBringsIdentity(subject)
		) {
			return [subject, false];
		}
		if (
			!subject?.subjectId ||
			recorded.subjectId === stored ||
			fromCookiesAlone(subject.subjectId)
		) {
			return [recorded, false];
		}
		return [subject, false];
	};

	const startSubject = function startSubject(
		before: ConsentSubject | null,
		recorded: ConsentSubject | null
	): void {
		const stored = readStoredSubjectId(storageConfig);
		storedSubjectId = readSyncedSubjectId(storageConfig);
		const snapshot = kernel.getSnapshot();
		const [subject, local] = startingSubject(before, recorded, stored);
		const id = subject.subjectId as string;
		subjectId = id;
		if (local) {
			state.freshSubjectId = id;
			state.freshSubjectAt = now();
			if (!snapshot.explicitChoice && !snapshot.vendorChoice) {
				unusedSubjectId = id;
			}
		}
		if (!sameSubject(subject, snapshot.subject)) {
			kernel.hydrate({ subject });
		}
		if (id !== recorded?.subjectId) {
			storeSubjectId(id);
		}
	};

	const startQueuedSubject = function startQueuedSubject(
		owner: InternalKernel,
		id: string
	): void {
		storedSubjectId = readSyncedSubjectId(storageConfig);
		subjectId = id;
		if (owner === kernel) {
			return;
		}
		const queued = owner.getSnapshot().subject;
		if (!sameSubject(queued, kernel.getSnapshot().subject)) {
			kernel.hydrate({ subject: queued });
		}
		handedOver.set(owner, kernel);
		if (
			readStoredRecordsForReconcile(storageConfig, now()).recordedSubjectId !==
			id
		) {
			rekeyRecords(kernel.getSnapshot());
		}
		storeSubjectId(id);
	};

	const adoptStoredSubjectId = function adoptStoredSubjectId(): void {
		if (subjectId === undefined || disposed) {
			return;
		}
		const stored = readStoredSubjectId(storageConfig);
		storedSubjectId = readSyncedSubjectId(storageConfig);
		if (!stored || stored === subjectId) {
			storeSubjectId(subjectId);
			return;
		}
		const snapshot = kernel.getSnapshot();
		if (
			subjectId === unusedSubjectId &&
			!snapshot.explicitChoice &&
			!snapshot.vendorChoice
		) {
			adopting = true;
			try {
				kernel.hydrate({ subject: { ...snapshot.subject, subjectId: stored } });
			} finally {
				adopting = false;
			}
			return;
		}
		if (refused?.[0] !== subjectId || refused[1] !== stored) {
			refused = [subjectId, stored];
			const header = readCookieHeader();
			if (
				header === null ||
				readRecordedSubjectIdFromCookieHeader(header, storageConfig, now()) !==
					stored
			) {
				storeSubjectId(subjectId);
			}
		}
	};

	const installListeners = function installListeners(): () => void {
		if (!listenable) {
			return () => undefined;
		}
		const listeners: [EventTarget, string, (event: Event) => void][] = [
			[window, 'pagehide', () => writer?.flush()],
		];
		if (options.sync !== false) {
			const watchStorage = function watchStorage(): void {
				adoptStoredSubjectId();
				scheduleReconcile();
			};
			const watched = new Set<string | null>([
				consentKey,
				keys.legacyConsent,
				keys.notice,
				keys.vendors,
				keys.epoch,
				null,
			]);
			listeners.push(
				[
					window,
					'storage',
					(event) => {
						const { key } = event as StorageEvent;
						if (key === keys.subject) {
							adoptStoredSubjectId();
						} else if (watched.has(key)) {
							watchStorage();
						}
					},
				],
				[window, 'focus', watchStorage],
				[
					document,
					'visibilitychange',
					() => {
						if (document.visibilityState !== 'hidden') {
							watchStorage();
						}
					},
				]
			);
		}
		const toggle = (add: boolean) => {
			for (const [target, type, listener] of listeners) {
				target[add ? 'addEventListener' : 'removeEventListener'](
					type,
					listener
				);
			}
		};
		toggle(true);
		return () => toggle(false);
	};

	if (browser) {
		handedOver.delete(kernel);
		const before = kernel.getSnapshot().subject;
		const recorded = options.skipHydration
			? applyNewerStoredRecords()
			: recordedSubjectOf(hydrateStored());
		if (handlesSubject()) {
			const queued = queuedWrites.get(consentKey);
			const queuedSubjectId = queued?.getSnapshot().subject?.subjectId;
			if (queued && queuedSubjectId) {
				startQueuedSubject(queued, queuedSubjectId);
			} else {
				startSubject(before, recorded);
			}
			unsubscribers.push(kernel.subscribe(followSubjectId));
		}
	}

	if (!landedWriter() && listenable) {
		unsubscribers.push(
			preloadWriter(kernel, () => {
				if (!disposed) {
					void withWriter();
				}
			})
		);
	}

	const removeListeners = installListeners();

	return {
		clear() {
			queuedWrites.delete(consentKey);
			state.choiceRecorded = false;
			state.noticeRecorded = false;
			state.vendorsRecorded = false;
			state.subjectBeforeSave = undefined;
			state.freshSubjectId = undefined;
			const at = now();
			const landed = landedWriter();
			if (landed) {
				landed.clearStorage(at);
			} else if (browser) {
				requested.clear();
				hydrateRequested = false;
				clearStoredRecords(storageConfig, at, baseline?.[0].epoch ?? 0);
				baseline = [readStoredRecordsForReconcile(storageConfig, at), false];
			}
			if (subjectId) {
				storeSubjectId(subjectId);
			}
			clearKernelRecords(kernel, at);
		},
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			removeListeners();
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
			landedWriter()?.dispose();
			writer?.flush();
		},
		hydrate,
		reconcile() {
			if (disposed || !browser) {
				return false;
			}
			const landed = landedWriter();
			if (landed) {
				return landed.reconcile();
			}
			reconcileRequested = true;
			void withWriter();
			return false;
		},
	};
};

export const preloadPersistenceWriter =
	async function preloadPersistenceWriter(): Promise<void> {
		await pageWriterLoader.load();
	};
