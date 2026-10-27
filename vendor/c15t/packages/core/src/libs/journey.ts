import { parseJourneyId, parseJourneyScope } from '@c15t/schema/types';
import type { ConsentJourneyScope } from '@c15t/schema/types';

import type { KernelJourney } from '../types';
import {
	JOURNEY_STORAGE_KEY,
	STORAGE_KEY,
	STORAGE_KEY_V2,
} from './storage-keys';

export type ConsentJourneyOption = ConsentJourneyScope | false;

export interface JourneyState {
	journey?: { id: string } | null;
}

const toHex = (byte: number): string => byte.toString(16).padStart(2, '0');

export const createJourneyId = function createJourneyId(): string | undefined {
	const webCrypto = globalThis.crypto;
	if (typeof webCrypto?.randomUUID === 'function') {
		return webCrypto.randomUUID();
	}
	if (typeof webCrypto?.getRandomValues !== 'function') {
		return undefined;
	}
	const bytes = webCrypto.getRandomValues(new Uint8Array(16));
	bytes[6] = ((bytes[6] ?? 0) % 16) + 0x40;
	bytes[8] = ((bytes[8] ?? 0) % 64) + 0x80;
	const hex = Array.from(bytes, toHex).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export type JourneyStorage = Pick<
	Storage,
	'getItem' | 'removeItem' | 'setItem'
>;

export const sessionStorageOf = (): JourneyStorage | null =>
	typeof window === 'undefined' ? null : window.sessionStorage;

export interface OpenedJourney {
	journey: KernelJourney;
	continued: boolean;
}

export const openJourney = function openJourney(options: {
	option: ConsentJourneyOption | undefined;
	storedChoice: boolean;
	storage?: () => JourneyStorage | null;
	adopted?: string | null;
}): OpenedJourney | undefined {
	if (options.option === false) {
		return undefined;
	}
	let scope: ConsentJourneyScope = options.option ?? 'page';
	let previous: string | null = null;
	if (scope === 'tab') {
		try {
			const store = (options.storage ?? sessionStorageOf)();
			if (store) {
				previous = parseJourneyId(store.getItem(JOURNEY_STORAGE_KEY));
			} else {
				scope = 'page';
			}
		} catch {
			scope = 'page';
		}
	}
	const id = previous ?? parseJourneyId(options.adopted) ?? createJourneyId();
	if (!id) {
		return undefined;
	}
	return {
		continued: previous !== null,
		journey: Object.freeze({ id, scope, storedChoice: options.storedChoice }),
	};
};

export const detectJourneyOption = function detectJourneyOption(
	storage: () => JourneyStorage | null = sessionStorageOf
): ConsentJourneyScope {
	try {
		return parseJourneyId(storage()?.getItem(JOURNEY_STORAGE_KEY))
			? 'tab'
			: 'page';
	} catch {
		return 'page';
	}
};

export const JOURNEY_WINDOW_KEY = '__c15tJourney';

type JourneyWindow = Window & { [JOURNEY_WINDOW_KEY]?: unknown };

export const readEarlyJourney = function readEarlyJourney():
	| KernelJourney
	| undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	const value = (window as JourneyWindow)[JOURNEY_WINDOW_KEY] as
		| Partial<KernelJourney>
		| null
		| undefined;
	const id = parseJourneyId(value?.id);
	const scope = parseJourneyScope(value?.scope);
	return id && scope && typeof value?.storedChoice === 'boolean'
		? { id, scope, storedChoice: value.storedChoice }
		: undefined;
};

export const claimEarlyJourney = function claimEarlyJourney(options: {
	option: ConsentJourneyOption | undefined;
	storedChoice: boolean;
	storage?: () => JourneyStorage | null;
}): KernelJourney | undefined {
	if (options.option === false || typeof window === 'undefined') {
		return undefined;
	}
	const existing = readEarlyJourney();
	if (existing) {
		return existing;
	}
	const opened = openJourney(options);
	if (opened) {
		(window as JourneyWindow)[JOURNEY_WINDOW_KEY] = opened.journey;
	}
	return opened?.journey;
};

export const storedAnswerKeys = function storedAnswerKeys(storageKey: string): {
	cookies: string[];
	local: string[];
	notice: string;
} {
	return {
		cookies: [storageKey],
		local: [storageKey, ...(storageKey === STORAGE_KEY ? [] : [STORAGE_KEY])],
		notice: `${storageKey}-notice`,
	};
};

export const hasStoredConsentRecord = function hasStoredConsentRecord(
	storageKey: string = STORAGE_KEY_V2,
	notice = true
): boolean {
	if (typeof document === 'undefined') {
		return false;
	}
	const keys = storedAnswerKeys(storageKey);
	const cookies = notice ? [...keys.cookies, keys.notice] : keys.cookies;
	const local = notice ? [...keys.local, keys.notice] : keys.local;
	try {
		if (
			document.cookie
				.split('; ')
				.some((pair) =>
					cookies.some(
						(name) =>
							pair.startsWith(`${name}=`) && pair.length > name.length + 1
					)
				)
		) {
			return true;
		}
	} catch {
	}
	try {
		return local.some((key) => window.localStorage.getItem(key) !== null);
	} catch {
		return false;
	}
};

export const createUnreportedJourneys = function createUnreportedJourneys() {
	const ids = new Set<string>();
	return {
		reported(journey: Pick<KernelJourney, 'id'> | undefined): void {
			if (journey) {
				ids.delete(journey.id);
			}
		},
		resolvedLocally(journey: Pick<KernelJourney, 'id'> | undefined): void {
			if (journey) {
				ids.add(journey.id);
			}
		},
		strip<Payload extends { journey?: Pick<KernelJourney, 'id'> }>(
			payload: Payload
		): Payload {
			if (!(payload.journey && ids.has(payload.journey.id))) {
				return payload;
			}
			const { journey: _unreported, ...rest } = payload;
			return rest as Payload;
		},
	};
};
