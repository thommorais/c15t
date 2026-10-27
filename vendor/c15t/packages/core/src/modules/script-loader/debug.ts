import type { ScriptLoaderDebugEvent } from './types';

export const emitV2Debug = function emitV2Debug(
	event: ScriptLoaderDebugEvent
): void {
	if (typeof window === 'undefined') {
		return;
	}
	const listeners = (window as unknown as Record<string, unknown>)
		.__c15tScriptDebugListeners as
		| Set<(e: ScriptLoaderDebugEvent) => void>
		| undefined;
	if (!listeners) {
		return;
	}
	for (const listener of listeners) {
		try {
			listener(event);
		} catch {
		}
	}
};

export interface DebugEmitterOptions {
	onDebug?: (event: ScriptLoaderDebugEvent) => void;
	emitToV2: boolean;
}

export const createDebugEmitter = function createDebugEmitter(
	options: DebugEmitterOptions
) {
	const { onDebug, emitToV2 } = options;
	return function emit(event: ScriptLoaderDebugEvent): void {
		if (onDebug) {
			try {
				onDebug(event);
			} catch {
			}
		}
		if (emitToV2) {
			emitV2Debug(event);
		}
	};
};
