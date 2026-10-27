'use client';

import styles from '@c15t/ui/styles/components/consent-manager';
import { useMemo } from 'react';
import type { FC, ReactNode } from 'react';

import { DIALOG_SHEETS } from '~/components/shared/dialog-sheets';
import { Box } from '~/components/shared/primitives/box';
import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '~/components/shared/surface-styles';
import {
	ConsentTrackingContext,
	useConsentTracking,
} from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import type { ThemeContextValue } from '~/context/theme-context';
import { ConsentDraftProvider } from '~/draft';
import { useHasConsentUI } from '~/hooks';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useTranslationLanguage } from '~/kernel-selector';

export interface ConsentWidgetRootProps extends ThemeContextValue {
	children: ReactNode;

	useProvider?: boolean;

	noStyle?: boolean;

	uiSource?: string;
}

const ConsentWidgetRoot: FC<ConsentWidgetRootProps> = ({
	children,
	noStyle = false,
	disableAnimation = false,
	useProvider = true,
	uiSource,
}) => {
	const language = useTranslationLanguage();
	const textDirection = useTextDirection(language);
	const parentTracking = useConsentTracking();

	const contextValue = useMemo<ThemeContextValue>(
		() => ({
			disableAnimation,
			noStyle,
		}),
		[disableAnimation, noStyle]
	);

	const resolvedUiSource = uiSource ?? parentTracking.uiSource ?? 'widget';
	const trackingContextValue = useMemo(
		() => ({ uiSource: resolvedUiSource }),
		[resolvedUiSource]
	);
	const hasConsentUI = useHasConsentUI();
	const sheetsReady = useSurfaceSheetsReady(DIALOG_SHEETS, noStyle);
	if (!(hasConsentUI && sheetsReady)) {
		return null;
	}

	const content = (
		<>
			<SurfaceStyles
				sheets={DIALOG_SHEETS}
				noStyle={noStyle}
			/>
			<Box
				baseClassName={styles.manager}
				data-testid="consent-widget-root"
				slotKey="manager.root"
				dir={textDirection}
			>
				{children}
			</Box>
		</>
	);

	if (useProvider) {
		return (
			<ConsentTrackingContext.Provider value={trackingContextValue}>
				<LocalThemeContext.Provider value={contextValue}>
					<ConsentDraftProvider>{content}</ConsentDraftProvider>
				</LocalThemeContext.Provider>
			</ConsentTrackingContext.Provider>
		);
	}

	return (
		<ConsentTrackingContext.Provider value={trackingContextValue}>
			<ConsentDraftProvider>{content}</ConsentDraftProvider>
		</ConsentTrackingContext.Provider>
	);
};

const Root = ConsentWidgetRoot;

export { ConsentWidgetRoot, Root };
