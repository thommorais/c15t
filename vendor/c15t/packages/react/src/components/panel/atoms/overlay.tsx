import styles from '@c15t/ui/styles/components/consent-dialog';
import { useEffect, useState } from 'react';
import type { FC, PropsWithChildren } from 'react';

import { useActiveUI } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import type { ThemeValue } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

export type OverlayProps = PropsWithChildren<{
	style?: ThemeValue;

	noStyle?: boolean;

	open?: boolean;
}>;

const ConsentDialogOverlay: FC<OverlayProps> = ({ noStyle, style, open }) => {
	const activeUI = useActiveUI();
	const { components } = useUIConfig();
	const {
		disableAnimation,
		noStyle: isThemeNoStyle,
		scrollLock: _scrollLock = true,
	} = useTheme();

	const showDialog = open ?? activeUI === 'dialog';
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (showDialog) {
			const frame = requestAnimationFrame(() => setIsVisible(true));
			return () => cancelAnimationFrame(frame);
		}

		if (disableAnimation) {
			const frame = requestAnimationFrame(() => setIsVisible(false));
			return () => cancelAnimationFrame(frame);
		}

		const animationDurationMs = Number.parseInt(
			getComputedStyle(document.documentElement).getPropertyValue(
				'--consent-dialog-animation-duration'
			) || '200',
			10
		);
		const timer = setTimeout(() => {
			setIsVisible(false);
		}, animationDurationMs);
		return () => clearTimeout(timer);
	}, [showDialog, disableAnimation]);

	const customClassName = typeof style === 'string' ? style : style?.className;

	const theme = mergeSlotProps(components?.dialog?.overlay, {
		baseClassName: styles.overlay,
		className: customClassName,
		noStyle: isThemeNoStyle || noStyle,
		style:
			typeof style === 'object' && 'style' in style ? style.style : undefined,
	});

	const shouldApplyAnimation =
		!(isThemeNoStyle || noStyle) && !disableAnimation;

	let animationClass: string | undefined;
	if (shouldApplyAnimation) {
		animationClass = isVisible ? styles.overlayVisible : styles.overlayHidden;
	} else {
		animationClass = undefined;
	}

	const finalClassName = cn(theme.className, animationClass);

	return (
		<div
			{...theme}
			role="presentation"
			aria-hidden="true"
			className={finalClassName}
			data-testid="consent-dialog-overlay"
		/>
	);
};

const Overlay = ConsentDialogOverlay;

export { ConsentDialogOverlay, Overlay };
