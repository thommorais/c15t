import type {
	AllThemeKeys,
	ClassNameStyle,
	Theme,
	ThemeValue,
} from '../theme/types';
import { mergeStyles } from './merge-styles';

export const resolveStyles = function resolveStyles(
	themeKey: AllThemeKeys,
	theme?: Theme,
	componentStyle?: ThemeValue,
	contextNoStyle = false
): ClassNameStyle {
	const themeStyle = theme?.slots?.[themeKey];

	const themeNoStyle =
		typeof themeStyle === 'object' && themeStyle !== null
			? Boolean((themeStyle as ClassNameStyle).noStyle)
			: false;

	const componentNoStyle =
		typeof componentStyle === 'object' && componentStyle !== null
			? Boolean((componentStyle as ClassNameStyle).noStyle)
			: false;

	const isNoStyle = contextNoStyle || themeNoStyle || componentNoStyle;

	if (isNoStyle) {
		const overridesOf = (value: ThemeValue | undefined): ClassNameStyle =>
			typeof value === 'object' && value !== null
				? { className: value.className, style: value.style }
				: { className: value };
		const merged = mergeStyles(
			overridesOf(themeStyle),
			overridesOf(componentStyle)
		);
		return {
			className: merged.className,
			noStyle: true,
			style: merged.style,
		};
	}

	const baseDefaults: ThemeValue =
		typeof componentStyle === 'object'
			? { ...(componentStyle as ClassNameStyle), className: undefined }
			: {};

	const withTheme = mergeStyles(baseDefaults, themeStyle || {});

	const final = mergeStyles(withTheme, componentStyle || {});

	return {
		className: final.className,
		style: final.style,
	};
};
