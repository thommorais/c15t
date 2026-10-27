import { mergeStyles as baseMergeStyles } from '@c15t/ui/utils';

import type { ClassNameStyle, ThemeValue } from '~/types/theme';

export const mergeStyles = function mergeStyles(
	style1: ThemeValue,
	style2?: ThemeValue
): ClassNameStyle {
	return baseMergeStyles(style1, style2) as ClassNameStyle;
};
