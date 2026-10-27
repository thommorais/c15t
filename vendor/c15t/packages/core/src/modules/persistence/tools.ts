import { mergeNewestChoice } from '../../kernel/record-validation';
import {
	deleteCookie,
	getRawCookieValue,
	writeCookie,
} from '../../libs/cookie';
import { clearStoredRecords } from './clear';
import {
	choiceSinceEpoch,
	noticeSinceEpoch,
	vendorChoiceSinceEpoch,
} from './epoch';
import { readStoredRecordsForReconcile } from './hydrate';
import {
	decodeNoticeDismissal,
	decodeVendorChoice,
	validateStoredConsentEnvelope,
} from './record-codec';
import { resolveStorageKeys } from './record-storage';
import type { PersistenceTools } from './writer/types';

export const persistenceTools: PersistenceTools = {
	choiceSince: choiceSinceEpoch,
	clear: clearStoredRecords,
	decodeNotice: decodeNoticeDismissal,
	decodeVendors: decodeVendorChoice,
	deleteCookie,
	keys: resolveStorageKeys,
	merge: mergeNewestChoice,
	noticeSince: noticeSinceEpoch,
	rawCookie: getRawCookieValue,
	read: readStoredRecordsForReconcile,
	validateEnvelope: validateStoredConsentEnvelope,
	vendorsSince: vendorChoiceSinceEpoch,
	writeCookie,
};
