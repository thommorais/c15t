import type { StorageConfig } from './cookie';

export const STORAGE_KEY_V2 = 'c15t';

export const STORAGE_KEY = 'privacy-consent-storage';

export const PENDING_SAVES_STORAGE_KEY = 'c15t-v3-pending-consent-saves:v1';

export const SUBJECT_REASSIGNMENTS_STORAGE_KEY =
	'c15t-v3-subject-reassignments:v1';

export const EXPERIMENT_STORAGE_KEY = 'c15t-experiment-v1';

export const JOURNEY_STORAGE_KEY = 'c15t-journey-v1';

export interface ResolvedStorageKeys {
	consent: string;
	legacyConsent: string | null;
	notice: string;
	noticeSubject: string;
	noticeCookieMiss: string;
	vendors: string;
	epoch: string;
	cookieMiss: string;
	subject: string;
}

export const resolveStorageKeys = function resolveStorageKeys(
	config?: StorageConfig
): ResolvedStorageKeys {
	const consent = config?.storageKey || STORAGE_KEY_V2;
	return {
		consent,
		cookieMiss: `${consent}-cookie-miss`,
		epoch: `${consent}-epoch`,
		legacyConsent: consent === STORAGE_KEY ? null : STORAGE_KEY,
		notice: `${consent}-notice`,
		noticeCookieMiss: `${consent}-notice-cookie-miss`,
		noticeSubject: `${consent}-notice-subject`,
		subject: `${consent}-sid`,
		vendors: `${consent}-vendors`,
	};
};
