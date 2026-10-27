import type {
	AllConsentNames,
	ConsentKernel,
	ConsentSnapshot,
} from '@c15t/core';
import { evaluateConsent } from '@c15t/core';
import { useContext, useSyncExternalStore } from 'react';

import { HydrationSnapshotContext, KernelContext } from './context';
import { defaultTranslationConfig } from './utils/default-translation-config';

export const useKernel = function useKernel(): ConsentKernel {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error(
			'c15t: no kernel in context. Wrap your app with <ConsentProvider options={...}> from @c15t/react.'
		);
	}
	return kernel;
};

export const useServerSnapshot = function useServerSnapshot(
	kernel: ConsentKernel | null
): () => ConsentSnapshot | undefined {
	const streamed = useContext(HydrationSnapshotContext);
	return () => streamed ?? kernel?.getServerSnapshot();
};

export const useKernelSelector = function useKernelSelector<SliceType>(
	selector: (snap: ConsentSnapshot) => SliceType
): SliceType {
	const kernel = useKernel();
	const serverSnapshot = useServerSnapshot(kernel);
	return useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => selector(kernel.getSnapshot()),
		() => selector(serverSnapshot() as ConsentSnapshot)
	);
};

export const useGateSelector = function useGateSelector<SliceType>(
	selector: (snap: ConsentSnapshot, now: number) => SliceType
): SliceType {
	const kernel = useKernel();
	const serverSnapshot = useServerSnapshot(kernel);
	return useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => selector(kernel.getSnapshot(), Date.now()),
		() => {
			const snap = serverSnapshot() as ConsentSnapshot;
			return selector(snap, snap.evaluatedAt);
		}
	);
};

export const useCategoryAllowed = function useCategoryAllowed(
	category: AllConsentNames
): boolean {
	return useGateSelector((snap, now) =>
		evaluateConsent({ category }, snap, now)
	);
};

export const useTranslationLanguage =
	function useTranslationLanguage(): string {
		return useKernelSelector(
			(snap) =>
				snap.translations?.language ?? defaultTranslationConfig.defaultLanguage
		);
	};
