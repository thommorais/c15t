import type { ExperimentAssignment, ExperimentGate } from '../libs/experiment';
import type {
	ConsentSnapshot,
	KernelEvent,
	Listener,
	PromptSurface,
} from '../types';
import { createListenerSet } from './dispatch';
import type { Dispatcher, ListenerSet } from './dispatch';
import { buildNextSnapshot, isUnchangedPatch, snapshotChanged } from './patch';
import type { SnapshotPatch } from './patch';
import { freezeSnapshot, isPromptSurface } from './snapshot';

export type AnnouncedEvent = Extract<
	KernelEvent,
	{
		type:
			| 'iab:set'
			| 'init:applied'
			| 'overrides:set'
			| 'subject:resolved'
			| 'user:identified'
			| 'vendors:set';
	}
>['type'];

export interface KernelRuntime {
	getSnapshot: () => ConsentSnapshot;
	subscribe: (listener: Listener<ConsentSnapshot>) => () => void;
	emit: (event: KernelEvent) => void;
	commit: (patch: SnapshotPatch) => boolean;
	announce: (
		patch: SnapshotPatch,
		type: AnnouncedEvent,
		always?: boolean
	) => boolean;
	batch: Dispatcher['batch'];
	now: () => number;
	getGeneration: () => number;
	invalidateRecords: () => void;
	markLive: (at?: number) => void;
	setExperiment: (
		assignment: ExperimentAssignment | null,
		gate: ExperimentGate | null
	) => void;
}

export interface RuntimeOptions {
	initialSnapshot: ConsentSnapshot;
	emit: (event: KernelEvent) => void;
	dispatcher: Dispatcher;
	onDeadlineChange: () => void;
}

