'use client';

import type {
	ConsentKernel,
	GlobalVendorList,
	KernelIABState,
	NonIABVendor,
} from '@c15t/core';
import { createIAB } from '@c15t/iab';
import type { CreateIABOptions, IABHandle } from '@c15t/iab';
import {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

import { KernelContext } from './context';
import { IABContext } from './context/iab-context-value';
import type { IABContextValue } from './context/iab-context-value';
import { useCommittedRef } from './hooks/use-committed-ref';
import { markIABProviderLoaded } from './hooks/use-iab-policy-guard';

markIABProviderLoaded();

export interface ReactIABState extends KernelIABState {
	config: {
		enabled: boolean;
		cmpId: number | null;
	};
	isLoadingGVL: boolean;
	nonIABVendors: NonIABVendor[];
	preferenceCenterTab: 'purposes' | 'vendors';
	setPreferenceCenterTab: (tab: 'purposes' | 'vendors') => void;
	setVendorConsent: (vendorId: string | number, value: boolean) => void;
	setVendorLegitimateInterest: (
		vendorId: string | number,
		value: boolean
	) => void;
	setPurposeConsent: (purposeId: number, value: boolean) => void;
	setPurposeLegitimateInterest: (purposeId: number, value: boolean) => void;
	setSpecialFeatureOptIn: (featureId: number, value: boolean) => void;
	setAdTechProviderConsent: (providerId: number, value: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	save: () => Promise<void>;
}

interface KernelSelection {
	kernel: ConsentKernel;
}

interface QueuedIABAction {
	selection: KernelSelection;
	run: (handle: IABHandle) => void;
	cancel: () => void;
}

const useKernelSelection = function useKernelSelection(
	kernel: ConsentKernel
): KernelSelection {
	const [selection, setSelection] = useState<KernelSelection>(() => ({
		kernel,
	}));
	if (selection.kernel === kernel) {
		return selection;
	}
	const next = { kernel };
	setSelection(next);
	return next;
};

export interface IABProviderProps extends Omit<
	CreateIABOptions,
	'kernel' | 'gvl'
> {
	children: ReactNode;
	gvl?: GlobalVendorList | null;
}

export const IABProvider = ({ children, ...options }: IABProviderProps) => {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error(
			'IABProvider: no kernel in context. Wrap with <ConsentProvider options={...}> first.'
		);
	}

	const [tab, setTab] = useState<'purposes' | 'vendors'>('purposes');
	const selection = useKernelSelection(kernel);
	const committedSelectionRef = useCommittedRef(selection);
	const [mountedHandle, setMountedHandle] = useState<{
		handle: IABHandle;
		selection: KernelSelection;
	} | null>(null);
	const handle =
		mountedHandle?.selection === selection ? mountedHandle.handle : null;
	const optionsRef = useRef(options);
	const handleRef = useRef<{
		handle: IABHandle;
		selection: KernelSelection;
	} | null>(null);
	const retiredRef = useRef(new WeakSet<KernelSelection>());
	const queuedRef = useRef<QueuedIABAction[]>([]);
	const mountedRef = useRef(false);
	const closedRef = useRef(false);

	useEffect(() => {
		optionsRef.current = options;
	}, [options]);

	useEffect(() => {
		mountedRef.current = true;
		closedRef.current = false;
		return () => {
			mountedRef.current = false;
			queueMicrotask(() => {
				if (mountedRef.current) {
					return;
				}
				closedRef.current = true;
				for (const action of queuedRef.current.splice(0)) {
					action.cancel();
				}
			});
		};
	}, []);

	useEffect(() => {
		const retired = retiredRef.current;
		retired.delete(selection);
		if (selection.kernel.getSnapshot().externalPermissions) {
			return;
		}
		const next = createIAB({ ...optionsRef.current, kernel: selection.kernel });
		handleRef.current = { handle: next, selection };
		setMountedHandle({ handle: next, selection });
		const queued = queuedRef.current;
		queuedRef.current = [];
		for (const action of queued) {
			if (action.selection === selection) {
				action.run(next);
			} else {
				action.cancel();
			}
		}
		return () => {
			handleRef.current = null;
			retired.add(selection);
			next.dispose();
		};
	}, [selection]);

	const run = useCallback<NonNullable<IABContextValue['run']>>(
		(action) => {
			const stale = committedSelectionRef.current !== selection;
			const { current } = handleRef;
			if (!stale && current?.selection === selection) {
				return Promise.resolve(action(current.handle));
			}
			const pending = new Promise<void>((resolve, reject) => {
				if (selection.kernel.getSnapshot().externalPermissions) {
					reject(
						new Error(
							'Consent is managed by an external CMP. Open its preferences instead.'
						)
					);
					return;
				}
				const cancel = () =>
					reject(
						new DOMException(
							'IAB provider unmounted or switched to another consent kernel.',
							'AbortError'
						)
					);
				if (stale || closedRef.current || retiredRef.current.has(selection)) {
					cancel();
					return;
				}
				queuedRef.current.push({
					cancel,
					run: async (mounted) => {
						try {
							await action(mounted);
							resolve();
						} catch (error) {
							reject(error);
						}
					},
					selection,
				});
			});
			// oxlint-disable-next-line promise/prefer-await-to-then
			pending.catch(() => {
			});
			return pending;
		},
		[committedSelectionRef, selection]
	);

	const value = useMemo<IABContextValue>(
		() => ({
			customVendors: options.customVendors,
			filtered: Boolean(options.vendors?.length),
			handle,
			run,
			setTab,
			tab,
		}),
		[handle, run, tab, options.vendors?.length, options.customVendors]
	);

	return <IABContext.Provider value={value}>{children}</IABContext.Provider>;
};

export const useIAB = function useIAB(): ReactIABState | null {
	const kernel = useContext(KernelContext);
	const iabContext = useContext(IABContext);
	if (!kernel) {
		throw new Error(
			'useIAB must be used within <ConsentProvider options={...}> from @c15t/react'
		);
	}

	const iab = useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => kernel.getSnapshot().iab,
		() => kernel.getServerSnapshot().iab
	);

	return useMemo(() => {
		if (!iab) {
			return null;
		}
		const handle = iabContext?.handle;
		const noop = () => {
		};
		const deferred =
			iabContext?.run ??
			((action: (mounted: IABHandle) => void | Promise<void>) =>
				handle ? Promise.resolve(action(handle)) : Promise.resolve());
		const act =
			<Args extends unknown[]>(
				method: (mounted: IABHandle) => (...args: Args) => void
			) =>
			(...args: Args) => {
				void deferred((mounted) => method(mounted)(...args));
			};

		return {
			...iab,
			acceptAll: act((mounted) => mounted.acceptAll),
			config: {
				cmpId: iab.cmpId,
				enabled: iab.enabled,
			},
			customVendors: iabContext?.customVendors ?? iab.customVendors,
			gvlReference:
				iab.gvlReference && iabContext?.filtered
					? { ...iab.gvlReference, summary: undefined }
					: iab.gvlReference,
			isLoadingGVL: iab.enabled && !iab.gvl,
			nonIABVendors: iabContext?.customVendors ?? iab.customVendors,
			preferenceCenterTab: iabContext?.tab ?? 'purposes',
			rejectAll: act((mounted) => mounted.rejectAll),
			save: () => deferred((mounted) => mounted.save()),
			setAdTechProviderConsent: act(
				(mounted) => mounted.setAdTechProviderConsent
			),
			setPreferenceCenterTab: iabContext?.setTab ?? noop,
			setPurposeConsent: act((mounted) => mounted.setPurposeConsent),
			setPurposeLegitimateInterest: act(
				(mounted) => mounted.setPurposeLegitimateInterest
			),
			setSpecialFeatureOptIn: act((mounted) => mounted.setSpecialFeatureOptIn),
			setVendorConsent: act((mounted) => mounted.setVendorConsent),
			setVendorLegitimateInterest: act(
				(mounted) => mounted.setVendorLegitimateInterest
			),
		};
	}, [iab, iabContext]);
};

export type { CreateIABOptions, IABHandle };
