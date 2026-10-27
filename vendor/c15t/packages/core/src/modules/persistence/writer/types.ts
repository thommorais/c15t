import type { InternalKernel } from '../../../kernel/internals';
import type { mergeNewestChoice } from '../../../kernel/record-validation';
import type { deleteCookie, writeCookie } from '../../../libs/cookie';
import type { clearStoredRecords } from '../clear';
import type {
	choiceSinceEpoch,
	noticeSinceEpoch,
	vendorChoiceSinceEpoch,
} from '../epoch';
import type { StoredRecords } from '../hydrate';
import type {
	decodeNoticeDismissal,
	decodeVendorChoice,
	validateStoredConsentEnvelope,
} from '../record-codec';
import type { ResolvedStorageKeys } from '../record-storage';
import type { StorageConfig } from '../types';

export interface PersistenceTools {
	read: (config: StorageConfig | undefined, now: number) => StoredRecords;
	keys: (config?: StorageConfig) => ResolvedStorageKeys;
	rawCookie: (name: string) => string | null;
	writeCookie: typeof writeCookie;
	deleteCookie: typeof deleteCookie;
	validateEnvelope: typeof validateStoredConsentEnvelope;
	decodeNotice: typeof decodeNoticeDismissal;
	decodeVendors: typeof decodeVendorChoice;
	choiceSince: typeof choiceSinceEpoch;
	noticeSince: typeof noticeSinceEpoch;
	vendorsSince: typeof vendorChoiceSinceEpoch;
	merge: typeof mergeNewestChoice;
	clear: typeof clearStoredRecords;
}

export type WriteKind = 'choice' | 'notice' | 'vendors';

export interface PersistenceState {
	choiceRecorded: boolean;
	noticeRecorded?: boolean;
	vendorsRecorded: boolean;
	subjectBeforeSave?: string;
	freshSubjectId?: string;
	freshSubjectAt?: number;
}

export interface PersistenceContext {
	kernel: InternalKernel;
	storageConfig: StorageConfig | undefined;
	now: () => number;
	state: PersistenceState;
}

export interface PersistenceWriter {
	adopt: (read: StoredRecords, iab: boolean) => void;
	schedule: (kind: WriteKind) => void;
	flush: () => void;
	clearStorage: (at: number) => void;
	reconcile: () => boolean;
	scheduleReconcile: () => void;
	dispose: () => void;
}