export const createRuntime = function createRuntime(
	options: RuntimeOptions
): KernelRuntime {
	const { dispatcher, emit, onDeadlineChange } = options;
	let snapshot = options.initialSnapshot;
	let live = false;
	let hiddenBySave: {
		snapshot: ConsentSnapshot;
		surface: PromptSurface;
	} | null = null;
	let generation = 0;
	let listeners: ListenerSet<ConsentSnapshot> | undefined;
	let wantedExperiment: ExperimentAssignment | null =
		options.initialSnapshot.experiment;
	let experimentGate: ExperimentGate | null = null;

	const getSnapshot = () => snapshot;
	const now = () => Date.now();

	const impressionDue = function impressionDue(
		candidate: ConsentSnapshot
	): candidate is ConsentSnapshot & { activeUI: PromptSurface } {
		return (
			live &&
			isPromptSurface(candidate.activeUI) &&
			candidate.surfaceShownAt[candidate.activeUI] === null
		);
	};

	const stampImpression = function stampImpression(
		candidate: ConsentSnapshot & { activeUI: PromptSurface }
	): ConsentSnapshot {
		return {
			...candidate,
			surfaceShownAt: {
				...candidate.surfaceShownAt,
				[candidate.activeUI]: candidate.evaluatedAt,
			},
		};
	};

	const stampCurrent = function stampCurrent(
		current: ConsentSnapshot & { activeUI: PromptSurface },
		at: number
	): ConsentSnapshot {
		return Object.freeze({
			...current,
			evaluatedAt: at,
			revision: current.revision + 1,
			surfaceShownAt: Object.freeze({
				...current.surfaceShownAt,
				[current.activeUI]: at,
			}),
		});
	};

	const gateExperiment = function gateExperiment(
		current: ConsentSnapshot,
		candidate: ConsentSnapshot,
		patch: SnapshotPatch
	): ConsentSnapshot {
		if (
			patch.experiment === undefined &&
			candidate.policyRule === current.policyRule
		) {
			return candidate;
		}
		const allowed =
			wantedExperiment && (!experimentGate || experimentGate(candidate))
				? wantedExperiment
				: null;
		return allowed === candidate.experiment
			? candidate
			: { ...candidate, experiment: allowed };
	};

	const exposedExperiment = function exposedExperiment(
		candidate: ConsentSnapshot
	): ExperimentAssignment | undefined {
		return candidate.experiment && candidate.surfaceShownAt.banner !== null
			? candidate.experiment
			: undefined;
	};

	const publish = function publish(
		current: ConsentSnapshot,
		adopted: ConsentSnapshot,
		shown: PromptSurface | null
	): void {
		dispatcher.batch(() => {
			if (listeners) {
				dispatcher.deliver(listeners, adopted);
			}
			if (adopted.effectivePermissions !== current.effectivePermissions) {
				emit({
					previous: current.effectivePermissions,
					snapshot: adopted,
					type: 'permissions:changed',
				});
			}
			if (shown !== null) {
				const event: Extract<KernelEvent, { type: 'surface:shown' }> = {
					shownAt: adopted.evaluatedAt,
					snapshot: adopted,
					surface: shown,
					type: 'surface:shown',
				};
				const experiment = exposedExperiment(adopted);
				if (experiment) {
					event.experiment = experiment;
				}
				emit(event);
			}
		});
	};

	const commit = function commit(patch: SnapshotPatch): boolean {
		if (patch.experiment !== undefined) {
			wantedExperiment = patch.experiment;
		}
		const current = snapshot;
		let adopted: ConsentSnapshot;
		if (isUnchangedPatch(current, patch)) {
			if (!impressionDue(current)) {
				return false;
			}
			adopted = stampCurrent(current, patch.now ?? current.evaluatedAt);
		} else {
			let next = gateExperiment(
				current,
				buildNextSnapshot(current, patch),
				patch
			);
			if (impressionDue(next)) {
				next = stampImpression(next);
			}
			if (!snapshotChanged(current, next)) {
				return false;
			}
			adopted = freezeSnapshot(next);
		}
		snapshot = adopted;
		const surface = adopted.activeUI;
		const restoredAfterSave =
			hiddenBySave !== null &&
			hiddenBySave.snapshot === current &&
			hiddenBySave.surface === surface &&
			patch.activeUI === surface;
		hiddenBySave =
			isPromptSurface(current.activeUI) &&
			current.activeUI !== surface &&
			patch.activeUI === undefined
				? { snapshot: adopted, surface: current.activeUI }
				: null;
		const shown: PromptSurface | null =
			live &&
			isPromptSurface(surface) &&
			!restoredAfterSave &&
			(surface !== current.activeUI || current.surfaceShownAt[surface] === null)
				? surface
				: null;
		publish(current, adopted, shown);
		if (adopted.nextDeadline !== current.nextDeadline) {
			onDeadlineChange();
		}
		return true;
	};

	const announce = function announce(
		patch: SnapshotPatch,
		type: AnnouncedEvent,
		always = false
	): boolean {
		return dispatcher.batch(() => {
			const changed = commit(patch);
			if (changed || always) {
				emit({ snapshot, type });
			}
			return changed;
		});
	};

	const setExperiment = function setExperiment(
		assignment: ExperimentAssignment | null,
		gate: ExperimentGate | null
	): void {
		const release = gate !== null || assignment === null;
		const pending = release ? false : snapshot.experimentPending;
		if (
			gate === experimentGate &&
			pending === snapshot.experimentPending &&
			assignment?.id === wantedExperiment?.id &&
			assignment?.arm === wantedExperiment?.arm &&
			assignment?.assignedBy === wantedExperiment?.assignedBy &&
			assignment?.acknowledgedDiagnostics ===
				wantedExperiment?.acknowledgedDiagnostics
		) {
			return;
		}
		experimentGate = gate;
		commit({
			experiment: assignment ? Object.freeze({ ...assignment }) : null,
			experimentPending: pending,
		});
	};

	const markLive = function markLive(at: number = now()): void {
		if (live) {
			return;
		}
		live = true;
		const current = snapshot;
		if (!impressionDue(current)) {
			return;
		}
		snapshot = stampCurrent(current, at);
		hiddenBySave = null;
		publish(current, snapshot, current.activeUI);
	};

	return {
		announce,
		batch: dispatcher.batch,
		commit,
		emit,
		getGeneration: () => generation,
		getSnapshot,
		invalidateRecords: () => {
			generation += 1;
		},
		markLive,
		now,
		setExperiment,
		subscribe(listener) {
			listeners ??= createListenerSet();
			return listeners.add(listener);
		},
	};
};
