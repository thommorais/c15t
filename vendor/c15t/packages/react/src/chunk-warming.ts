import { useEffect } from 'react';

import { useUIConfig } from './ui-config-context';

type Warmer = () => void;

export type DialogPreload = 'idle' | 'intent';

const warmers = new Set<Warmer>();
let warmed = false;

export const registerDialogChunkWarmer = function registerDialogChunkWarmer(
	warmer: Warmer
): () => void {
	warmers.add(warmer);
	if (warmed) {
		warmer();
	}
	return () => {
		warmers.delete(warmer);
	};
};

export const warmDialogChunk = function warmDialogChunk(): void {
	warmed = true;
	for (const warmer of warmers) {
		warmer();
	}
};

interface NetworkInformationLike {
	effectiveType?: string;
	saveData?: boolean;
}

const SLOW_CONNECTIONS = new Set(['slow-2g', '2g']);
const IDLE_FALLBACK_DELAY_MS = 200;

const idleWarmingAllowed = function idleWarmingAllowed(): boolean {
	if (typeof navigator === 'undefined' || navigator.onLine === false) {
		return false;
	}
	const { connection } = navigator as Navigator & {
		connection?: NetworkInformationLike;
	};
	if (connection?.saveData === true) {
		return false;
	}
	return !SLOW_CONNECTIONS.has(connection?.effectiveType ?? '');
};

let activeGates = 0;
let idleScheduled = false;

const warmWhenIdle = function warmWhenIdle(): void {
	idleScheduled = false;
	if (activeGates > 0 && idleWarmingAllowed()) {
		warmDialogChunk();
	}
};

const scheduleIdleWarm = function scheduleIdleWarm(): void {
	if (idleScheduled || warmed || !idleWarmingAllowed()) {
		return;
	}
	idleScheduled = true;
	const afterLoad = () => {
		if (typeof window.requestIdleCallback === 'function') {
			window.requestIdleCallback(warmWhenIdle);
		} else {
			window.setTimeout(warmWhenIdle, IDLE_FALLBACK_DELAY_MS);
		}
	};
	if (document.readyState === 'complete') {
		afterLoad();
	} else {
		window.addEventListener('load', afterLoad, { once: true });
	}
};

export const useIdleDialogWarming = function useIdleDialogWarming(
	active: boolean
): void {
	const { preloadDialog = 'idle' } = useUIConfig();
	const enabled = active && preloadDialog === 'idle';
	useEffect(() => {
		if (!enabled) {
			return;
		}
		activeGates += 1;
		scheduleIdleWarm();
		return () => {
			activeGates -= 1;
		};
	}, [enabled]);
};

export const resetDialogChunkWarmingForTests =
	function resetDialogChunkWarmingForTests(): void {
		warmed = false;
		activeGates = 0;
		idleScheduled = false;
	};
