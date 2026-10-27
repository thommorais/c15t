import type { ConsentSnapshot } from '../../types';
import type {
	Script,
	ScriptCallbackInfo,
	ScriptLoaderDebugEvent,
	ScriptLoaderTools,
} from './types';

export const buildCallbackInfo = function buildCallbackInfo(
	tools: Pick<
		ScriptLoaderTools,
		'deniedVendors' | 'gateState' | 'registration'
	>,
	script: Script,
	snapshot: ConsentSnapshot,
	hasConsent: boolean,
	elementId: string,
	element?: HTMLScriptElement,
	error?: Error
): ScriptCallbackInfo {
	const info: ScriptCallbackInfo = {
		consents: tools.gateState(snapshot).effectivePermissions,
		element,
		elementId,
		error,
		hasConsent,
		id: script.id,
	};
	if (tools.registration) {
		Object.defineProperty(info, 'registration', { value: tools.registration });
	}
	if (script.vendor && snapshot.model !== 'iab') {
		info.vendor = {
			granted: !tools.deniedVendors(snapshot)?.has(script.vendor),
			id: script.vendor,
		};
	}
	return info;
};

export const hasAnyCallback = function hasAnyCallback(script: Script): boolean {
	return (
		typeof script.onBeforeLoad === 'function' ||
		typeof script.onLoad === 'function' ||
		typeof script.onError === 'function' ||
		typeof script.onConsentChange === 'function'
	);
};

export const invokeCallback = function invokeCallback(
	script: Script,
	key: NonNullable<ScriptLoaderDebugEvent['callback']>,
	info: ScriptCallbackInfo,
	emit: (event: ScriptLoaderDebugEvent) => void
): void {
	const fn = script[key];
	if (typeof fn !== 'function') {
		return;
	}
	try {
		fn(info);
		emit({
			action: 'callback_invoked',
			callback: key,
			elementId: info.elementId,
			hasConsent: info.hasConsent,
			message: `Invoked ${String(key)}`,
			scope: 'step',
			scriptId: script.id,
			source: 'script-loader',
			timestamp: Date.now(),
		});
	} catch (err) {
		emit({
			action: 'callback_error',
			callback: key,
			data: { error: err instanceof Error ? err.message : String(err) },
			elementId: info.elementId,
			message: `Callback ${String(key)} threw`,
			scope: 'step',
			scriptId: script.id,
			source: 'script-loader',
			timestamp: Date.now(),
		});
	}
};
