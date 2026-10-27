import { clearOnRevocationTools } from '../modules/clear-on-revocation/tools';
import type {
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
} from '../modules/clear-on-revocation/types';
import { lazyRuntimeModule } from './lazy-module';

export const clearOnRevocationOnDemand = function clearOnRevocationOnDemand(
	options: ClearOnRevocationOptions
): ClearOnRevocationHandle {
	return lazyRuntimeModule(async () => {
		const module = await import('../modules/clear-on-revocation/clear');
		return (loaded: ClearOnRevocationOptions) =>
			module.createClearOnRevocationWith(loaded, clearOnRevocationTools);
	})(options);
};
