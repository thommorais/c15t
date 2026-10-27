'use client';

import type { ConsentRuntime } from '@c15t/core/runtime';
import type { IABHandle } from '@c15t/iab';
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

import { IABContext } from './context/iab-context-value';
import type { IABContextValue } from './context/iab-context-value';
import { useCommittedRef } from './hooks/use-committed-ref';

export interface ExternalIABProviderProps {
	runtime: ConsentRuntime;
	children: ReactNode;
}

const getServerHandle = function getServerHandle(): IABHandle | null {
	return null;
};

const createActionQueue = (runtime: ConsentRuntime) => {
	let active = false;
	let closed = false;
	const actions: {
		run: (mounted: IABHandle) => Promise<void>;
		cancel: () => void;
	}[] = [];
	return {
		actions,
		activate: () => {
			active = true;
			closed = false;
		},
		deactivate: () => {
			active = false;
			queueMicrotask(() => {
				if (!active) {
					closed = true;
					for (const action of actions.splice(0)) {
						action.cancel();
					}
				}
			});
		},
		isClosed: () => closed,
		runtime,
	};
};

export const ExternalIABProvider = ({
	runtime,
	children,
}: ExternalIABProviderProps) => {
	const [tab, setTab] = useState<'purposes' | 'vendors'>('purposes');
	const handle = useSyncExternalStore(
		(listener) => runtime.subscribe(listener),
		() => runtime.iab as IABHandle | null,
		getServerHandle
	);

	const queue = useMemo(() => createActionQueue(runtime), [runtime]);
	const committedQueueRef = useCommittedRef(queue);
	useEffect(() => {
		queue.activate();
		const flush = () => {
			const mounted = queue.runtime.iab as IABHandle | null;
			if (mounted) {
				for (const action of queue.actions.splice(0)) {
					void action.run(mounted);
				}
			}
		};
		const unsubscribe = queue.runtime.subscribe(flush);
		flush();
		return () => {
			unsubscribe();
			queue.deactivate();
		};
	}, [queue]);
	const run = useCallback<NonNullable<IABContextValue['run']>>(
		(action) => {
			const pending = new Promise<void>((resolve, reject) => {
				const cancel = () =>
					reject(
						new DOMException(
							'External IAB provider unmounted or changed runtimes.',
							'AbortError'
						)
					);
				if (queue.isClosed() || committedQueueRef.current !== queue) {
					cancel();
					return;
				}
				const invoke = async (ready: IABHandle) => {
					try {
						await action(ready);
						resolve();
					} catch (error) {
						reject(error);
					}
				};
				const mounted = queue.runtime.iab as IABHandle | null;
				if (mounted) {
					void invoke(mounted);
				} else {
					queue.actions.push({ cancel, run: invoke });
				}
			});
			// oxlint-disable-next-line promise/prefer-await-to-then
			void pending.catch(() => undefined);
			return pending;
		},
		[committedQueueRef, queue]
	);

	const value = useMemo<IABContextValue>(
		() => ({ handle, run, setTab, tab }),
		[handle, run, tab]
	);

	return <IABContext.Provider value={value}>{children}</IABContext.Provider>;
};
