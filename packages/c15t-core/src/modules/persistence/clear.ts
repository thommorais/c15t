import type { CookieOptions } from '../../libs/cookie';
import { deleteCookie, writeCookie } from '../../libs/cookie';
import { EPOCH_CLOCK_TOLERANCE_MS } from './record-codec';
import {
	readStoredClearEpoch,
	readStoredCookieSubjectId,
	resolveStorageKeys,
} from './record-storage';
import type { StorageConfig } from './types';

const removeLocalStorageKey = function removeLocalStorageKey(
	key: string
): void {
	try {
		window.localStorage?.removeItem(key);
	} catch {
	}
};

export const clearStoredConsentRecords = function clearStoredConsentRecords(
	cookie?: CookieOptions,
	config?: StorageConfig
): void {
	if (typeof document === 'undefined') {
		return;
	}
	const keys = resolveStorageKeys(config);
	const both = [
		keys.consent,
		keys.legacyConsent,
		keys.notice,
		keys.noticeSubject,
		`${keys.consent}-privacy`,
		keys.vendors,
	];
	for (const key of [...both, keys.cookieMiss, keys.noticeCookieMiss]) {
		if (key) {
			removeLocalStorageKey(key);
		}
	}
	for (const key of both) {
		if (key) {
			deleteCookie(key, cookie, config);
		}
	}
	removeLocalStorageKey('c15t-iab-authority-v1');
	removeLocalStorageKey('euconsent-v2');
	deleteCookie('euconsent-v2', cookie, config);
	deleteCookie('euconsent-v2');
};

export const encodeClearEpoch = function encodeClearEpoch(
	epoch: number
): string {
	return String(epoch);
};

export const writeStoredClearEpoch = function writeStoredClearEpoch(
	epoch: number,
	config: StorageConfig | undefined,
	cookie?: CookieOptions
): void {
	const key = resolveStorageKeys(config).epoch;
	const text = encodeClearEpoch(epoch);
	try {
		window.localStorage?.setItem(key, text);
	} catch {
	}
	writeCookie(key, text, cookie, config);
};

export const writeStoredSubjectId = function writeStoredSubjectId(
	subjectId: string,
	config: StorageConfig | undefined,
	cookie?: CookieOptions
): void {
	if (typeof document === 'undefined') {
		return;
	}
	const key = resolveStorageKeys(config).subject;
	let storedLocally = false;
	try {
		const storage = window.localStorage;
		if (storage) {
			storage.setItem(key, subjectId);
			storedLocally = true;
		}
	} catch {
	}
	try {
		writeCookie(key, encodeURIComponent(subjectId), cookie, config);
	} catch {
	}
	if (storedLocally && readStoredCookieSubjectId(config) !== subjectId) {
		deleteCookie(key, cookie, config);
	}
};

export const clearStoredRecords = function clearStoredRecords(
	config: StorageConfig | undefined,
	at: number,
	knownEpoch: number
): void {
	if (typeof document === 'undefined') {
		return;
	}
	clearStoredConsentRecords(undefined, config);
	const previous = Math.max(knownEpoch, readStoredClearEpoch(config, at));
	writeStoredClearEpoch(
		Math.max(at, Math.min(previous + 1, at + EPOCH_CLOCK_TOLERANCE_MS)),
		config
	);
};
