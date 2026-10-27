import type { StorageConfig } from '../../libs/cookie';
import type { ConsentKernel } from '../../types';

export type { StorageConfig };

export interface PersistenceOptions {
	kernel: ConsentKernel;
	storageConfig?: StorageConfig;
	skipHydration?: boolean;
	now?: () => number;
	sync?: boolean;
	keepSubject?: boolean;
}

export interface PersistenceHandle {
	dispose: () => void;
	hydrate: () => boolean;
	reconcile: () => boolean;
	clear: () => void;
}
