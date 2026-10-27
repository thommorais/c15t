import { deleteCookie, getRawCookieValue, setCookie } from './cookie';
import type { StorageConfig } from './cookie';
import { EXPERIMENT_STORAGE_KEY } from './storage-keys';

export interface StoredExperimentArm {
	id: string;
	arm: string;
}

const parseStored = function parseStored(
	raw: string | null | undefined
): StoredExperimentArm | null {
	if (!raw) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) {
			return null;
		}
		const record = parsed as Record<string, unknown>;
		return typeof record.id === 'string' && typeof record.arm === 'string'
			? { arm: record.arm, id: record.id }
			: null;
	} catch {
		return null;
	}
};

const localStorageAvailable = function localStorageAvailable(): boolean {
	try {
		return typeof localStorage !== 'undefined' && localStorage !== null;
	} catch {
		return false;
	}
};

export const readStoredExperimentArm =
	function readStoredExperimentArm(): StoredExperimentArm | null {
		if (localStorageAvailable()) {
			try {
				const stored = parseStored(
					localStorage.getItem(EXPERIMENT_STORAGE_KEY)
				);
				if (stored) {
					return stored;
				}
			} catch {
			}
		}
		const raw = getRawCookieValue(EXPERIMENT_STORAGE_KEY);
		if (!raw) {
			return null;
		}
		try {
			return parseStored(decodeURIComponent(raw));
		} catch {
			return null;
		}
	};

export const EXPERIMENT_WINDOW_KEY = '__c15tExperiment';

export const readEarlyExperimentArm =
	function readEarlyExperimentArm(): StoredExperimentArm | null {
		if (typeof window === 'undefined') {
			return null;
		}
		const value = (window as unknown as Record<string, unknown>)[
			EXPERIMENT_WINDOW_KEY
		] as Partial<StoredExperimentArm> | null | undefined;
		return typeof value?.id === 'string' && typeof value.arm === 'string'
			? { arm: value.arm, id: value.id }
			: null;
	};

export const writeEarlyExperimentArm = function writeEarlyExperimentArm(
	record: StoredExperimentArm
): void {
	if (typeof window !== 'undefined') {
		(window as unknown as Record<string, unknown>)[EXPERIMENT_WINDOW_KEY] = {
			arm: record.arm,
			id: record.id,
		};
	}
};

export const writeStoredExperimentArm = function writeStoredExperimentArm(
	record: StoredExperimentArm,
	storageConfig?: StorageConfig
): void {
	const serialized = JSON.stringify({ arm: record.arm, id: record.id });
	if (localStorageAvailable()) {
		try {
			localStorage.setItem(EXPERIMENT_STORAGE_KEY, serialized);
			if (getRawCookieValue(EXPERIMENT_STORAGE_KEY)) {
				deleteCookie(EXPERIMENT_STORAGE_KEY, undefined, storageConfig);
			}
			return;
		} catch {
		}
	}
	setCookie(
		EXPERIMENT_STORAGE_KEY,
		encodeURIComponent(serialized),
		undefined,
		storageConfig
	);
};
