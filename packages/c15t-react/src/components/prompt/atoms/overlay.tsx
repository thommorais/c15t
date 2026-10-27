import styles from '@c15t/ui/styles/components/consent-banner';
import { forwardRef as createForwardRef, isValidElement } from 'react';
import type { HTMLAttributes } from 'react';

import { Slot } from '~/components/shared/libs/slot';
import { useActiveUI } from '~/hooks';
import { useLateEntry } from '~/hooks/use-late-entry';
import { useScrollLock } from '~/hooks/use-scroll-lock';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

interface OverlayProps extends HTMLAttributes<HTMLDivElement> {
	noStyle?: boolean;
	asChild?: boolean;
}

const ConsentBannerOverlay = createForwardRef<HTMLDivElement, OverlayProps>(
	({ className, style, noStyle, asChild, children, ...props }, ref) => {
		const activeUI = useActiveUI();
		const {
			disableAnimation,
			noStyle: contextNoStyle,
			scrollLock,
		} = useTheme();
		const { components } = useUIConfig();

		const showBanner = activeUI === 'banner';
		const theme = mergeSlotProps(components?.banner?.overlay, {
			baseClassName: styles.overlay,
			className,
			noStyle: contextNoStyle || noStyle,
			style,
			...props,
		});

		const shouldApplyAnimation =
			!(contextNoStyle || noStyle) && !disableAnimation;

		const animationClass = shouldApplyAnimation
			? `${styles.overlayVisible} ${styles.overlayEntering}`
			: undefined;

		const finalClassName = cn(theme.className, animationClass);

		useScrollLock(!!(showBanner && scrollLock));
		const lateEntry =
			useLateEntry(!!(showBanner && scrollLock)) && !disableAnimation;

		if (!(showBanner && scrollLock)) {
			return null;
		}
		const overlayProps = {
			...theme,
			'aria-hidden': true,
			className: finalClassName,
			'data-entry': lateEntry ? 'late' : undefined,
			'data-testid': 'consent-banner-overlay',
		};
		return asChild && isValidElement(children) ? (
			<Slot
				ref={ref}
				{...overlayProps}
			>
				{children}
			</Slot>
		) : (
			<div
				ref={ref}
				{...overlayProps}
			>
				{children}
			</div>
		);
	}
);

ConsentBannerOverlay.displayName = 'ConsentBannerOverlay';

const Overlay = ConsentBannerOverlay;

export { ConsentBannerOverlay, Overlay };
