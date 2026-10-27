'use client';

import { setupScrollLock } from '@c15t/ui/utils/dom';
import { useEffect } from 'react';

export const useScrollLock = function useScrollLock(shouldLock: boolean): void {
	useEffect(() => {
		if (shouldLock) {
			return setupScrollLock();
		}
	}, [shouldLock]);
};
