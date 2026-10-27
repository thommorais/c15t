'use client';

import type {
	AllConsentNames,
	ConsentKernel,
	ConsentState,
	SaveResult,
} from '@c15t/core';
import { createPreferenceDraft } from '@c15t/core/preference-draft';
import type {
	PreferenceDraft,
	PreferenceDraftState,
} from '@c15t/core/preference-draft';
import {
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

import {
	DraftContext,
	REFUSED,
	useDraftKernel,
	useKernelGuard,
} from './draft-context';
import { useResolvedPresentation } from './hooks';

export interface ConsentDraftHandle {
	values: Readonly<ConsentState>;
	displayedCategories: readonly AllConsentNames[];
	vendors: Readonly<Record<string, boolean>>;
	isDirty: boolean;
	isStale: boolean;
	set: (category: AllConsentNames, value: boolean) => void;
	update: (patch: Partial<ConsentState>) => void;
	setVendor: (vendorId: string, granted: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	save: () => Promise<SaveResult>;
	reset: () => void;
}
type DraftStore = PreferenceDraft;

const useKernelDraft = function useKernelDraft(
	kernel: ConsentKernel,
	defaults: Partial<ConsentState> | undefined
): DraftStore {
	const [entry, setEntry] = useState(() => ({
		draft: createPreferenceDraft(kernel, { defaults }),
		kernel,
	}));
	useEffect(() => {
		entry.draft.setDefaults(defaults);
	}, [entry.draft, defaults]);
	if (entry.kernel === kernel) {
		return entry.draft;
	}
	const next = { draft: createPreferenceDraft(kernel, { defaults }), kernel };
	setEntry(next);
	return next.draft;
};
export interface ConsentDraftProviderProps {
	children: ReactNode;
	initial?: Partial<ConsentState>;
}

export const ConsentDraftProvider = ({
	children,
	initial,
}: ConsentDraftProviderProps) => {
	const kernel = useDraftKernel();
	const parent = useContext(DraftContext);
	const presentation = useResolvedPresentation();
	const local = useKernelDraft(
		kernel,
		initial ?? presentation?.preferences?.defaults
	);
	const draft = parent && !initial && parent.kernel === kernel ? parent : local;
	return (
		<DraftContext.Provider value={draft}>{children}</DraftContext.Provider>
	);
};

const useDraftStore = function useDraftStore(): DraftStore {
	const kernel = useDraftKernel();
	const shared = useContext(DraftContext);
	const local = useKernelDraft(
		kernel,
		useResolvedPresentation()?.preferences?.defaults
	);
	return shared?.kernel === kernel ? shared : local;
};

const useDraftHandle = function useDraftHandle(
	draft: DraftStore
): ConsentDraftHandle {
	const state = useSyncExternalStore(
		draft.subscribe,
		draft.getState,
		draft.getState
	);
	const isCurrent = useKernelGuard(draft.kernel);
	return useMemo(() => {
		const guarded =
			<Args extends unknown[]>(method: (...args: Args) => void) =>
			(...args: Args) => {
				if (isCurrent()) {
					method(...args);
				}
			};
		return {
			...state,
			acceptAll: guarded(draft.acceptAll),
			rejectAll: guarded(draft.rejectAll),
			reset: guarded(draft.reset),
			save: () => (isCurrent() ? draft.save() : Promise.resolve(REFUSED)),
			set: guarded(draft.set),
			setVendor: guarded(draft.setVendor),
			update: guarded(draft.update),
		};
	}, [draft, isCurrent, state]);
};

export const useConsentDraftStore =
	function useConsentDraftStore(): DraftStore {
		return useDraftStore();
	};

export const useConsentDraftSlice = function useConsentDraftSlice<SliceType>(
	draft: DraftStore,
	selector: (state: PreferenceDraftState) => SliceType
): SliceType {
	const read = () => selector(draft.getState());
	return useSyncExternalStore(draft.subscribe, read, read);
};

export const useConsentDraft = function useConsentDraft(): ConsentDraftHandle {
	return useDraftHandle(useDraftStore());
};

export interface VendorDraftHandle {
	vendors: Readonly<Record<string, boolean>>;
	setVendor: (vendorId: string, granted: boolean) => void;
	isDirty: boolean;
	isStale: boolean;
	save: () => Promise<SaveResult>;
	reset: () => void;
}

export const useVendorDraft = function useVendorDraft(): VendorDraftHandle {
	const { isDirty, isStale, reset, save, setVendor, vendors } =
		useDraftHandle(useDraftStore());
	return useMemo(
		() => ({ isDirty, isStale, reset, save, setVendor, vendors }),
		[isDirty, isStale, reset, save, setVendor, vendors]
	);
};
