import { GPP_VERSION } from './sections';
import type {
	GPPApi,
	GPPCallback,
	GPPEventData,
	GPPPingData,
	GPPQueuedListener,
} from './types';

const LOCATOR_NAME = '__gppLocator';

let stubInitialized = false;
let ownedStub: GPPApi | null = null;
let locatorFrame: HTMLIFrameElement | null = null;
let answeringFrames = false;
let waitingForBody: (() => void) | null = null;

const stubPingData = function stubPingData(): GPPPingData {
	return {
		applicableSections: [-1],
		cmpDisplayStatus: 'hidden',
		cmpId: 0,
		cmpStatus: 'stub',
		gppString: '',
		gppVersion: GPP_VERSION,
		parsedSections: {},
		sectionList: [],
		signalStatus: 'not ready',
		supportedAPIs: [],
	};
};

const SECTION_QUERIES = new Set(['hasSection', 'getSection', 'getField']);

export const createGPPStub = function createGPPStub(): GPPApi {
	const queue: unknown[][] = [];
	const events: GPPQueuedListener[] = [];
	let lastId = 0;
	return function gppStub(
		...args: [
			command?: string,
			handler?: GPPCallback,
			parameter?: unknown,
			version?: string,
		]
	): unknown {
		const [command, handler, parameter] = args;
		if (args.length === 0) {
			return queue;
		}
		if (command === 'events') {
			return events;
		}
		if (command === 'ping') {
			handler?.(stubPingData(), true);
			return undefined;
		}
		if (command === 'addEventListener') {
			lastId += 1;
			const listener = handler as GPPCallback<GPPEventData> | undefined;
			if (listener) {
				events.push({ callback: listener, id: lastId, parameter });
				listener(
					{
						data: true,
						eventName: 'listenerRegistered',
						listenerId: lastId,
						pingData: stubPingData(),
					},
					true
				);
			}
			return undefined;
		}
		if (command === 'removeEventListener') {
			const index = events.findIndex((event) => event.id === Number(parameter));
			if (index !== -1) {
				events.splice(index, 1);
			}
			handler?.(index !== -1, true);
			return undefined;
		}
		if (command && SECTION_QUERIES.has(command)) {
			handler?.(null, true);
			return undefined;
		}
		queue.push(args);
		return undefined;
	};
};

interface GPPCallMessage {
	command: string;
	parameter?: unknown;
	version?: string;
	callId: string | number;
}

const readCall = function readCall(
	data: unknown
): { call: GPPCallMessage; json: boolean } | null {
	let message = data;
	let json = false;
	if (typeof data === 'string') {
		try {
			message = JSON.parse(data);
			json = true;
		} catch {
			return null;
		}
	}
	if (!message || typeof message !== 'object' || !('__gppCall' in message)) {
		return null;
	}
	const call = (message as { __gppCall: unknown }).__gppCall;
	if (
		!call ||
		typeof call !== 'object' ||
		typeof (call as GPPCallMessage).command !== 'string' ||
		(call as GPPCallMessage).callId === undefined
	) {
		return null;
	}
	return { call: call as GPPCallMessage, json };
};

const handlePostMessage = function handlePostMessage(
	event: MessageEvent
): void {
	if (typeof window === 'undefined' || !window.__gpp) {
		return;
	}
	const request = readCall(event.data);
	if (!request) {
		return;
	}
	const { call, json } = request;
	window.__gpp(
		call.command,
		(returnValue, success) => {
			const response = {
				__gppReturn: { callId: call.callId, returnValue, success },
			};
			const source = event.source as Window | null;
			if (source && typeof source.postMessage === 'function') {
				source.postMessage(json ? JSON.stringify(response) : response, '*');
			}
		},
		call.parameter,
		call.version
	);
};

const hasLocatorFrame = (): boolean =>
	typeof document !== 'undefined' &&
	document.querySelector(`iframe[name="${LOCATOR_NAME}"]`) !== null;

const addLocatorFrame = function addLocatorFrame(): void {
	if (typeof document === 'undefined' || hasLocatorFrame()) {
		return;
	}
	if (!document.body) {
		waitingForBody = () => {
			waitingForBody = null;
			addLocatorFrame();
		};
		document.addEventListener('DOMContentLoaded', waitingForBody, {
			once: true,
		});
		return;
	}
	const frame = document.createElement('iframe');
	frame.name = LOCATOR_NAME;
	frame.style.display = 'none';
	frame.setAttribute('aria-hidden', 'true');
	frame.tabIndex = -1;
	document.body.appendChild(frame);
	locatorFrame = frame;
};

export const initializeGPPStub = function initializeGPPStub(): void {
	if (typeof window === 'undefined' || stubInitialized) {
		return;
	}
	stubInitialized = true;
	const framesAnswered = Boolean(window.__gpp) || hasLocatorFrame();
	if (!window.__gpp) {
		ownedStub = createGPPStub();
		window.__gpp = ownedStub;
	}
	if (framesAnswered) {
		return;
	}
	addLocatorFrame();
	window.addEventListener('message', handlePostMessage);
	answeringFrames = true;
};

export const destroyGPPStub = function destroyGPPStub(): void {
	if (typeof window === 'undefined') {
		return;
	}
	if (answeringFrames) {
		window.removeEventListener('message', handlePostMessage);
		answeringFrames = false;
	}
	if (waitingForBody) {
		document.removeEventListener('DOMContentLoaded', waitingForBody);
		waitingForBody = null;
	}
	locatorFrame?.remove();
	locatorFrame = null;
	if (ownedStub && window.__gpp === ownedStub) {
		delete window.__gpp;
	}
	ownedStub = null;
	stubInitialized = false;
};
