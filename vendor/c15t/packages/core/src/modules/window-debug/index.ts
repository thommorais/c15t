import { version } from '../../version';
import type {
	C15tWindowDebug,
	WindowDebugHandle,
	WindowDebugMode,
	WindowDebugModeInput,
	WindowDebugOptions,
} from './types';

export type {
	C15tWindowDebug,
	WindowDebugHandle,
	WindowDebugMode,
	WindowDebugModeInput,
	WindowDebugOptions,
} from './types';

export const resolveWindowDebugMode = function resolveWindowDebugMode(
	mode: WindowDebugModeInput
): WindowDebugMode {
	return mode.kind;
};

type WindowWithC15tDebug = Window & {
	c15t?: C15tWindowDebug;
};

const inertHandle: WindowDebugHandle = {
	dispose() {
	},
};

export const createWindowDebug = function createWindowDebug(
	options: WindowDebugOptions
): WindowDebugHandle {
	if (typeof window === 'undefined') {
		return inertHandle;
	}

	const target = window as WindowWithC15tDebug;
	const { getHosting } = options;
	const installed: C15tWindowDebug = Object.freeze({
		get hosting() {
			return getHosting?.() ?? null;
		},
		mode: options.mode,
		pkg: options.pkg,
		version,
	});

	try {
		target.c15t = installed;
	} catch {
		return inertHandle;
	}

	return {
		dispose() {
			if (target.c15t === installed) {
				try {
					delete target.c15t;
				} catch {
				}
			}
		},
	};
};
