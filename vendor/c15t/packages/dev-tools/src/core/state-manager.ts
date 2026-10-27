import type { ConsentSnapshot, ConsentState, KernelEvent } from '@c15t/core';
import type {
	ScriptDiagnostic,
	ScriptLoaderDebugEvent,
} from '@c15t/core/modules/script-loader';

export type DevToolsPosition =
	| 'bottom-right'
	| 'bottom-left'
	| 'top-right'
	| 'top-left';

export interface DevToolsDock {
	readonly position: DevToolsPosition;
	readonly inline: number;
	readonly block: number;
}

export type DevToolsTab =
	| 'consents'
	| 'scripts'
	| 'location'
	| 'policy'
	| 'iab'
	| 'events'
	| 'actions';

export interface DevToolsEvent {
	readonly id: string;
	readonly type:
		| KernelEvent['type']
		| `script:${ScriptLoaderDebugEvent['action']}`;
	readonly message: string;
	readonly timestamp: number;
	readonly data?: Readonly<Record<string, unknown>>;
}

export interface DevToolsState {
	readonly isOpen: boolean;
	readonly activeTab: DevToolsTab;
	readonly position: DevToolsPosition;
	readonly dock: DevToolsDock | null;
	readonly snapshot: ConsentSnapshot;
	readonly draft: Readonly<Partial<ConsentState>>;
	readonly draftFingerprint: string | null;
	readonly events: readonly DevToolsEvent[];
	readonly scripts: readonly ScriptDiagnostic[];
}

export type DevToolsStateListener = (
	state: DevToolsState,
	previousState: DevToolsState
) => void;

export interface StateManager {
	getState: () => DevToolsState;
	subscribe: (listener: DevToolsStateListener) => () => void;
	setOpen: (isOpen: boolean) => void;
	setActiveTab: (tab: DevToolsTab) => void;
	setDock: (dock: DevToolsDock | null) => void;
	setSnapshot: (snapshot: ConsentSnapshot) => void;
	setDraft: (draft: Partial<ConsentState>) => void;
	setScripts: (scripts: readonly ScriptDiagnostic[]) => void;
	addEvent: (event: DevToolsEvent) => void;
	clearEvents: () => void;
	destroy: () => void;
}

// oxlint-disable-next-line func-style -- Preserve the public factory declaration.
export function createStateManager(options: {
	snapshot: ConsentSnapshot;
	position: DevToolsPosition;
	isOpen: boolean;
	activeTab: DevToolsTab;
	maxEvents: number;
}): StateManager {
	let state: DevToolsState = {
		activeTab: options.activeTab,
		dock: null,
		draft: Object.freeze({}),
		draftFingerprint: null,
		events: [],
		isOpen: options.isOpen,
		position: options.position,
		scripts: [],
		snapshot: options.snapshot,
	};
	let destroyed = false;
	const listeners = new Set<DevToolsStateListener>();

	// oxlint-disable-next-line func-style -- The helper is shared by every returned action.
	function update(partial: Partial<DevToolsState>): void {
		if (destroyed) {
			return;
		}
		const previousState = state;
		state = { ...state, ...partial };
		for (const listener of listeners) {
			listener(state, previousState);
		}
	}

	return {
		addEvent: (event) => {
			update({ events: [event, ...state.events].slice(0, options.maxEvents) });
		},
		clearEvents: () => {
			if (state.events.length > 0) {
				update({ events: [] });
			}
		},
		destroy: () => {
			destroyed = true;
			listeners.clear();
		},
		getState: () => state,
		setActiveTab: (activeTab) => {
			if (state.activeTab !== activeTab) {
				update({ activeTab });
			}
		},
		setDock: (dock) => {
			const current = state.dock;
			if (
				current === dock ||
				(current &&
					dock &&
					current.position === dock.position &&
					current.inline === dock.inline &&
					current.block === dock.block)
			) {
				return;
			}
			update({ dock: dock ? { ...dock } : null });
		},
		setDraft: (draft) =>
			update({
				draft: Object.freeze({ ...draft }),
				draftFingerprint:
					Object.keys(draft).length > 0
						? (state.draftFingerprint ??
							state.snapshot.evaluationPolicy.choice.fingerprint)
						: null,
			}),
		setOpen: (isOpen) => {
			if (state.isOpen !== isOpen) {
				update({ isOpen });
			}
		},
		setScripts: (scripts) => update({ scripts }),
		setSnapshot: (snapshot) => {
			if (state.snapshot !== snapshot) {
				const reset = snapshot.user !== state.snapshot.user;
				update({
					draft: reset ? Object.freeze({}) : state.draft,
					draftFingerprint: reset ? null : state.draftFingerprint,
					snapshot,
				});
			}
		},
		subscribe(listener) {
			if (destroyed) {
				// oxlint-disable-next-line no-empty-function -- A destroyed manager has nothing to unsubscribe.
				return () => {};
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
