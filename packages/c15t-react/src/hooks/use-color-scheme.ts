'use client';

import { setupColorScheme } from '@c15t/ui/utils/color-scheme';
import { useEffect } from 'react';

export type ColorScheme = 'light' | 'dark' | 'system' | null;

export const useColorScheme = function useColorScheme(
	colorScheme?: ColorScheme
) {
	useEffect(() => {
		if (colorScheme === null) {
			return;
		}
		return setupColorScheme(colorScheme as 'light' | 'dark' | 'system');
	}, [colorScheme]);
};
