'use client';

import type { ConsentComponentSlotKey } from '@c15t/schema/config';
import { forwardRef as createForwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { Slot } from '~/components/shared/libs/slot';
import { useTheme } from '~/hooks/use-theme';
import type { ExtendThemeKeys } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

export interface BoxProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'style'>, ExtendThemeKeys {
	asChild?: boolean;
	slotKey?: ConsentComponentSlotKey;
}

export const Box = createForwardRef<HTMLDivElement, BoxProps>(
	(
		{ asChild, className, style, slotKey, baseClassName, noStyle, ...props },
		ref
	) => {
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const slotProps = getSlotProps(components, slotKey);
		const mergedProps = mergeSlotProps(slotProps, {
			baseClassName,
			className,
			noStyle: noStyle ?? contextNoStyle,
			style,
			...props,
		});
		const Comp = asChild ? Slot : 'div';
		return (
			<Comp
				ref={ref}
				{...mergedProps}
			/>
		);
	}
);

Box.displayName = 'Box';
