import { assembleConsentRuntime } from './assemble';
import type {
	ConsentRuntime,
	ConsentRuntimeModules,
	ConsentRuntimeOptions,
} from './types';

export const createConsentRuntimeWith = function createConsentRuntimeWith(
	options: ConsentRuntimeOptions,
	modules: ConsentRuntimeModules
): ConsentRuntime {
	return assembleConsentRuntime(options, modules).runtime;
};
