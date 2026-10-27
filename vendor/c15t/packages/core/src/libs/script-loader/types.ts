import type { Vendor } from '@c15t/schema/types';

import type { ConsentState } from '../../consent/compliance';
import type { AllConsentNames } from '../../consent/consent-types';
import type { HasCondition } from '../has';

export type VendorDetails = Pick<Vendor, 'name' | 'privacyPolicyUrl'> &
	Partial<Pick<Vendor, 'description' | 'homepageUrl' | 'legalName'>>;

export interface ScriptCallbackInfo {
	readonly registration?: symbol;

	id: string;

	elementId: string;

	hasConsent: boolean;

	consents: ConsentState;

	vendor?: { id: string; granted: boolean };

	element?: HTMLScriptElement;

	error?: Error;

	startedOnServer?: true;
}

export interface ScriptServerStart {
	code: string;
	prelude?: string;
}

export interface Script {
	id: string;

	resourceKey?: string;

	src?: string;

	textContent?: string;

	category: HasCondition<AllConsentNames>;

	callbackOnly?: boolean;

	persistAfterConsentRevoked?: boolean;

	alwaysLoad?: boolean;

	fetchPriority?: 'high' | 'low' | 'auto';

	serverStart?: (
		info: Pick<ScriptCallbackInfo, 'consents' | 'hasConsent' | 'id' | 'vendor'>,
		script: Script
	) => ScriptServerStart | undefined;

	attributes?: Record<string, string>;

	async?: boolean;

	defer?: boolean;

	nonce?: string;

	anonymizeId?: boolean;

	target?: 'head' | 'body';

	onBeforeLoad?: (info: ScriptCallbackInfo) => void;

	onLoad?: (info: ScriptCallbackInfo) => void;

	onError?: (info: ScriptCallbackInfo) => void;

	observeConsentBeforeLoad?: boolean;

	onConsentChange?: (info: ScriptCallbackInfo) => void;

	onDispose?: (info: ScriptCallbackInfo) => void;

	vendor?: string;

	vendorDetails?: VendorDetails;

	vendorId?: number | string;

	iabPurposes?: number[];

	iabLegIntPurposes?: number[];

	iabSpecialFeatures?: number[];
}

export interface ScriptUpdateResult {
	loaded: string[];

	unloaded: string[];
}

export type ScriptDebugSource = 'script-loader' | 'manifest-runtime';

export type ScriptDebugScope = 'lifecycle' | 'phase' | 'step';

export type ScriptLifecycleCallback =
	| 'onBeforeLoad'
	| 'onLoad'
	| 'onConsentChange'
	| 'onDispose'
	| 'onError';

export type ScriptDebugAction =
	| 'skipped'
	| 'already_loaded'
	| 'callback_start'
	| 'callback_complete'
	| 'callback_error'
	| 'element_appended'
	| 'loaded'
	| 'load_listener_attached'
	| 'error_listener_attached'
	| 'unloaded'
	| 'phase_start'
	| 'phase_complete'
	| 'step_executed'
	| 'step_error';

export interface ScriptDebugEvent {
	source: ScriptDebugSource;
	scope: ScriptDebugScope;
	action: ScriptDebugAction;
	message: string;
	scriptId: string;
	elementId?: string;
	hasConsent?: boolean;
	callback?: ScriptLifecycleCallback;
	phase?: string;
	stepType?: string;
	stepIndex?: number;
	data?: Record<string, unknown>;
	timestamp: number;
}

export type ScriptDebugEventInput = Omit<ScriptDebugEvent, 'timestamp'>;

export type ScriptDebugListener = (event: ScriptDebugEvent) => void;
