'use client';

import { createContext } from 'react';

import type { Theme } from '~/types/theme';

export interface ThemeContextValue {
	theme?: Theme;

	disableAnimation?: boolean;

	noStyle?: boolean;

	scrollLock?: boolean;

	trapFocus?: boolean;

	colorScheme?: 'light' | 'dark' | 'system' | null;
}

export const GlobalThemeContext = createContext<ThemeContextValue>({
	colorScheme: 'system',
	disableAnimation: false,
	noStyle: false,
	scrollLock: undefined,
	theme: undefined,
	trapFocus: undefined,
});

export const LocalThemeContext = createContext<ThemeContextValue | null>(null);
