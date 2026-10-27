'use client';

import type * as C15tCoreTypes from '@c15t/core';
import { isDialogDismissKey } from '@c15t/ui/primitives/dialog';
import styles from '@c15t/ui/styles/components/consent-dialog';
import type { FC, HTMLAttributes, ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useHeadlessConsentUI } from '~/component-hooks/use-headless-consent-ui';
import { ConsentTrackingContext } from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import type { ThemeContextValue } from '~/context/theme-context';
import { useActiveUI, useHasConsentUI, useModel } from '~/hooks';
import { useFocusTrap } from '~/hooks/use-focus-trap';
import { useIABPolicyGuard } from '~/hooks/use-iab-policy-guard';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useScrollLock } from '~/hooks/use-scroll-lock';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useTheme } from '~/hooks/use-theme';
import { useTranslationLanguage } from '~/kernel-selector';
import type { CSSPropertiesWithVars } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { DIALOG_SHEETS } from '../../shared/dialog-sheets';
import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import { Overlay } from './overlay';

const DEFAULT_MODELS: C15tCoreTypes.Model[] = ['opt-in', 'opt-out', 'none'];

const resolveDialogOptions = (
	localDisableAnimation: boolean | undefined,
	globalDisableAnimation: boolean | undefined,
	localNoStyle: boolean | undefined,
	globalNoStyle: boolean | undefined,
	blocking: boolean
) => ({
	disableAnimation: localDisableAnimation ?? globalDisableAnimation ?? false,
	noStyle: localNoStyle ?? globalNoStyle ?? false,
	scrollLock: blocking,
	trapFocus: blocking,
});

const resolveDialogOpen = (
	sheetsReady: boolean,
	hasConsentUI: boolean,
	models: C15tCoreTypes.Model[],
	model: C15tCoreTypes.Model | null,
	open: boolean | undefined,
	activeUI: string | null
): boolean => {
	if (!hasConsentUI || !models.includes(model ?? 'opt-in')) {
		return false;
	}
	return sheetsReady && (open ?? activeUI === 'dialog');
};

const getRootClasses = (
	disableAnimation: boolean,
	isVisible: boolean
): string => {
	if (disableAnimation) {
		return styles.root;
	}
	return cn(
		styles.root,
		isVisible ? styles.dialogVisible : styles.dialogHidden
	);
};

export interface ConsentDialogRootProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;

	open?: boolean;

	models?: C15tCoreTypes.Model[];

	noStyle?: boolean;

	disableAnimation?: boolean;

	scrollLock?: boolean;

	trapFocus?: boolean;

	overlay?: ReactNode | false;

	uiSource?: string;
}

const ConsentDialogRoot: FC<ConsentDialogRootProps> = ({
	children,
	open: openProp,
	models = DEFAULT_MODELS,
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	overlay,
	uiSource,
	className,
	style,
	...rest
}) => {
	useIABPolicyGuard();
	const globalTheme = useTheme();
	const { components } = useUIConfig();

	const activeUI = useActiveUI();
	const model = useModel();
	const language = useTranslationLanguage();
	const { closeUI, dialog } = useHeadlessConsentUI({
		preferences: { scrollLock: localScrollLock, trapFocus: localTrapFocus },
	});
	const { disableAnimation, noStyle, scrollLock, trapFocus } =
		resolveDialogOptions(
			localDisableAnimation,
			globalTheme.disableAnimation,
			localNoStyle,
			globalTheme.noStyle,
			dialog.blocking
		);
	const textDirection = useTextDirection(language);

	const hasConsentUI = useHasConsentUI();
	const sheetsReady = useSurfaceSheetsReady(DIALOG_SHEETS, noStyle);
	const isOpen = resolveDialogOpen(
		sheetsReady,
		hasConsentUI,
		models,
		model,
		openProp,
		activeUI
	);

	const [isVisible, setIsVisible] = useState(false);

	const dialogRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	const isMounted = useIsHydrated();

	const animationDuration = globalTheme.theme?.motion?.duration?.normal;

	useEffect(() => {
		if (isOpen) {
			const frame = requestAnimationFrame(() => setIsVisible(true));
			return () => cancelAnimationFrame(frame);
		}
		if (disableAnimation) {
			const frame = requestAnimationFrame(() => setIsVisible(false));
			return () => cancelAnimationFrame(frame);
		}
		const durationStr = animationDuration || '200ms';
		const duration = Number.parseInt(durationStr.replace('ms', ''), 10);

		const timer = setTimeout(() => setIsVisible(false), duration);
		return () => clearTimeout(timer);
	}, [isOpen, disableAnimation, animationDuration]);

	useFocusTrap(isOpen && trapFocus, contentRef as RefObject<HTMLElement>, {
		initialFocus: 'first-tabbable',
	});

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (isDialogDismissKey(event.key)) {
				event.preventDefault();
				closeUI();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [closeUI, isOpen]);

	useScrollLock(isOpen && scrollLock);

	const rootClasses = getRootClasses(disableAnimation, isVisible);

	const themedStyle = mergeSlotProps(components?.dialog?.root, {
		baseClassName: rootClasses,
		className,
		noStyle,
		style: style as CSSPropertiesWithVars<Record<string, never>>,
		...rest,
	});
	const containerStyle = mergeSlotProps(components?.dialog?.container, {
		baseClassName: cn(
			styles.container,
			!disableAnimation &&
				(isVisible ? styles.contentVisible : styles.contentHidden)
		),
		noStyle,
	});
	const contextValue = useMemo<ThemeContextValue>(
		() => ({
			disableAnimation,
			noStyle,
			scrollLock,
			theme: globalTheme.theme,
			trapFocus,
		}),
		[disableAnimation, globalTheme.theme, noStyle, scrollLock, trapFocus]
	);
	const trackingContextValue = useMemo(
		() => ({ uiSource: uiSource ?? 'dialog' }),
		[uiSource]
	);

	const blockingAttribute = dialog.blocking ? 'true' : undefined;
	const dialogNode = (
		<ConsentTrackingContext.Provider value={trackingContextValue}>
			<LocalThemeContext.Provider value={contextValue}>
				{isOpen && (
					<>
						<SurfaceStyles
							sheets={DIALOG_SHEETS}
							noStyle={noStyle}
						/>
						{dialog.blocking && overlay !== false
							? (overlay ?? <Overlay open={isOpen} />)
							: null}

						<div
							ref={dialogRef}
							data-slot="dialog-positioner"
							data-blocking={blockingAttribute}
							{...themedStyle}
							className={themedStyle.className}
						>
							<div
								ref={contentRef}
								{...containerStyle}
								aria-describedby="consent-dialog-description"
								aria-labelledby="consent-dialog-title"
								aria-modal={trapFocus ? 'true' : undefined}
								data-blocking={blockingAttribute}
								data-testid="consent-dialog-root"
								dir={textDirection}
								// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native `dialog` is the positioning shell here, not the panel; the panel is what carries the role.
								role="dialog"
								tabIndex={-1}
							>
								{children}
							</div>
						</div>
					</>
				)}
			</LocalThemeContext.Provider>
		</ConsentTrackingContext.Provider>
	);

	if (!isMounted) {
		return null;
	}

	return createPortal(dialogNode, document.body);
};

const Root = ConsentDialogRoot;

export { ConsentDialogRoot, Root };
