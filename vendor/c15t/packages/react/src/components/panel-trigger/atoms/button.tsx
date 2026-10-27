'use client';

import styles from '@c15t/ui/styles/components/consent-dialog-trigger';
import { forwardRef as createForwardRef } from 'react';
import type { FocusEvent, MouseEvent, PointerEvent, ReactNode } from 'react';

import { useIdleDialogWarming, warmDialogChunk } from '~/chunk-warming';
import { usePolicyRule } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/ui-config-context';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import type { CornerPosition, TriggerSize } from '../types';
import { useTriggerContext } from './root';

const cornerClassMap = {
	'bottom-left': styles.bottomLeft,
	'bottom-right': styles.bottomRight,
	'top-left': styles.topLeft,
	'top-right': styles.topRight,
} as const satisfies Record<CornerPosition, string | undefined>;

const sizeClassMap = {
	lg: styles.lg,
	md: styles.md,
	sm: styles.sm,
} as const;

export interface TriggerButtonProps {
	children: ReactNode;

	size?: TriggerSize;

	ariaLabel?: string;

	className?: string;

	noStyle?: boolean;

	'data-testid'?: string;
}

export const TriggerButton = createForwardRef<
	HTMLButtonElement,
	TriggerButtonProps
>(
	(
		{
			children,
			size = 'md',
			ariaLabel = 'Open privacy settings',
			className,
			'data-testid': dataTestId = 'consent-dialog-trigger',
			noStyle,
		},
		ref
	) => {
		const policy = usePolicyRule();
		const { components } = useUIConfig();
		const { disableAnimation, noStyle: contextNoStyle } = useTheme();
		const {
			corner,
			isDragging,
			isSnapping,
			wasDragged,
			handlers,
			dragStyle,
			openDialog,
		} = useTriggerContext();

		useIdleDialogWarming(true);

		const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
			if (event.detail !== 0 && wasDragged()) {
				return;
			}
			openDialog();
		};

		const finalNoStyle = noStyle ?? contextNoStyle;
		const buttonStyle = mergeSlotProps(components?.trigger?.root, {
			baseClassName: [
				styles.trigger,
				cornerClassMap[corner],
				sizeClassMap[size],
				isDragging && styles.dragging,
				isSnapping && styles.snapping,
			],
			className,
			'data-testid': dataTestId,
			noStyle: finalNoStyle,
			style: dragStyle,
			...handlers,
		});

		const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
			buttonStyle.onFocus?.(event);
			warmDialogChunk();
		};
		const handlePointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
			buttonStyle.onPointerEnter?.(event);
			warmDialogChunk();
		};

		return (
			<button
				{...buttonStyle}
				ref={ref}
				type="button"
				data-c15t-trigger="true"
				data-c15t-rights={policy.rights.join(' ')}
				data-disable-animation={disableAnimation ? '' : undefined}
				aria-label={ariaLabel}
				onClick={handleClick}
				onFocus={handleFocus}
				onPointerEnter={handlePointerEnter}
			>
				{children}
			</button>
		);
	}
);

TriggerButton.displayName = 'ConsentDialogTrigger.Button';
