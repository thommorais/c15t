'use client';

import type * as C15tCoreTypes from '@c15t/core';
import type { PromptPosition, PromptVariant } from '@c15t/core';
import styles from '@c15t/ui/styles/components/consent-banner';
import { forwardRef as createForwardRef, useMemo } from 'react';
import type { CSSProperties, FC, HTMLAttributes, ReactNode } from 'react';

import { useHeadlessConsentUI } from '~/component-hooks/use-headless-consent-ui';
import { ConsentTrackingContext } from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import {
	useActiveUI,
	useHasConsentUI,
	useTranslations as useKernelTranslations,
	useModel,
	usePolicyRule,
} from '~/hooks';
import { useIABPolicyGuard } from '~/hooks/use-iab-policy-guard';
import { useLateEntry } from '~/hooks/use-late-entry';
import { useTextDirection } from '~/hooks/use-text-direction';
import type { CSSPropertiesWithVars } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { defaultTranslationConfig } from '~/utils/default-translation-config';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { FIRST_PAINT_SHEETS } from '../../shared/first-paint-sheets';
import { StreamedConsentSurface } from '../../shared/streamed-surface';
import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import {
	ConsentBannerSurfaceContext,
	useConsentBannerSurface,
} from '../surface-context';
import type { ConsentBannerSurface } from '../surface-context';
import { EarlyTapScript } from './early-tap-script';
import { Overlay } from './overlay';

const DEFAULT_MODELS: C15tCoreTypes.Model[] = ['opt-in', 'opt-out'];

const getBannerAnimationClass = (
	disableAnimation: boolean | undefined
): string => {
	if (disableAnimation) {
		return '';
	}
	return `${styles.bannerVisible} ${styles.bannerEntering}`;
};

interface ConsentBannerRootProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;

	noStyle?: boolean;

	disableAnimation?: boolean;

	scrollLock?: boolean;

	trapFocus?: boolean;

	models?: C15tCoreTypes.Model[];

	uiSource?: string;

	variant?: PromptVariant;

	position?: PromptPosition;

	blocking?: boolean;
}

const ConsentBannerRootChildren = createForwardRef<
	HTMLDivElement,
	ConsentBannerRootChildrenProps
>(
	(
		{
			asChild: _asChild,
			children,
			className,
			style,
			className: forwardedClassName,
			disableAnimation,
			noStyle,
			models = DEFAULT_MODELS,
			...props
		}: ConsentBannerRootChildrenProps & {
			style?: CSSProperties;
			className?: string;
		},
		ref
	) => {
		useIABPolicyGuard();
		const activeUI = useActiveUI();
		const { components } = useUIConfig();
		const hasConsentUI = useHasConsentUI();
		const model = useModel() ?? 'opt-in';
		const policy = usePolicyRule();
		const surface = useConsentBannerSurface();
		const translations = useKernelTranslations();
		const textDirection = useTextDirection(
			translations?.language ?? defaultTranslationConfig.defaultLanguage
		);
		const sheetsReady = useSurfaceSheetsReady(FIRST_PAINT_SHEETS, noStyle);
		const shouldShowBanner =
			sheetsReady &&
			hasConsentUI &&
			activeUI === 'banner' &&
			models.includes(model);
		const lateEntry = useLateEntry(shouldShowBanner) && !disableAnimation;
		const contentStyle = mergeSlotProps(components?.banner?.root, {
			baseClassName: styles.root,
			className: className || forwardedClassName,
			noStyle,
			style: style as CSSPropertiesWithVars<Record<string, never>>,
			...props,
		});

		const finalClassName = noStyle
			? contentStyle.className || ''
			: `${contentStyle.className || ''} ${getBannerAnimationClass(disableAnimation)}`;
		return shouldShowBanner ? (
			<>
				<EarlyTapScript />
				<SurfaceStyles
					sheets={FIRST_PAINT_SHEETS}
					noStyle={noStyle}
				/>
				<Overlay />
				<div
					ref={ref}
					{...contentStyle}
					className={finalClassName}
					data-variant={surface.variant}
					data-position={surface.position}
					data-blocking={surface.blocking ? 'true' : undefined}
					data-prompt={policy.prompt}
					data-model={policy.model}
					data-entry={lateEntry ? 'late' : undefined}
					data-testid="consent-banner-root"
					dir={textDirection}
				>
					{children}
				</div>
			</>
		) : null;
	}
);
const ConsentBannerRootContent: FC<ConsentBannerRootProps> = ({
	children,
	className,
	noStyle,
	disableAnimation,
	scrollLock,
	trapFocus,
	models,
	uiSource,
	variant,
	position,
	blocking,
	...props
}) => {
	const { banner } = useHeadlessConsentUI({
		prompt: { blocking, position, scrollLock, trapFocus, variant },
	});
	const resolvedScrollLock = banner.scrollLock;
	const resolvedTrapFocus = banner.trapFocus;
	const contextValue = useMemo(
		() => ({
			disableAnimation,
			noStyle,
			scrollLock: resolvedScrollLock,
			trapFocus: resolvedTrapFocus,
		}),
		[disableAnimation, noStyle, resolvedScrollLock, resolvedTrapFocus]
	);
	const surfaceValue = useMemo<ConsentBannerSurface>(
		() => ({
			blocking: banner.blocking,
			position: banner.position,
			positionSource: banner.positionSource,
			variant: banner.variant,
		}),
		[banner.blocking, banner.position, banner.positionSource, banner.variant]
	);
	const trackingContextValue = useMemo(
		() => ({ uiSource: uiSource ?? 'banner' }),
		[uiSource]
	);

	return (
		<ConsentTrackingContext.Provider value={trackingContextValue}>
			<LocalThemeContext.Provider value={contextValue}>
				<ConsentBannerSurfaceContext.Provider value={surfaceValue}>
					<ConsentBannerRootChildren
						disableAnimation={disableAnimation}
						className={className}
						noStyle={noStyle}
						models={models}
						{...props}
					>
						{children}
					</ConsentBannerRootChildren>
				</ConsentBannerSurfaceContext.Provider>
			</LocalThemeContext.Provider>
		</ConsentTrackingContext.Provider>
	);
};

interface ConsentBannerRootChildrenProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;

	noStyle?: boolean;

	asChild?: boolean;

	disableAnimation?: boolean;

	models?: C15tCoreTypes.Model[];
}

ConsentBannerRootChildren.displayName = 'ConsentBannerRootChildren';

const ConsentBannerRoot: FC<ConsentBannerRootProps> = (props) => (
	<StreamedConsentSurface>
		<ConsentBannerRootContent {...props} />
	</StreamedConsentSurface>
);

const Root = ConsentBannerRoot;

export { ConsentBannerRoot, Root };
