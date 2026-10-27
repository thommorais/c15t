import type * as IabtechlabtcfCoreTypes from '@iabtechlabtcf/core';

export type TCFCoreModule = typeof IabtechlabtcfCoreTypes;

let tcfCoreModule: TCFCoreModule | null = null;

let loadingPromise: Promise<TCFCoreModule> | null = null;

export const getTCFCore = function getTCFCore(): Promise<TCFCoreModule> {
	if (tcfCoreModule) {
		return Promise.resolve(tcfCoreModule);
	}

	if (loadingPromise) {
		return loadingPromise;
	}

	loadingPromise = (async () => {
		try {
			const module = await import('@iabtechlabtcf/core');
			tcfCoreModule = module;
			loadingPromise = null;
			return module;
		} catch (error) {
			loadingPromise = null;
			throw new Error(
				`Failed to load @iabtechlabtcf/core: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
					'Make sure it is installed as a dependency.',
				{ cause: error }
			);
		}
	})();

	return loadingPromise;
};

export const isTCFCoreLoaded = function isTCFCoreLoaded(): boolean {
	return tcfCoreModule !== null;
};

export const getTCFCoreSync = function getTCFCoreSync(): TCFCoreModule | null {
	return tcfCoreModule;
};

export const resetTCFCoreCache = function resetTCFCoreCache(): void {
	tcfCoreModule = null;
	loadingPromise = null;
};
