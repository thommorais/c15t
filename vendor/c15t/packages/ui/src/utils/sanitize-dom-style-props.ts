import type { ClassNameStyle } from '../theme/types';

export const sanitizeDOMStyleProps = function sanitizeDOMStyleProps<
	VariableMap = Record<string, string | number>,
>(
	style?: ClassNameStyle<VariableMap>
): Pick<ClassNameStyle<VariableMap>, 'className' | 'style'> {
	return {
		className: style?.className,
		style: style?.style,
	};
};
