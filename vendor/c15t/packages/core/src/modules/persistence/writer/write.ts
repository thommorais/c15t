import type { ConsentSnapshot } from '../../../types';
import type {
	StoredConsentEnvelope,
	StoredIabMetadata,
	StoredNoticeDismissal,
	StoredVendorChoice,
} from '../record-codec';
import type { StorageConfig } from '../types';
import type { RecordStore } from './store';

export const buildStoredEnvelope = function buildStoredEnvelope(
	snapshot: ConsentSnapshot,
	iab: StoredIabMetadata | null,
	epoch = 0
): StoredConsentEnvelope | null {
	if (!snapshot.explicitChoice) {
		return null;
	}
	const envelope: StoredConsentEnvelope = {
		categories: snapshot.explicitChoice.categories,
		version: 3,
	};
	if (snapshot.subject && Object.keys(snapshot.subject).length > 0) {
		envelope.subject = { ...snapshot.subject };
	}
	if (epoch > 0) {
		envelope.epoch = epoch;
	}
	if (iab) {
		envelope.iab = iab;
	}
	return envelope;
};

export const writeChoiceToStorage = function writeChoiceToStorage(
	store: RecordStore,
	snapshot: ConsentSnapshot,
	iab: StoredIabMetadata | null,
	storageConfig: StorageConfig | undefined,
	now: number,
	epoch = 0
): void {
	if (typeof document === 'undefined') {
		return;
	}
	const envelope = buildStoredEnvelope(snapshot, iab, epoch);
	if (!envelope) {
		return;
	}
	const result = store.writeStoredConsentEnvelope(envelope, {
		config: storageConfig,
		now,
	});
	if (result.ok === false) {
		console.warn('[c15t] Consent record was not written.', result.issues);
	}
};

export const writeNoticeToStorage = function writeNoticeToStorage(
	store: RecordStore,
	snapshot: ConsentSnapshot,
	storageConfig: StorageConfig | undefined,
	now: number
): void {
	if (typeof document === 'undefined' || !snapshot.noticeDismissal) {
		return;
	}
	const record: StoredNoticeDismissal = { ...snapshot.noticeDismissal };
	if (snapshot.subject) {
		record.subject = { ...snapshot.subject };
	}
	store.writeStoredNoticeDismissal(record, storageConfig, now);
};

export const writeVendorChoiceToStorage = function writeVendorChoiceToStorage(
	store: RecordStore,
	snapshot: ConsentSnapshot,
	storageConfig: StorageConfig | undefined,
	now: number
): void {
	if (typeof document === 'undefined') {
		return;
	}
	if (!snapshot.vendorChoice) {
		store.clearStoredVendorChoice(storageConfig);
		return;
	}
	const record: StoredVendorChoice = { ...snapshot.vendorChoice };
	if (snapshot.subject && Object.keys(snapshot.subject).length > 0) {
		record.subject = { ...snapshot.subject };
	}
	const result = store.writeStoredVendorChoice(record, storageConfig, now);
	if (result.ok === false) {
		console.warn('[c15t] Vendor choice was not written.', result.issues);
		return;
	}
	if (result.written && !result.written.cookie) {
		console.warn(
			'[c15t] Vendor choice cookie was not stored; the localStorage copy is current but a server render will not see it. Shorten vendor ids or deny fewer vendors.',
			result.written.cookieDetail
		);
	}
};
