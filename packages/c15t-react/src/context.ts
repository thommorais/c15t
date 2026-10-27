import type {
	AllConsentNames,
	ConsentKernel,
	ConsentPresentation,
	ConsentSnapshot,
} from '@c15t/core';
import type { ConsentRuntime, StreamedPrefetch } from '@c15t/core/runtime';
import { createContext } from 'react';

export const KernelContext = createContext<ConsentKernel | null>(null);
KernelContext.displayName = 'C15tKernelContext';

export interface ProviderServices {
	clearRecords: () => void;
	getPresentation: () => ConsentPresentation | undefined;
	getConsentCategories: () => readonly AllConsentNames[];
	isStarted: () => boolean;
	runtime: ConsentRuntime;
	setLanguage: (code: string) => void;
}
export const ProviderServicesContext = createContext<ProviderServices | null>(
	null
);

export const StreamedPrefetchContext = createContext<
	StreamedPrefetch | undefined
>(undefined);

export const HydrationSnapshotContext = createContext<ConsentSnapshot | null>(
	null
);
