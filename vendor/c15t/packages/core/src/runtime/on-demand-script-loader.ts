import { scriptLoaderTools } from '../modules/script-loader/tools';
import type {
	ScriptLoaderHandle,
	ScriptLoaderOptions,
} from '../modules/script-loader/types';
import { lazyRuntimeModule } from './lazy-module';

export const scriptLoaderOnDemand = function scriptLoaderOnDemand(
	options: ScriptLoaderOptions
): ScriptLoaderHandle {
	return lazyRuntimeModule(async () => {
		const module = await import('../modules/script-loader/loader');
		return (loaded: ScriptLoaderOptions) =>
			module.createScriptLoaderWith(loaded, scriptLoaderTools);
	})(options);
};
