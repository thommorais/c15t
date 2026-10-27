import { networkBlockerTools } from '../modules/network-blocker/tools';
import type {
	NetworkBlockerHandle,
	NetworkBlockerOptions,
} from '../modules/network-blocker/types';
import { lazyRuntimeModule } from './lazy-module';

export const networkBlockerOnDemand = function networkBlockerOnDemand(
	options: NetworkBlockerOptions
): NetworkBlockerHandle {
	return lazyRuntimeModule(async () => {
		const module = await import('../modules/network-blocker/blocker');
		return (loaded: NetworkBlockerOptions) =>
			module.createNetworkBlockerWith(loaded, networkBlockerTools);
	})(options);
};
