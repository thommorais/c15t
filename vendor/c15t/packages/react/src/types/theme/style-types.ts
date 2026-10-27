import type {
	ClassNameStyle as BaseClassNameStyle,
	Theme as BaseTheme,
} from '@c15t/ui/theme';
import type { CSSProperties } from 'react';

export type {
	ColorTokens,
	CSSVariables,
	MotionTokens,
	RadiusTokens,
	ShadowTokens,
	SpacingTokens,
	TypographyTokens,
} from '@c15t/ui/theme';

export type CSSPropertiesWithVars<
	VariableMap = Record<string, string | number>,
> = CSSProperties & Partial<VariableMap>;

export interface ClassNameStyle<
	VariableMap = Record<string, string | number>,
> extends Omit<BaseClassNameStyle<VariableMap>, 'style'> {
	style?: CSSPropertiesWithVars<VariableMap>;
}

export type ThemeValue<VariableMap = Record<string, string | number>> =
	| string
	| ClassNameStyle<VariableMap>;

export type ExtendThemeKeys<VariableMap = Record<string, string | number>> =
	ClassNameStyle<VariableMap>;

export interface Theme extends Omit<BaseTheme, 'slots'> {
	consentActions?: BaseTheme['consentActions'];
}

export const defineTheme = function defineTheme<ThemeType extends Theme>(
	theme: ThemeType
): ThemeType {
	return theme;
};
