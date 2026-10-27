'use client';

import type { TriggerToolbar } from './atoms/toolbar';

export type TriggerToolbarComponent = typeof TriggerToolbar;

let loaded: TriggerToolbarComponent | undefined;
let pending: Promise<TriggerToolbarComponent> | undefined;

export const registerTriggerToolbar = function registerTriggerToolbar(
	component: TriggerToolbarComponent
): void {
	loaded = component;
};

export const getTriggerToolbar = function getTriggerToolbar():
	| TriggerToolbarComponent
	| undefined {
	return loaded;
};

export const loadTriggerToolbar =
	function loadTriggerToolbar(): Promise<TriggerToolbarComponent> {
		if (loaded) {
			return Promise.resolve(loaded);
		}
		pending ??= (async () => {
			try {
				const module = await import('./atoms/toolbar');
				loaded ??= module.TriggerToolbar;
				return loaded;
			} catch (error) {
				pending = undefined;
				throw error;
			}
		})();
		return pending;
	};
