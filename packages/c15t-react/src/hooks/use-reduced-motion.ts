'use client';

import { useSyncExternalStore } from 'react';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

const subscribeToReducedMotion = (onStoreChange: () => void) => {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	const mediaQuery = window.matchMedia(reducedMotionQuery);
	mediaQuery.addEventListener('change', onStoreChange);
	return () => mediaQuery.removeEventListener('change', onStoreChange);
};

const getReducedMotionSnapshot = () =>
	typeof window !== 'undefined' &&
	window.matchMedia(reducedMotionQuery).matches;

const getServerSnapshot = () => false;

export const useReducedMotion = function useReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribeToReducedMotion,
		getReducedMotionSnapshot,
		getServerSnapshot
	);
};
