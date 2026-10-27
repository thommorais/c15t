import { version } from '../version';
import type { PingData, TCFApi, TCFApiCallback } from './iab-tcf-types';

let stubInitialized = false;
let ownedStub: TCFApi | null = null;

let locatorIframe: HTMLIFrameElement | null = null;

const createStubPingData = function createStubPingData(): PingData {
	return {
		apiVersion: '2.3',
		cmpId: 0,
		cmpLoaded: false,
		cmpStatus: 'stub',
		cmpVersion: version,
		displayStatus: 'hidden',
		gdprApplies: undefined,
		gvlVersion: 0,
		tcfPolicyVersion: 5,
	};
};

const createStubApi = function createStubApi(): TCFApi {
	const queue: Parameters<TCFApi>[] = [];

	const stub = ((
		command: string,
		apiVersion: number,
		handler: TCFApiCallback<unknown>,
		parameter?: unknown
	) => {
		if (command === 'ping') {
			(handler as TCFApiCallback<PingData>)(createStubPingData(), true);
		} else {
			queue.push([
				command,
				apiVersion,
				handler,
				parameter,
			] as Parameters<TCFApi>);
		}
	}) as TCFApi;

	stub.queue = queue;

	return stub;
};

const createLocatorIframe =
	function createLocatorIframe(): HTMLIFrameElement | null {
		if (typeof document === 'undefined') {
			return null;
		}

		if (document.querySelector('iframe[name="__tcfapiLocator"]')) {
			return null;
		}

		const iframe = document.createElement('iframe');
		iframe.name = '__tcfapiLocator';
		iframe.style.display = 'none';
		iframe.setAttribute('aria-hidden', 'true');
		iframe.tabIndex = -1;

		const target = document.body ?? document.documentElement;
		target.appendChild(iframe);

		return iframe;
	};

const handlePostMessage = function handlePostMessage(
	event: MessageEvent
): void {
	if (typeof window === 'undefined' || !window.__tcfapi) {
		return;
	}

	const { data } = event;

	if (!data || typeof data !== 'object' || !('__tcfapiCall' in data)) {
		return;
	}

	const call = data.__tcfapiCall as {
		command: string;
		version: number;
		callId: string;
		parameter?: unknown;
	};

	if (!call || !call.command || !call.callId) {
		return;
	}

	(
		window.__tcfapi as (
			command: string,
			version: number,
			handler: TCFApiCallback<unknown>,
			parameter?: unknown
		) => void
	)(
		call.command,
		call.version,
		(returnValue: unknown, success: boolean) => {
			const response = {
				__tcfapiReturn: {
					callId: call.callId,
					returnValue,
					success,
				},
			};

			if (event.source && typeof event.source.postMessage === 'function') {
				(event.source as Window).postMessage(response, '*');
			}
		},
		call.parameter
	);
};

export const initializeIABStub = function initializeIABStub(): void {
	if (typeof window === 'undefined') {
		return;
	}

	if (stubInitialized) {
		return;
	}

	if (!window.__tcfapi) {
		ownedStub = createStubApi();
		window.__tcfapi = ownedStub;
	}

	locatorIframe = createLocatorIframe();

	window.addEventListener('message', handlePostMessage);

	stubInitialized = true;
};

export const getStubQueue = function getStubQueue(): Parameters<TCFApi>[] {
	if (typeof window === 'undefined' || !window.__tcfapi) {
		return [];
	}

	return window.__tcfapi.queue ?? [];
};

export const clearStubQueue = function clearStubQueue(): void {
	if (typeof window !== 'undefined' && window.__tcfapi?.queue) {
		window.__tcfapi.queue = [];
	}
};

export const isStubActive = function isStubActive(): boolean {
	if (typeof window === 'undefined' || !window.__tcfapi) {
		return false;
	}

	return Array.isArray(window.__tcfapi.queue);
};

export const destroyIABStub = function destroyIABStub(): void {
	if (typeof window === 'undefined') {
		return;
	}

	window.removeEventListener('message', handlePostMessage);

	if (locatorIframe?.parentNode) {
		locatorIframe.parentNode.removeChild(locatorIframe);
		locatorIframe = null;
	}

	if (ownedStub && window.__tcfapi === ownedStub) {
		delete window.__tcfapi;
	}
	ownedStub = null;
	stubInitialized = false;
};

export const isStubInitialized = function isStubInitialized(): boolean {
	return stubInitialized;
};
