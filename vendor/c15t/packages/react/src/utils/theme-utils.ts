import type { ThemeCSSVariables } from '@c15t/ui/theme';
import {
	defaultTheme as baseDefaultTheme,
	generateThemeCSS as baseGenerateThemeCSS,
	themeToVars as baseThemeToVars,
} from '@c15t/ui/theme';

import type { Theme } from '../types/theme/style-types';

export const defaultTheme = baseDefaultTheme as Required<Omit<Theme, 'slots'>>;

export const themeToVars = function themeToVars(
	theme: Theme,
	isDark = false
): ThemeCSSVariables {
	return baseThemeToVars(theme, isDark);
};

export const generateThemeCSS = function generateThemeCSS(
	theme: Theme,
	colorScheme?: Parameters<typeof baseGenerateThemeCSS>[1]
): string {
	return baseGenerateThemeCSS(theme, colorScheme);
};
