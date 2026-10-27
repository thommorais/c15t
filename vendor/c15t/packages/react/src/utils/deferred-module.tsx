'use client';

import {
	forwardRef as createForwardRef,
	lazy,
	Suspense,
	useSyncExternalStore,
} from 'react';
import type { ComponentType } from 'react';

export const createDeferredModule = <ModuleType,>(
	importModule: () => Promise<ModuleType>
) => {
	type Snapshot =
		| { status: 'pending' }
		| { status: 'ready'; module: ModuleType }
		| { status: 'error'; error: unknown };
	const pending: Snapshot = { status: 'pending' };
	let snapshot: Snapshot = pending;
	let promise: Promise<ModuleType> | undefined;
	let rendered = false;
	const listeners = new Set<() => void>();
	const getSnapshot = () => snapshot;
	const getServerSnapshot = () => pending;
	const load = (fromRender: boolean) => {
		rendered ||= fromRender;
		promise ??= (async () => {
			try {
				const module = await importModule();
				snapshot = { module, status: 'ready' };
				return module;
			} catch (error) {
				if (rendered) {
					snapshot = { error, status: 'error' };
				} else {
					promise = undefined;
				}
				throw error;
			}
		})();
		return promise;
	};
	let notificationQueued = false;
	const publish = () => {
		if (notificationQueued) {
			return;
		}
		notificationQueued = true;
		queueMicrotask(() => {
			notificationQueued = false;
			snapshot = { ...snapshot };
			for (const listener of listeners) {
				listener();
			}
		});
	};
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	return {
		component<Props extends object>(
			select: (module: ModuleType) => ComponentType<Props>
		): ComponentType<Props> {
			const LazyComponent = lazy(() => {
				const selected = (async () => {
					const module = await load(true);
					return { default: select(module) };
				})();
				// oxlint-disable-next-line promise/prefer-await-to-then -- Register before React attaches its handler, then notify in the following microtask.
				void selected.then(publish, publish);
				return selected;
			});
			const DeferredComponent = createForwardRef<unknown, Props>(
				(props, ref) => {
					const current = useSyncExternalStore(
						subscribe,
						getSnapshot,
						getServerSnapshot
					);
					if (current.status === 'error') {
						throw current.error;
					}
					return (
						<Suspense fallback={null}>
							<LazyComponent
								{...(props as Props)}
								ref={ref}
							/>
						</Suspense>
					);
				}
			);
			DeferredComponent.displayName = 'DeferredComponent';
			return DeferredComponent as unknown as ComponentType<Props>;
		},
		async preload(): Promise<void> {
			try {
				await load(false);
			} catch {
			}
		},
	};
};
