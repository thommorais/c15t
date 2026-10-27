import type {
	ConsentKernel,
	ConsentPresentation,
	NoticeDismissResult,
	ConsentState,
	InitResult,
	KernelActiveUI,
	KernelOverrides,
	SaveResult,
} from '@c15t/core';
import { CONSENT_CATEGORIES } from '@c15t/core';
import {
	getScriptDiagnostics,
	subscribeScriptDiagnostics,
} from '@c15t/core/modules/script-loader';

import { KERNEL_EVENT_TYPES, kernelEventToDevToolsEvent } from './events';
import { readSelection } from './selection';
import { createStateManager } from './state-manager';
import type {
	DevToolsDock,
	DevToolsPosition,
	DevToolsState,
	DevToolsStateListener,
	DevToolsTab,
} from './state-manager';
import { createDevToolsView } from './view';

export interface DevToolsOptions {
	kernel: ConsentKernel;
	getConsentCategories?: () => readonly (keyof ConsentState)[];
	getPresentation?: () => ConsentPresentation | undefined;
	clearRecords?: () => void;
	container?: HTMLElement;
	embedded?: boolean;
	shadow?: boolean;
	position?: DevToolsPosition;
	defaultOpen?: boolean;
	defaultTab?: DevToolsTab;
	maxEvents?: number;
}

export interface DevToolsActions {
	setDraft: (input: Partial<ConsentState>) => void;
	resetDraft: () => void;
	dismissNotice: () => Promise<NoticeDismissResult>;
	clearRecords?: () => void;
	setOverrides: (overrides: KernelOverrides) => void;
	setActiveUI: (activeUI: KernelActiveUI) => void;
	init: () => Promise<InitResult>;
	save: (input?: Partial<ConsentState> | 'all' | 'none') => Promise<SaveResult>;
}

export interface DevToolsInstance {
	readonly element: HTMLElement | null;
	readonly actions: DevToolsActions;
	open: () => void;
	close: () => void;
	toggle: () => void;
	setActiveTab: (tab: DevToolsTab) => void;
	dock: (dock: DevToolsDock | null) => void;
	clearEvents: () => void;
	getState: () => DevToolsState;
	subscribe: (listener: DevToolsStateListener) => () => void;
	destroy: () => void;
}

