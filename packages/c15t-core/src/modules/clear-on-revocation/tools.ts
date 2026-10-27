import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import {
	EXPERIMENT_STORAGE_KEY,
	PENDING_SAVES_STORAGE_KEY,
	resolveStorageKeys,
	STORAGE_KEY,
	STORAGE_KEY_V2,
	SUBJECT_REASSIGNMENTS_STORAGE_KEY,
} from '../../libs/storage-keys';
import { getEffectiveGateState } from '../has';
import type { ClearOnRevocationTools } from './types';

export const clearOnRevocationTools: ClearOnRevocationTools = {
	gateState: getEffectiveGateState,
	optionalConsentCategories: OPTIONAL_CONSENT_CATEGORIES,
	protectedStorageKeys: [
		STORAGE_KEY,
		PENDING_SAVES_STORAGE_KEY,
		SUBJECT_REASSIGNMENTS_STORAGE_KEY,
		EXPERIMENT_STORAGE_KEY,
	],
	resolveStorageKeys,
	storageKey: STORAGE_KEY_V2,
};
