import { STORAGE_KEY_V2 } from '../../libs/storage-keys';
import type { StoredRecords as StoredRead } from './hydrate';
import { mountPersistence } from './mount';
import type { PersistenceHandle, PersistenceOptions } from './types';

export type {
	PersistenceHandle,
	PersistenceOptions,
	StorageConfig,
} from './types';
export {
	readStoredRecords,
	readStoredRecordsFromCookieHeader,
} from './hydrate';

export interface StoredRecords extends Omit<
	StoredRead,
	'recordedSubjectId' | 'subjectCarrier'
> {
	recordedSubjectId?: StoredRead['recordedSubjectId'];
	subjectCarrier?: StoredRead['subjectCarrier'];
}
export type {
	StoredIabMetadata,
	StoredConsentEnvelope,
	StoredVendorChoice,
} from './record-codec';
export { resolveStorageKeys } from './record-storage';

export const CONSENT_STORAGE_KEY = STORAGE_KEY_V2;

export const createPersistence: (
	options: PersistenceOptions
) => PersistenceHandle = mountPersistence;
