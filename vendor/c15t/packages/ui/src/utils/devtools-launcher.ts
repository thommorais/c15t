import type { ConsentKernel } from '@c15t/core';

import type { CornerPosition } from './trigger-utils';

export interface DevToolsDock {
	readonly position: CornerPosition;
	readonly inline: number;
	readonly block: number;
}

export interface DevToolsLauncherTarget {
	getState: () => { readonly isOpen: boolean };
	subscribe: (
		listener: (
			state: { readonly isOpen: boolean },
			previous: { readonly isOpen: boolean }
		) => void
	) => () => void;
	toggle: () => void;
	dock: (dock: DevToolsDock | null) => void;
}

export interface DevToolsLauncherSnapshot {
	readonly instance: DevToolsLauncherTarget | null;
	readonly isOpen: boolean;
	readonly owner: unknown;
}

interface LauncherSlot {
	instance: DevToolsLauncherTarget | null;
	claims: unknown[];
	snapshot: DevToolsLauncherSnapshot;
	listeners: Set<() => void>;
}

export const EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT: DevToolsLauncherSnapshot = {
	instance: null,
	isOpen: false,
	owner: null,
};

const DEVTOOLS_DOCK_GAP = 8;

const slots = new WeakMap<ConsentKernel, LauncherSlot>();

const getSlot = function getSlot(kernel: ConsentKernel): LauncherSlot {
	let slot = slots.get(kernel);
	if (!slot) {
		slot = {
			claims: [],
			instance: null,
			listeners: new Set(),
			snapshot: EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT,
		};
		slots.set(kernel, slot);
	}
	return slot;
};

const refresh = function refresh(slot: LauncherSlot): void {
	const next: DevToolsLauncherSnapshot = {
		instance: slot.instance,
		isOpen: slot.instance?.getState().isOpen ?? false,
		owner: slot.claims[0] ?? null,
	};
	const current = slot.snapshot;
	if (
		current.instance === next.instance &&
		current.isOpen === next.isOpen &&
		current.owner === next.owner
	) {
		return;
	}
	slot.snapshot = next;
	for (const listener of slot.listeners) {
		listener();
	}
};

export const publishDevToolsLauncher = function publishDevToolsLauncher(
	kernel: ConsentKernel,
	instance: DevToolsLauncherTarget
): () => void {
	const slot = getSlot(kernel);
	slot.instance = instance;
	const unsubscribe = instance.subscribe((state, previous) => {
		if (state.isOpen !== previous.isOpen) {
			refresh(slot);
		}
	});
	refresh(slot);
	return () => {
		unsubscribe();
		if (slot.instance === instance) {
			slot.instance = null;
			refresh(slot);
		}
	};
};

export const claimDevToolsLauncher = function claimDevToolsLauncher(
	kernel: ConsentKernel,
	claim: unknown
): () => void {
	const slot = getSlot(kernel);
	slot.claims.push(claim);
	refresh(slot);
	return () => {
		slot.claims = slot.claims.filter((entry) => entry !== claim);
		if (slot.claims.length === 0) {
			slot.instance?.dock(null);
		}
		refresh(slot);
	};
};

export const getDevToolsLauncherSnapshot = function getDevToolsLauncherSnapshot(
	kernel: ConsentKernel
): DevToolsLauncherSnapshot {
	return getSlot(kernel).snapshot;
};

export const subscribeDevToolsLauncher = function subscribeDevToolsLauncher(
	kernel: ConsentKernel,
	listener: () => void
): () => void {
	const { listeners } = getSlot(kernel);
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const measureDevToolsDock = function measureDevToolsDock(
	element: HTMLElement,
	corner: CornerPosition
): DevToolsDock {
	const { clientWidth, clientHeight } = element.ownerDocument.documentElement;
	const left = element.offsetLeft;
	const top = element.offsetTop;
	return {
		block: corner.startsWith('top')
			? top + element.offsetHeight + DEVTOOLS_DOCK_GAP
			: clientHeight - top + DEVTOOLS_DOCK_GAP,
		inline: corner.endsWith('left')
			? left
			: clientWidth - left - element.offsetWidth,
		position: corner,
	};
};

export const followDevToolsDock = function followDevToolsDock(
	element: HTMLElement,
	corner: CornerPosition,
	dock: (placement: DevToolsDock) => void
): () => void {
	const place = () => dock(measureDevToolsDock(element, corner));
	place();
	const view = element.ownerDocument.defaultView;
	const observer =
		typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
	observer?.observe(element);
	view?.addEventListener('resize', place);
	return () => {
		observer?.disconnect();
		view?.removeEventListener('resize', place);
	};
};
