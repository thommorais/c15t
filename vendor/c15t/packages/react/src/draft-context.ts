'use client';

import type {
	AllConsentNames,
	ConsentKernel,
	ConsentState,
	SaveInput,
	SaveResult,
	SaveUISource,
} from '@c15t/core';
import type { PreferenceDraft } from '@c15t/core/preference-draft';
import { saveConsentSurface } from '@c15t/core/surface-actions';
import { createContext, useCallback, useContext } from 'react';

import { KernelContext, ProviderServicesContext } from './context';
import { useResolvedPresentation } from './hooks';
import { useCommittedRef } from './hooks/use-committed-ref';

export const DraftContext = createContext<PreferenceDraft | null>(null);

export const REFUSED: SaveResult = { ok: false };

export const useDraftKernel = function useDraftKernel(): ConsentKernel {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error('Consent drafts require a ConsentProvider.');
	}
	return kernel;
};

export const useKernelGuard = function useKernelGuard(
	owner: ConsentKernel
): () => boolean {
	const committedKernelRef = useCommittedRef(useDraftKernel());
	return useCallback(
		() => committedKernelRef.current === owner,
		[committedKernelRef, owner]
	);
};

const saveFreshDraft = async function saveFreshDraft(
	kernel: ConsentKernel,
	defaults: Partial<ConsentState> | undefined,
	categories: readonly AllConsentNames[] | undefined,
	uiSource: SaveUISource | undefined
): Promise<SaveResult> {
	const { createPreferenceDraft } = await import('@c15t/core/preference-draft');
	return createPreferenceDraft(kernel, { defaults }).save({
		categories,
		uiSource,
	});
};

export const useConsentSaveAction = function useConsentSaveAction() {
	const kernel = useDraftKernel();
	const services = useContext(ProviderServicesContext);
	const shared = useContext(DraftContext);
	const draft = shared?.kernel === kernel ? shared : null;
	const defaults = useResolvedPresentation()?.preferences?.defaults;
	const isCurrent = useKernelGuard(kernel);
	return useCallback(
		(input?: SaveInput, uiSource?: SaveUISource): Promise<SaveResult> => {
			if (!isCurrent()) {
				return Promise.resolve(REFUSED);
			}
			const categories = services?.getConsentCategories();
			const bulk = input === 'all' || input === 'none';
			const save = (): Promise<SaveResult> => {
				if (draft && (bulk || input === undefined)) {
					return draft.save({ categories, input, uiSource });
				}
				if (input === undefined) {
					return saveFreshDraft(kernel, defaults, categories, uiSource);
				}
				return kernel.commands.save(input, {
					...(categories !== undefined && { categories }),
					...(uiSource !== undefined && { uiSource }),
				});
			};
			return saveConsentSurface(
				kernel,
				save,
				() => input !== undefined || !draft?.getState().isDirty
			);
		},
		[defaults, draft, isCurrent, kernel, services]
	);
};
