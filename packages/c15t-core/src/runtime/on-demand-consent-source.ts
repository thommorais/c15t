import type { ConsentRuntimeModules } from './types';

export const connectConsentSourceOnDemand: ConsentRuntimeModules['connectConsentSource'] =
	(kernel, source) => {
		let disconnect: (() => void) | undefined;
		let stopped = false;
		void (async () => {
			try {
				const controls = await import('./controls');
				if (!stopped) {
					disconnect = controls.connectConsentSource(kernel, source);
				}
			} catch {
			}
		})();
		return () => {
			stopped = true;
			disconnect?.();
		};
	};
