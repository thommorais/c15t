'use client';

import type { StreamedPrefetch } from '@c15t/core/runtime';
import * as React from 'react';
import { Suspense, useContext, useEffect, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';

import { HydrationSnapshotContext, StreamedPrefetchContext } from '~/context';
import { useKernel } from '~/kernel-selector';

const useBrowserLayoutEffect =
	typeof document === 'undefined' ? useEffect : useLayoutEffect;

type RecordedThenable<Value> = PromiseLike<Value> & {
	status?: 'pending' | 'fulfilled';
	value?: Value;
};

export const readRecorded = function readRecorded<Value>(
	thenable: PromiseLike<Value>
): Value {
	const recorded = thenable as RecordedThenable<Value>;
	if (recorded.status === 'fulfilled') {
		return recorded.value as Value;
	}
	throw thenable;
};

const useSettled = function useSettled<Value>(
	thenable: PromiseLike<Value>
): Value {
	const { use } = React as { use?: <Read>(usable: PromiseLike<Read>) => Read };
	return use ? use(thenable) : readRecorded(thenable);
};

const StreamedScope = ({
	children,
	streamed,
}: {
	children: ReactNode;
	streamed: StreamedPrefetch;
}) => {
	const kernel = useKernel();
	const config = useSettled(streamed.settled);
	const snapshot = streamed.snapshotFor(config);
	useBrowserLayoutEffect(() => {
		streamed.adopt(config);
	}, [streamed, config]);
	return (
		<HydrationSnapshotContext.Provider
			value={snapshot === kernel.getServerSnapshot() ? null : snapshot}
		>
			<StreamedPrefetchContext.Provider value={undefined}>
				{children}
			</StreamedPrefetchContext.Provider>
		</HydrationSnapshotContext.Provider>
	);
};

export interface StreamedConsentSurfaceProps {
	children: ReactNode;
}

export const StreamedConsentSurface = ({
	children,
}: StreamedConsentSurfaceProps) => {
	const streamed = useContext(StreamedPrefetchContext);
	if (!streamed) {
		return children;
	}
	return (
		<Suspense fallback={null}>
			<StreamedScope streamed={streamed}>{children}</StreamedScope>
		</Suspense>
	);
};
