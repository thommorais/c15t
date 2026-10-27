import type {
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
} from '../modules/clear-on-revocation/types';
import { createIframeBlocker } from '../modules/iframe-blocker';
import type {
	NetworkBlockerHandle,
	NetworkBlockerOptions,
} from '../modules/network-blocker/types';
import { createPersistence } from '../modules/persistence';
import { watchRevocationReload } from '../modules/revocation-reload';
import { createScriptLoader } from '../modules/script-loader';
import { createWindowDebug } from '../modules/window-debug';
import { assembleConsentRuntime } from './assemble';
import { connectConsentSource } from './controls';
import { mountRuntimeIAB } from './iab-mount';
import { lazyRuntimeModule } from './lazy-module';
import type {
	ConsentRuntime,
	ConsentRuntimeModules,
	ConsentRuntimeOptions,
} from './types';

export { createConsentProviderRuntime } from './provider-runtime';
export { streamPrefetch } from './streamed-prefetch';
export { connectConsentSource } from './controls';
export type { ConsentControlOptions } from './controls';
export { inferConsentCategories } from './runtime-kernel';

export type {
	ExternalConsentSource,
	ConsentRuntime,
	ConsentRuntimeIABFactory,
	ConsentRuntimeIABFactoryOptions,
	ConsentRuntimeGPPFactory,
	ConsentRuntimeGPPFactoryOptions,
	ConsentRuntimeGPPHandle,
	ConsentRuntimeIABHandle,
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
	ConsentRuntimeModules,
	ConsentRuntimeOptions,
	ConsentRuntimeUpdate,
	GPPModuleLoader,
	RuntimeGPPOptions,
	RuntimeIABOptions,
	RuntimeNetworkBlockerOptions,
	RuntimePersistenceOptions,
	RuntimePrefetch,
	StreamedPrefetch,
	RuntimeScriptLoaderOptions,
} from './types';
export type { WireRuntimeCallbacksOptions } from './callbacks';
export { wireRuntimeCallbacks } from './callbacks';
export type { IABModuleLoader, LazyIABFactory } from './lazy-iab';
export { isIABConfigured } from './iab-options';
export { createLazyIABFactory } from './lazy-iab';
export { lazyRuntimeModule } from './lazy-module';
export { mountRuntimeIAB } from './iab-mount';
export type { RuntimeIABMountOptions } from './iab-mount';
export { mountRuntimeGPP } from './gpp-mount';
export type { RuntimeGPPMountOptions } from './gpp-mount';

const loadClearOnRevocation = function loadClearOnRevocation(
	options: ClearOnRevocationOptions
): ClearOnRevocationHandle {
	return lazyRuntimeModule(async () => {
		const module = await import('../modules/clear-on-revocation');
		return module.createClearOnRevocation;
	})(options);
};

const loadNetworkBlocker = function loadNetworkBlocker(
	options: NetworkBlockerOptions
): NetworkBlockerHandle {
	return lazyRuntimeModule(async () => {
		const module = await import('../modules/network-blocker');
		return module.createNetworkBlocker;
	})(options);
};

export const defaultRuntimeModules: ConsentRuntimeModules = {
	connectConsentSource,
	createClearOnRevocation: (options) => loadClearOnRevocation(options),
	createIframeBlocker,
	createNetworkBlocker: (options) => loadNetworkBlocker(options),
	createPersistence,
	createScriptLoader,
	createWindowDebug,
	mountIAB: mountRuntimeIAB,
	watchRevocationReload,
};

export const createConsentRuntime = function createConsentRuntime(
	options: ConsentRuntimeOptions
): ConsentRuntime {
	return assembleConsentRuntime(options, defaultRuntimeModules).runtime;
};
