import type { OptionalConsentCategory } from '../../consent-record/types';
import type { StorageConfig } from '../../libs/cookie/types';
import type { resolveStorageKeys } from '../../libs/storage-keys';
import type { ConsentKernel } from '../../types';
import type { getEffectiveGateState } from '../has';

export interface ClearOnRevocationCookie {
	name: string;
	domain?: string;
	path?: string;
	partitioned?: boolean;
}

export interface ClearOnRevocationTargets {
	cookies?: readonly (string | ClearOnRevocationCookie)[];
	localStorage?: readonly string[];
	sessionStorage?: readonly string[];
}

export type ClearOnRevocationConfig = Partial<
	Record<OptionalConsentCategory, ClearOnRevocationTargets>
>;

export interface ClearOnRevocationOptions {
	kernel: ConsentKernel;
	config: ClearOnRevocationConfig;
	storageConfig?: StorageConfig;
}

export interface ClearOnRevocationHandle {
	dispose: () => void;
}

export interface ClearOnRevocationTools {
	gateState: typeof getEffectiveGateState;
	resolveStorageKeys: typeof resolveStorageKeys;
	optionalConsentCategories: readonly OptionalConsentCategory[];
	protectedStorageKeys: readonly string[];
	storageKey: string;
}
