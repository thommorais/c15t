import type {
	ConsentSnapshot,
	HydrationRecords,
	HydrationResult,
	KernelTransport,
	KernelUser,
} from '../types';
import type { SnapshotPatch } from './patch';
import {
	mergeNewestChoice,
	mergeNewestVendorChoice,
	validateHydrationRecords,
} from './record-validation';
import type { ValidatedRecords } from './record-validation';
import type { KernelRuntime } from './runtime';

export const foldServerRecords = function foldServerRecords(
	current: ConsentSnapshot,
	records: ValidatedRecords,
	now: number
): SnapshotPatch {
	const patch: SnapshotPatch = { now };
	if (records.choice !== undefined) {
		patch.explicitChoice = mergeNewestChoice(
			current.explicitChoice,
			records.choice
		);
	}
	if (records.noticeDismissal !== undefined) {
		const local = current.noticeDismissal;
		const incoming = records.noticeDismissal;
		patch.noticeDismissal =
			incoming && (!local || incoming.dismissedAt > local.dismissedAt)
				? incoming
				: local;
	}
	if (records.subject !== undefined) {
		patch.subject = records.subject
			? { ...current.subject, ...records.subject }
			: current.subject;
	}
	if (records.vendorChoice !== undefined) {
		patch.vendorChoice = mergeNewestVendorChoice(
			current.vendorChoice,
			records.vendorChoice
		);
	}
	return patch;
};

export interface RecordsBoundaryOptions {
	runtime: KernelRuntime;
	transport: KernelTransport | undefined;
	start: () => void;
}

export interface RecordsBoundary {
	hydrate: (records: HydrationRecords) => HydrationResult;
	identify: (user: KernelUser) => Promise<void>;
	setSubjectId: (id: string | null) => void;
}

export const createRecordsBoundary = function createRecordsBoundary({
	runtime,
	transport,
	start,
}: RecordsBoundaryOptions): RecordsBoundary {
	const { getSnapshot, commit, emit } = runtime;
	let identifyGeneration = 0;

	const applyRecords = function applyRecords(
		records: HydrationRecords,
		fromServer: boolean
	): HydrationResult {
		const at = records.now ?? runtime.now();
		const validated = validateHydrationRecords(records, at);
		if (validated.ok === false) {
			return validated;
		}
		start();
		const before = getSnapshot();
		let patch: SnapshotPatch;
		let reset = false;
		if (fromServer) {
			patch = foldServerRecords(before, validated.records, at);
		} else {
			const { choice, ...rest } = validated.records;
			patch = { ...rest, now: at };
			if (choice !== undefined) {
				patch.explicitChoice = choice;
			}
			reset = choice === null || rest.subject === null;
			if (reset && before.iab) {
				patch.iab = { ...before.iab, authority: null, tcString: null };
			}
		}
		const changed = commit(patch);
		const after = getSnapshot();
		if (
			reset ||
			after.explicitChoice !== before.explicitChoice ||
			after.subject !== before.subject
		) {
			runtime.invalidateRecords();
		}
		return { changed, ok: true };
	};

	const loadSubjectRecord = async function loadSubjectRecord(
		subjectId: string | null,
		identifyAttempt: number
	): Promise<void> {
		if (!transport?.loadSubjectRecord || !subjectId) {
			return;
		}
		const generation = runtime.getGeneration();
		try {
			const records = await transport.loadSubjectRecord(subjectId);
			const stale =
				identifyAttempt !== identifyGeneration ||
				runtime.getGeneration() !== generation ||
				(getSnapshot().subject?.subjectId ?? null) !== subjectId;
			if (records && !stale) {
				const result = applyRecords(records, true);
				if (result.ok === false) {
					emit({
						command: 'loadSubjectRecord',
						error: new Error('c15t: server record rejected by validation'),
						type: 'command:error',
					});
				}
			}
		} catch (error) {
			emit({ command: 'loadSubjectRecord', error, type: 'command:error' });
		}
	};

	return {
		hydrate: (records) => applyRecords(records, false),

		async identify(user) {
			if (getSnapshot().externalPermissions) {
				return;
			}
			identifyGeneration += 1;
			const attempt = identifyGeneration;
			const generation = runtime.getGeneration();
			const { subject, iab } = getSnapshot();
			const subjectId = subject?.subjectId ?? null;
			const patch: SnapshotPatch = { user: { ...user } };
			if (iab) {
				patch.iab = { ...iab, authority: null, tcString: null };
			}
			runtime.announce(patch, 'user:identified', true);
			if (transport?.identify) {
				try {
					await transport.identify({ ...user }, subjectId);
				} catch (error) {
					emit({ command: 'identify', error, type: 'command:error' });
					throw error;
				}
			}
			if (
				attempt !== identifyGeneration ||
				runtime.getGeneration() !== generation ||
				(getSnapshot().subject?.subjectId ?? null) !== subjectId
			) {
				return;
			}
			await loadSubjectRecord(subjectId, attempt);
		},

		setSubjectId(id) {
			const { subject, iab } = getSnapshot();
			if ((subject?.subjectId ?? null) === id) {
				return;
			}
			runtime.invalidateRecords();
			const patch: SnapshotPatch = {};
			if (iab) {
				patch.iab = { ...iab, authority: null, tcString: null };
			}
			if (id === null) {
				const { subjectId: _dropped, ...rest } = subject ?? {};
				patch.subject = Object.keys(rest).length > 0 ? rest : null;
			} else {
				patch.subject = { ...subject, subjectId: id };
			}
			commit(patch);
		},
	};
};
