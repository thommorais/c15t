import type { AllConsentNames } from '../../consent/consent-types';
import type { extractConsentNamesFromCondition } from '../../libs/has';
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type {
	declareOwnedVendors,
	forgetOwnedVendors,
	isValidVendorId,
} from '../../libs/vendors';
import type {
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	KernelIABState,
} from '../../types';
import type {
	deniedVendorIds,
	evaluateConsent,
	getEffectiveGateState,
	has,
} from '../has';

export type { Script, ScriptCallbackInfo };

export interface ScriptLoaderTools {
	registration?: symbol;

	categoriesOf: typeof extractConsentNamesFromCondition;
	declareOwners: typeof declareOwnedVendors;
	deniedVendors: typeof deniedVendorIds;
	evaluate: typeof evaluateConsent;
	forgetOwners: typeof forgetOwnedVendors;
	gateState: typeof getEffectiveGateState;
	has: typeof has;
	isVendorId: typeof isValidVendorId;
}

export interface ScriptLoaderDebugEvent {
	source: 'script-loader';
	scope: 'lifecycle' | 'phase' | 'step';
	action:
		| 'skipped'
		| 'loaded'
		| 'load_completed'
		| 'unloaded'
		| 'already_loaded'
		| 'error'
		| 'callback_invoked'
		| 'callback_error';
	message: string;
	scriptId: string;
	elementId?: string;
	hasConsent?: boolean;
	callback?:
		| 'onLoad'
		| 'onError'
		| 'onConsentChange'
		| 'onBeforeLoad'
		| 'onDispose';
	data?: Record<string, unknown>;
	timestamp: number;
}

export interface ScriptLoaderOptions {
	kernel: ConsentKernel;
	scripts: Script[];
	onDebug?: (event: ScriptLoaderDebugEvent) => void;
	nonce?: string;
	emitToV2DebugListeners?: boolean;
}

export interface ScriptLoaderHandle {
	dispose: () => void;
	updateScripts: (next: Script[]) => void;
	getLoadedScriptIds: () => string[];
}

export interface NormalizedScript {
	script: Script;
	hasIabMeta: boolean;
	simpleCategory: AllConsentNames | null;
	vendor: string | null;
}

export interface ReconcilePass {
	snapshot: ConsentSnapshot;
	tools: Pick<ScriptLoaderTools, 'evaluate' | 'has'>;
	consents: ConsentState;
	isIabMode: boolean;
	iab: KernelIABState | null;
	vendorDenied: ReadonlySet<string> | null;
}

export interface PendingMount {
	appended: boolean;
	script: Script;
	element: HTMLScriptElement;
	target: HTMLElement;
	elementId: string;
	hasConsent: boolean;
	info: ScriptCallbackInfo | undefined;
}
