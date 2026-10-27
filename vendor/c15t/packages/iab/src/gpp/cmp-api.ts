import { encodeGPPString } from './encoder';
import { GPP_VERSION } from './sections';
import type {
	GPPApi,
	GPPCallback,
	GPPDisplayStatus,
	GPPEventData,
	GPPParsedSubsection,
	GPPPingData,
	GPPQueuedListener,
	GPPSignalStatus,
} from './types';

export interface GPPSectionState {
	id: number;
	prefix: string;
	encoded: string;
	parsed: GPPParsedSubsection[] | null;
}

export interface GPPState {
	cmpId: number;
	cmpDisplayStatus: GPPDisplayStatus;
	signalStatus: GPPSignalStatus;
	applicableSections: number[];
	sections: GPPSectionState[];
}

export interface GPPCmpApi {
	publish: (next: GPPState) => void;
	getPingData: () => GPPPingData;
	destroy: () => void;
	isInstalled: () => boolean;
}

export interface GPPCmpApiConfig {
	supportedAPIs: string[];
	initial: GPPState;
}

const sameNumbers = (left: number[], right: number[]): boolean =>
	left.length === right.length &&
	left.every((value, index) => value === right[index]);

const changedPrefixes = function changedPrefixes(
	previous: GPPSectionState[],
	next: GPPSectionState[]
): string[] {
	const before = new Map(previous.map((section) => [section.prefix, section]));
	const after = new Map(next.map((section) => [section.prefix, section]));
	const prefixes = new Set([...before.keys(), ...after.keys()]);
	return [...prefixes].filter((prefix) => {
		const left = before.get(prefix);
		const right = after.get(prefix);
		return (
			left?.encoded !== right?.encoded ||
			(left?.parsed === null) !== (right?.parsed === null)
		);
	});
};

const EVENT_ONLY_PREFIXES = new Set(['tcfeuv2']);

const ownApis = new WeakSet<GPPApi>();

type StubWithProperties = GPPApi & { queue?: unknown; events?: unknown };

const STUB_COMMANDS = new Set([undefined, 'events', 'queue']);

const readStub = function readStub(stub: StubWithProperties | undefined): {
	queue: unknown[][];
	events: GPPQueuedListener[];
} {
	const call = (...args: [] | [string]): unknown => {
		try {
			return stub?.(...args);
		} catch {
			return undefined;
		}
	};
	let events: unknown = stub?.events;
	if (!Array.isArray(events)) {
		events = call('events');
	}
	let queue: unknown = call();
	if (!Array.isArray(queue)) {
		queue = stub?.queue;
	}
	return {
		events: Array.isArray(events) ? (events as GPPQueuedListener[]) : [],
		queue: Array.isArray(queue)
			? (queue as unknown[][]).filter(
					(args) => Array.isArray(args) && !STUB_COMMANDS.has(args[0] as string)
				)
			: [],
	};
};

const isLoadedForeignCmp = function isLoadedForeignCmp(
	existing: GPPApi | undefined
): boolean {
	if (!existing || ownApis.has(existing)) {
		return false;
	}
	const statusOf = (data: unknown): unknown =>
		data && typeof data === 'object'
			? (data as { cmpStatus?: unknown }).cmpStatus
			: undefined;
	let status: unknown;
	try {
		const returned = existing('ping', (data) => {
			status = statusOf(data);
		});
		status ??= statusOf(returned);
	} catch {
		return false;
	}
	return status !== undefined && status !== 'stub';
};

