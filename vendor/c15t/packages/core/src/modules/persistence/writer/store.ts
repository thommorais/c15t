import type { CookieOptions, CookieWriteReport } from '../../../libs/cookie';
import type {
	DecodeResult,
	StorageIssue,
	StoredConsentEnvelope,
	StoredNoticeDismissal,
	StoredVendorChoice,
} from '../record-codec';
import type { StorageConfig } from '../types';
import {
	encodeNoticeDismissal,
	encodeNoticeDismissalCompact,
	encodeNoticeSubjectCompact,
	encodeStoredConsentEnvelopeCompact,
	encodeStoredConsentEnvelopeJson,
	encodeVendorChoice,
	encodeVendorChoiceCompact,
} from './encode';
import type { PersistenceTools } from './types';

export interface WriteStoredConsentOptions {
	now: number;
	cookie?: CookieOptions;
	config?: StorageConfig;
}

export interface WriteReport {
	localStorage: boolean;
	cookie: boolean;
	cookieDetail: CookieWriteReport;
}

export type WriteStoredConsentResult =
	| { ok: true; written: WriteReport; envelope: StoredConsentEnvelope }
	| { ok: false; issues: StorageIssue[] };

export type AuxiliaryWriteReport = WriteReport;

export interface RecordStore {
	writeStoredConsentEnvelope: (
		envelope: StoredConsentEnvelope,
		options: WriteStoredConsentOptions
	) => WriteStoredConsentResult;
	writeStoredNoticeDismissal: (
		record: StoredNoticeDismissal,
		config: StorageConfig | undefined,
		now: number,
		cookie?: CookieOptions
	) => DecodeResult<StoredNoticeDismissal> & {
		written?: AuxiliaryWriteReport;
	};
	writeStoredVendorChoice: (
		record: StoredVendorChoice,
		config: StorageConfig | undefined,
		now: number,
		cookie?: CookieOptions
	) => DecodeResult<StoredVendorChoice> & { written?: AuxiliaryWriteReport };
	clearStoredVendorChoice: (
		config?: StorageConfig,
		cookie?: CookieOptions
	) => void;
}

const hasLocalStorage = function hasLocalStorage(): boolean {
	return typeof window !== 'undefined' && Boolean(window.localStorage);
};

const writeLocalStorageText = function writeLocalStorageText(
	key: string,
	text: string
): boolean {
	try {
		if (hasLocalStorage()) {
			window.localStorage.setItem(key, text);
			return true;
		}
	} catch (error) {
		console.warn('Failed to save consent to localStorage:', error);
	}
	return false;
};

const removeLocalStorageKey = function removeLocalStorageKey(
	key: string
): void {
	try {
		if (hasLocalStorage()) {
			window.localStorage.removeItem(key);
		}
	} catch (error) {
		console.warn('Failed to remove consent from localStorage:', error);
	}
};

const cookieText = function cookieText(encode: () => string): string | null {
	try {
		return encode();
	} catch (error) {
		if (error instanceof URIError) {
			return null;
		}
		throw error;
	}
};

const NO_COOKIE_TEXT: CookieWriteReport = { attempted: false, verified: false };

export const createRecordStore = function createRecordStore(
	tools: PersistenceTools
): RecordStore {
	const writeCookieText = function writeCookieText(
		key: string,
		text: string | null,
		config: StorageConfig | undefined,
		cookie?: CookieOptions
	): CookieWriteReport {
		return text === null
			? NO_COOKIE_TEXT
			: tools.writeCookie(key, text, cookie, config);
	};

	const writeBoth = function writeBoth(
		key: string,
		local: string,
		compact: string | null,
		config: StorageConfig | undefined,
		cookie?: CookieOptions
	): AuxiliaryWriteReport {
		const localStorageWritten = writeLocalStorageText(key, local);
		const cookieDetail = writeCookieText(key, compact, config, cookie);
		return {
			cookie: cookieDetail.attempted && cookieDetail.verified,
			cookieDetail,
			localStorage: localStorageWritten,
		};
	};

	const removeBoth = function removeBoth(
		key: string,
		config: StorageConfig | undefined,
		cookie?: CookieOptions
	): void {
		removeLocalStorageKey(key);
		tools.deleteCookie(key, cookie, config);
	};

	const clearStoredVendorChoice: RecordStore['clearStoredVendorChoice'] = (
		config,
		cookie
	) => {
		removeBoth(tools.keys(config).vendors, config, cookie);
	};

	return {
		clearStoredVendorChoice,
		writeStoredConsentEnvelope(envelope, options) {
			const validated = tools.validateEnvelope(envelope, options.now);
			if (validated.ok === false) {
				return validated;
			}
			const keys = tools.keys(options.config);
			const localStorageWritten = writeLocalStorageText(
				keys.consent,
				encodeStoredConsentEnvelopeJson(validated.record)
			);
			const cookieDetail = writeCookieText(
				keys.consent,
				cookieText(() => encodeStoredConsentEnvelopeCompact(validated.record)),
				options.config,
				options.cookie
			);
			if (!cookieDetail.attempted && cookieDetail.error !== undefined) {
				console.warn('Failed to save consent to cookie:', cookieDetail.error);
			}
			const cookieWritten = cookieDetail.attempted && cookieDetail.verified;
			if (cookieWritten) {
				removeLocalStorageKey(keys.cookieMiss);
				if (!localStorageWritten) {
					removeLocalStorageKey(keys.consent);
				}
			} else if (localStorageWritten) {
				writeLocalStorageText(
					keys.cookieMiss,
					tools.rawCookie(keys.consent) ?? ''
				);
			}

			return {
				envelope: validated.record,
				ok: true,
				written: {
					cookie: cookieWritten,
					cookieDetail,
					localStorage: localStorageWritten,
				},
			};
		},
		writeStoredNoticeDismissal(record, config, now, cookie) {
			const validated = tools.decodeNotice(record, now);
			if (validated.ok === false) {
				return validated;
			}
			const keys = tools.keys(config);
			const key = keys.notice;
			const written = writeBoth(
				key,
				encodeNoticeDismissal(validated.record),
				cookieText(() => encodeNoticeDismissalCompact(validated.record)),
				config,
				cookie
			);
			let subjectWritten = true;
			if (validated.record.subject) {
				const subjectDetail = writeCookieText(
					keys.noticeSubject,
					cookieText(() => encodeNoticeSubjectCompact(validated.record)),
					config,
					cookie
				);
				subjectWritten = subjectDetail.attempted && subjectDetail.verified;
			} else {
				tools.deleteCookie(keys.noticeSubject, cookie, config);
				subjectWritten = tools.rawCookie(keys.noticeSubject) === null;
			}
			if (written.cookie && subjectWritten) {
				removeLocalStorageKey(keys.noticeCookieMiss);
				if (!written.localStorage) {
					removeLocalStorageKey(key);
				}
			} else if (written.localStorage) {
				writeLocalStorageText(
					keys.noticeCookieMiss,
					JSON.stringify([
						tools.rawCookie(key) ?? '',
						tools.rawCookie(keys.noticeSubject) ?? '',
					])
				);
			}
			return { ...validated, written };
		},
		writeStoredVendorChoice(record, config, now, cookie) {
			const validated = tools.decodeVendors(record, now);
			if (validated.ok === false) {
				return validated;
			}
			return {
				...validated,
				written: writeBoth(
					tools.keys(config).vendors,
					encodeVendorChoice(validated.record),
					cookieText(() => encodeVendorChoiceCompact(validated.record)),
					config,
					cookie
				),
			};
		},
	};
};
