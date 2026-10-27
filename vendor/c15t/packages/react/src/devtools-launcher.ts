'use client';

import type { ConsentKernel } from '@c15t/core';
import {
	claimDevToolsLauncher,
	EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT,
	getDevToolsLauncherSnapshot,
	subscribeDevToolsLauncher,
} from '@c15t/ui/utils/devtools-launcher';
import type {
	DevToolsDock,
	DevToolsLauncherSnapshot,
} from '@c15t/ui/utils/devtools-launcher';
import {
	useCallback,
	useContext,
	useId,
	useLayoutEffect,
	useMemo,
	useSyncExternalStore,
} from 'react';

import { KernelContext } from './context';

export { publishDevToolsLauncher } from '@c15t/ui/utils/devtools-launcher';
export type { DevToolsDock } from '@c15t/ui/utils/devtools-launcher';

export interface DevToolsLauncherControls {
	isOpen: boolean;
	toggle: () => void;
	dock: (dock: DevToolsDock | null) => void;
}

const subscribeNoop = () => () => undefined;
const getEmptySnapshot = () => EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT;

const useLauncherSnapshot = (
	kernel: ConsentKernel | null
): DevToolsLauncherSnapshot => {
	const subscribe = useCallback(
		(listener: () => void) =>
			kernel ? subscribeDevToolsLauncher(kernel, listener) : subscribeNoop(),
		[kernel]
	);
	const getSnapshot = useCallback(
		() =>
			kernel
				? getDevToolsLauncherSnapshot(kernel)
				: EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT,
		[kernel]
	);
	return useSyncExternalStore(subscribe, getSnapshot, getEmptySnapshot);
};

export const useDevToolsLauncherAvailable = (): boolean => {
	const kernel = useContext(KernelContext);
	return useLauncherSnapshot(kernel).instance !== null;
};

export const useDevToolsLauncher = (): DevToolsLauncherControls | null => {
	const kernel = useContext(KernelContext);
	const claim = useId();
	const snapshot = useLauncherSnapshot(kernel);

	useLayoutEffect(() => {
		if (!kernel) {
			return;
		}
		return claimDevToolsLauncher(kernel, claim);
	}, [kernel, claim]);

	const instance = snapshot.owner === claim ? snapshot.instance : null;
	const { isOpen } = snapshot;
	const dock = useCallback(
		(placement: DevToolsDock | null) => instance?.dock(placement),
		[instance]
	);
	const toggle = useCallback(() => instance?.toggle(), [instance]);
	return useMemo(
		() => (instance ? { dock, isOpen, toggle } : null),
		[instance, dock, isOpen, toggle]
	);
};
