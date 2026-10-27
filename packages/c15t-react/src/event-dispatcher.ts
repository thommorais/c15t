'use client';

import { getEventDispatcher } from '@c15t/core/events';
import type {
	EventDispatcher,
	RuntimeEventDispatcherOptions,
} from '@c15t/core/events';
import { useContext, useMemo } from 'react';

import { ProviderServicesContext } from './context';
import { useCommittedRef } from './hooks/use-committed-ref';

export const useEventDispatcher = function useEventDispatcher(
	options: RuntimeEventDispatcherOptions = {}
): EventDispatcher {
	const services = useContext(ProviderServicesContext);
	if (!services) {
		throw new Error(
			'c15t: useEventDispatcher() needs <ConsentProvider> from @c15t/react.'
		);
	}
	const { runtime } = services;
	const latest = useCommittedRef(options);
	return useMemo(() => {
		const current = () => getEventDispatcher(runtime, latest.current);
		return {
			pageview: (path) => current().pageview(path),
			track: (event, properties) => current().track(event, properties),
		};
	}, [latest, runtime]);
};

export type { EventDispatcher, EventProperties } from '@c15t/core/events';
export type { RuntimeEventDispatcherOptions as UseEventDispatcherOptions };
