'use client';

import { setupFocusTrap } from '@c15t/ui/utils/dom';
import type { FocusTrapOptions } from '@c15t/ui/utils/dom';
import { useEffect } from 'react';
import type { RefObject } from 'react';

export const useFocusTrap = function useFocusTrap(
	shouldTrap: boolean,
	containerRef: RefObject<HTMLElement | null> | null,
	options?: FocusTrapOptions
): void {
	const initialFocus = options?.initialFocus;
	useEffect(() => {
		if (!shouldTrap || !containerRef || !containerRef.current) {
			return;
		}

		return setupFocusTrap(containerRef.current, { initialFocus });
	}, [shouldTrap, containerRef, initialFocus]);
};