// oxlint-disable-next-line func-style -- Preserve the documented public factory declaration.
export function createDevTools(options: DevToolsOptions): DevToolsInstance {
	const {
		kernel,
		container,
		embedded = false,
		shadow = true,
		position = 'bottom-right',
		defaultOpen = false,
		defaultTab = 'consents',
		maxEvents = 100,
	} = options;
	const eventLimit = Number.isFinite(maxEvents)
		? Math.max(1, Math.trunc(maxEvents))
		: 100;
	const getConsentCategories = () => {
		const { scope } = kernel.getSnapshot().policyRule;
		const displayed = options.getConsentCategories?.() ?? [
			'necessary',
			...scope,
		];
		return CONSENT_CATEGORIES.filter(
			(category) =>
				displayed.includes(category) &&
				(category === 'necessary' || scope.includes(category))
		);
	};
	const stateManager = createStateManager({
		activeTab: defaultTab,
		isOpen: embedded || defaultOpen,
		maxEvents: eventLimit,
		position,
		snapshot: kernel.getSnapshot(),
	});
	let destroyed = false;
	let eventSequence = 0;
	let scriptRefreshPending = false;
	stateManager.setScripts(getScriptDiagnostics(kernel));
	const unsubscribeScripts = subscribeScriptDiagnostics(kernel, (event) => {
		if (event) {
			eventSequence += 1;
			stateManager.addEvent({
				data: { ...event },
				id: String(eventSequence),
				message: `${event.scriptId}: ${event.message}`,
				timestamp: event.timestamp,
				type: `script:${event.action}`,
			});
		}
		if (scriptRefreshPending) {
			return;
		}
		scriptRefreshPending = true;
		queueMicrotask(() => {
			scriptRefreshPending = false;
			if (!destroyed) {
				stateManager.setScripts(getScriptDiagnostics(kernel));
			}
		});
	});

	const unsubscribeSnapshot = kernel.subscribe((snapshot) => {
		stateManager.setSnapshot(snapshot);
	});
	const unsubscribeEvents = KERNEL_EVENT_TYPES.map((type) =>
		kernel.events.on(type, (event) => {
			if (event.type === 'records:cleared') {
				stateManager.setDraft({});
			}
			eventSequence += 1;
			stateManager.addEvent(
				kernelEventToDevToolsEvent(event, String(eventSequence), Date.now())
			);
		})
	);
	const actions: DevToolsActions = {
		clearRecords: options.clearRecords
			? () => {
					options.clearRecords?.();
					stateManager.setDraft({});
				}
			: undefined,
		dismissNotice: () => kernel.commands.dismissNotice(),
		init: () => kernel.commands.init(),
		resetDraft: () => stateManager.setDraft({}),
		save: async (input) => {
			const captured = stateManager.getState();
			const snapshot = kernel.getSnapshot();
			if (
				input !== 'all' &&
				input !== 'none' &&
				captured.draftFingerprint !== null &&
				captured.draftFingerprint !==
					snapshot.evaluationPolicy.choice.fingerprint
			) {
				throw new Error(
					'Policy changed. Discard the draft and review the current choices before saving.'
				);
			}
			const commit = async (values: Partial<ConsentState> | 'all' | 'none') => {
				const result = await kernel.commands.save(values);
				if (result.ok && stateManager.getState().draft === captured.draft) {
					stateManager.setDraft({});
				}
				return result;
			};
			const categories = getConsentCategories().filter(
				(category) => category !== 'necessary'
			);
			if (
				(input === 'all' || input === 'none') &&
				categories.length === snapshot.policyRule.scope.length
			) {
				return await commit(input);
			}
			const values: Partial<ConsentState> = {};
			const defaults = options.getPresentation?.()?.preferences?.defaults;
			for (const category of categories) {
				if (input === 'all' || input === 'none') {
					values[category] = input === 'all';
				} else if (input === undefined) {
					values[category] = readSelection(
						snapshot,
						captured.draft,
						category,
						defaults
					);
				} else if (
					Object.hasOwn(input, category) &&
					typeof input[category] === 'boolean'
				) {
					values[category] = input[category];
				}
			}
			return await commit(values);
		},
		setActiveUI: (activeUI) => kernel.set.activeUI(activeUI),
		setDraft(input) {
			const draft = { ...stateManager.getState().draft };
			for (const category of getConsentCategories()) {
				if (
					category !== 'necessary' &&
					Object.hasOwn(input, category) &&
					typeof input[category] === 'boolean'
				) {
					draft[category] = input[category];
				}
			}
			stateManager.setDraft(draft);
		},
		setOverrides: (overrides) => kernel.set.overrides(overrides),
	};
	const view = createDevToolsView({
		actions,
		container,
		embedded,
		getConsentCategories,
		getPresentation: options.getPresentation,
		kernel,
		shadow,
		stateManager,
	});

	return {
		actions,
		clearEvents: stateManager.clearEvents,
		close: () => stateManager.setOpen(false),
		destroy() {
			if (destroyed) {
				return;
			}
			destroyed = true;
			unsubscribeSnapshot();
			unsubscribeScripts();
			for (const unsubscribe of unsubscribeEvents) {
				unsubscribe();
			}
			view.destroy();
			stateManager.destroy();
		},
		dock: (dock) => stateManager.setDock(dock),
		element: view.element,
		getState: stateManager.getState,
		open: () => stateManager.setOpen(true),
		setActiveTab: (tab) => stateManager.setActiveTab(tab),
		subscribe: stateManager.subscribe,
		toggle: () => {
			stateManager.setOpen(!stateManager.getState().isOpen);
		},
	};
}
