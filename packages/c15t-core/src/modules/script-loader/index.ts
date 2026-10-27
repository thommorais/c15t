import { createScriptLoaderWith } from './loader';
import { scriptLoaderTools } from './tools';
import type { ScriptLoaderHandle, ScriptLoaderOptions } from './types';

export {
	getScriptDiagnostics,
	subscribeScriptDiagnostics,
} from './diagnostics';
export type { ScriptDiagnostic, ScriptDiagnosticStatus } from './diagnostics';

export type {
	Script,
	ScriptCallbackInfo,
	ScriptLoaderDebugEvent,
	ScriptLoaderHandle,
	ScriptLoaderOptions,
} from './types';

export const createScriptLoader = function createScriptLoader(
	options: ScriptLoaderOptions
): ScriptLoaderHandle {
	return createScriptLoaderWith(options, scriptLoaderTools);
};