export const createGPPCmpApi = function createGPPCmpApi(
	config: GPPCmpApiConfig
): GPPCmpApi {
	if (typeof window !== 'undefined' && isLoadedForeignCmp(window.__gpp)) {
		throw new Error(
			'@c15t/iab/gpp: another CMP already provides window.__gpp. Remove it, or do not mount createGPP() on this page.'
		);
	}
	let state = config.initial;
	let gppString = encodeGPPString(state.sections);
	const listeners = new Map<number, GPPCallback<GPPEventData>>();
	let lastListenerId = 0;

	const getPingData = (): GPPPingData => ({
		applicableSections: [...state.applicableSections],
		cmpDisplayStatus: state.cmpDisplayStatus,
		cmpId: state.cmpId,
		cmpStatus: 'loaded',
		gppString,
		gppVersion: GPP_VERSION,
		parsedSections: Object.fromEntries(
			state.sections
				.filter((section) => section.parsed !== null)
				.map((section) => [section.prefix, structuredClone(section.parsed)])
		) as GPPPingData['parsedSections'],
		sectionList: state.sections.map((section) => section.id),
		signalStatus: state.signalStatus,
		supportedAPIs: [...config.supportedAPIs],
	});

	const fire = (eventName: string, data: unknown): void => {
		for (const [listenerId, listener] of [...listeners]) {
			try {
				listener(
					{ data, eventName, listenerId, pingData: getPingData() },
					true
				);
			} catch {
			}
		}
	};

	const findSection = (prefix: unknown) =>
		state.sections.find((section) => section.prefix === prefix);
	const readableSection = (prefix: unknown) =>
		EVENT_ONLY_PREFIXES.has(prefix as string)
			? undefined
			: findSection(prefix)?.parsed;

	const getField = (parameter: unknown): unknown => {
		if (typeof parameter !== 'string') {
			return null;
		}
		const separator = parameter.indexOf('.');
		if (separator <= 0) {
			return null;
		}
		const parsed = readableSection(parameter.slice(0, separator));
		const name = parameter.slice(separator + 1);
		const subsection = parsed?.find((entry) => Object.hasOwn(entry, name));
		return subsection ? structuredClone(subsection[name]) : null;
	};

	const api: GPPApi = (command, handler, parameter) => {
		if (typeof handler !== 'function') {
			return undefined;
		}
		switch (command) {
			case 'ping':
				handler(getPingData(), true);
				break;
			case 'addEventListener': {
				lastListenerId += 1;
				const listenerId = lastListenerId;
				listeners.set(listenerId, handler as GPPCallback<GPPEventData>);
				handler(
					{
						data: true,
						eventName: 'listenerRegistered',
						listenerId,
						pingData: getPingData(),
					} satisfies GPPEventData,
					true
				);
				break;
			}
			case 'removeEventListener':
				handler(listeners.delete(Number(parameter)), true);
				break;
			case 'hasSection':
				handler(Boolean(findSection(parameter)), true);
				break;
			case 'getSection': {
				const parsed = readableSection(parameter);
				handler(parsed ? structuredClone(parsed) : null, true);
				break;
			}
			case 'getField':
				handler(getField(parameter), true);
				break;
			default:
				handler(null, false);
		}
		return undefined;
	};

	if (typeof window !== 'undefined') {
		const { queue, events } = readStub(window.__gpp);
		for (const event of events) {
			if (typeof event?.callback === 'function' && Number.isInteger(event.id)) {
				listeners.set(event.id, event.callback);
				lastListenerId = Math.max(lastListenerId, event.id);
			}
		}
		ownApis.add(api);
		window.__gpp = api;
		for (const args of queue) {
			try {
				api(...(args as Parameters<GPPApi>));
			} catch {
			}
		}
		if (events.length > 0) {
			fire('cmpStatus', 'loaded');
		}
	}

	let publishing = false;
	let pending: GPPState | null = null;
	const publishOnce = (next: GPPState): void => {
		const sections = changedPrefixes(state.sections, next.sections);
		const applicableChanged = !sameNumbers(
			state.applicableSections,
			next.applicableSections
		);
		const displayChanged = state.cmpDisplayStatus !== next.cmpDisplayStatus;
		if (
			sections.length === 0 &&
			!applicableChanged &&
			!displayChanged &&
			state.cmpId === next.cmpId &&
			state.signalStatus === next.signalStatus
		) {
			return;
		}
		if (state.signalStatus === 'ready') {
			state = { ...state, signalStatus: 'not ready' };
			fire('signalStatus', 'not ready');
		}
		if (displayChanged) {
			state = { ...state, cmpDisplayStatus: next.cmpDisplayStatus };
			fire('cmpDisplayStatus', next.cmpDisplayStatus);
		}
		state = { ...next, signalStatus: 'not ready' };
		gppString = encodeGPPString(state.sections);
		for (const prefix of sections) {
			fire('sectionChange', prefix);
		}
		if (next.signalStatus === 'ready' && !pending) {
			state = { ...state, signalStatus: 'ready' };
			fire('signalStatus', 'ready');
		}
	};

	return {
		destroy: () => {
			listeners.clear();
			if (typeof window !== 'undefined' && window.__gpp === api) {
				delete window.__gpp;
			}
		},
		getPingData,
		isInstalled: () => typeof window !== 'undefined' && window.__gpp === api,
		publish: (next) => {
			pending = next;
			if (publishing) {
				return;
			}
			publishing = true;
			try {
				while (pending) {
					const target = pending;
					pending = null;
					publishOnce(target);
				}
			} finally {
				publishing = false;
			}
		},
	};
};
