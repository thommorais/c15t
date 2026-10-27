export { getDefaultCookieOptions, getRootDomain } from './domain-utils';
export {
	COOKIE_KEY_MAP,
	expandFlatKeys,
	REVERSE_COOKIE_KEY_MAP,
	shortenFlatKeys,
} from './key-mapping';
export {
	deleteCookie,
	getCookie,
	getRawCookieValue,
	parseCookieValue,
	readCookieValueFromHeader,
	setCookie,
	writeCookie,
} from './operations';
export type { CookieWriteReport } from './operations';

export {
	flatToString,
	flattenObject,
	stringToFlat,
	unflattenObject,
} from './serialization';
export { deleteConsentFromStorage } from './storage';
export type { CookieOptions, StorageConfig } from './types';
