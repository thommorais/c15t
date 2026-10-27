import { networkBlockerTools } from '../modules/network-blocker/tools';
import { scriptLoaderTools } from '../modules/script-loader/tools';
import { lazyRuntimeModule } from './lazy-module';
import type { ConsentRuntimeModules } from './types';

const loadChunk = () => import('../modules/loader-and-blocker');

export const loaderAndBlockerOnDemand: Pick<
	ConsentRuntimeModules,
	'createNetworkBlocker' | 'createScriptLoader'
> = {
	createNetworkBlocker: (options) =>
		lazyRuntimeModule(async () => {
			const chunk = await loadChunk();
			return (loaded: typeof options) =>
				chunk.createNetworkBlockerWith(loaded, networkBlockerTools);
		})(options),
	createScriptLoader: (options) =>
		lazyRuntimeModule(async () => {
			const chunk = await loadChunk();
			return (loaded: typeof options) =>
				chunk.createScriptLoaderWith(loaded, scriptLoaderTools);
		})(options),
};
