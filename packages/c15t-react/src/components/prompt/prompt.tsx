'use client';

import type * as C15tCoreTypes from '@c15t/core';
import type { PromptPosition, PromptVariant } from '@c15t/core';
import actionStyles from '@c15t/ui/styles/components/consent-actions';
import styles from '@c15t/ui/styles/components/consent-banner';
import type { SurfacePresentation } from '@c15t/ui/utils';
import { Fragment } from 'react';
import type { FC, ReactNode } from 'react';

import { useHeadlessConsentUI } from '~/component-hooks/use-headless-consent-ui';
import { Box } from '~/components/shared/primitives/box';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';
import { BrandingLink } from '~/components/shared/ui/branding';
import { useComponentConfig } from '~/hooks/use-component-config';
import { useIABPolicyGuard } from '~/hooks/use-iab-policy-guard';

import { StreamedConsentSurface } from '../shared/streamed-surface';
import { ConsentBannerRoot } from './atoms/root';
import {
	ConsentBannerAcceptButton,
	ConsentBannerCard,
	ConsentBannerCustomizeButton,
	ConsentBannerDescription,
	ConsentBannerDismissButton,
	ConsentBannerFooter,
	ConsentBannerFooterSubGroup,
	ConsentBannerHeader,
	ConsentBannerRejectButton,
	ConsentBannerRights,
	ConsentBannerTitle,
} from './components';
import { ErrorBoundary } from './error-boundary';

export type ConsentBannerButton =
	| 'reject'
	| 'accept'
	| 'customize'
	| 'dismiss'
	| 'save';

export type ConsentBannerLayout = (
	| ConsentBannerButton
	| ConsentBannerButton[]
)[];

export interface ConsentBannerProps {
	noStyle?: boolean;

	title?: ReactNode;

	description?: ReactNode;

	rejectButtonText?: ReactNode;

	customizeButtonText?: ReactNode;

	acceptButtonText?: ReactNode;

	dismissButtonText?: ReactNode;

	scrollLock?: boolean;

	trapFocus?: boolean;

	disableAnimation?: boolean;

	legalLinks?: InlineLegalLinksProps['links'];

	hideBranding?: boolean;

	layout?: ConsentBannerLayout;

	direction?: SurfacePresentation['direction'];

	primaryButton?: ConsentBannerButton | ConsentBannerButton[];

	models?: C15tCoreTypes.Model[];

	uiSource?: string;

	variant?: PromptVariant;

	position?: PromptPosition;

	blocking?: boolean;
}

const ConsentBannerContent: FC<ConsentBannerProps> = ({
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	title,
	description,
	rejectButtonText,
	customizeButtonText,
	acceptButtonText,
	dismissButtonText,
	legalLinks,
	hideBranding = false,
	layout,
	direction,
	primaryButton,
	models,
	uiSource,
	variant,
	position,
	blocking,
}) => {
	useIABPolicyGuard();
	const primaryActions =
		typeof primaryButton === 'string' ? [primaryButton] : primaryButton;
	const { banner } = useHeadlessConsentUI({
		prompt: {
			blocking,
			direction,
			layout,
			position,
			primaryActions,
			scrollLock: localScrollLock,
			trapFocus: localTrapFocus,
			variant,
		},
	});

	const resolvedScrollLock = banner.scrollLock;

	const config = useComponentConfig({
		disableAnimation: localDisableAnimation,
		noStyle: localNoStyle,
		scrollLock: resolvedScrollLock,
		trapFocus: banner.trapFocus,
	});

	const { orderedActions } = banner;
	const allowedActions = new Set(orderedActions);
	const resolvedLayout = banner.actionGroups;
	const resolvedDirection = banner.direction;
	const { shouldFillActions } = banner;

	const renderButton = (type: ConsentBannerButton, className?: string) => {
		if (!allowedActions.has(type)) {
			return null;
		}

		const isPrimary = banner.primaryActions.includes(type);

		switch (type) {
			case 'reject':
				return (
					<ConsentBannerRejectButton
						consentAction="reject"
						isPrimary={isPrimary}
						className={className}
						data-action="reject"
						data-testid="consent-banner-reject-button"
					>
						{rejectButtonText}
					</ConsentBannerRejectButton>
				);
			case 'accept':
				return (
					<ConsentBannerAcceptButton
						consentAction="accept"
						isPrimary={isPrimary}
						className={className}
						data-action="accept"
						data-testid="consent-banner-accept-button"
					>
						{acceptButtonText}
					</ConsentBannerAcceptButton>
				);
			case 'customize':
				return (
					<ConsentBannerCustomizeButton
						consentAction="customize"
						isPrimary={isPrimary}
						className={className}
						data-action="customize"
						data-testid="consent-banner-customize-button"
					>
						{customizeButtonText}
					</ConsentBannerCustomizeButton>
				);
			case 'dismiss':
				return (
					<ConsentBannerDismissButton
						consentAction="dismiss"
						isPrimary={isPrimary}
						className={className}
						data-action="dismiss"
						data-testid="consent-banner-dismiss-button"
					>
						{dismissButtonText}
					</ConsentBannerDismissButton>
				);
			case 'save':
				return null;
			default: {
				const _exhaustive: never = type;
				throw new Error(`Unhandled consent banner button type: ${_exhaustive}`);
			}
		}
	};

	return (
		<ErrorBoundary
			fallback={<div>Something went wrong with the Consent Banner.</div>}
		>
			<ConsentBannerRoot
				{...config}
				models={models}
				uiSource={uiSource}
				variant={variant}
				position={position}
				blocking={blocking}
			>
				<Box
					baseClassName={styles.cardShell}
					slotKey="banner.cardShell"
				>
					<BrandingLink
						hideBranding={hideBranding}
						variant="banner-tag"
						slotContext="banner"
						data-testid="consent-banner-branding"
					/>
					<ConsentBannerCard>
						<ConsentBannerHeader>
							<ConsentBannerTitle>{title}</ConsentBannerTitle>
							<ConsentBannerDescription legalLinks={legalLinks}>
								{description}
							</ConsentBannerDescription>
						</ConsentBannerHeader>
						<ConsentBannerFooter
							className={actionStyles.actionRoot}
							data-direction={resolvedDirection}
							data-fill={shouldFillActions ? true : undefined}
							data-split={
								resolvedLayout.length > 1 && !shouldFillActions
									? true
									: undefined
							}
						>
							<ConsentBannerRights rights={banner.preferenceControls} />
							{resolvedLayout.map((item, index) => {
								if (Array.isArray(item)) {
									const filteredItems = item.filter((subItem) =>
										allowedActions.has(subItem)
									);
									if (filteredItems.length === 0) {
										return null;
									}
									const groupKey = item.join('-');
									return (
										<ConsentBannerFooterSubGroup
											key={groupKey ? `group-${groupKey}` : `group-${index}`}
											className={actionStyles.actionGroup}
											data-direction={resolvedDirection}
											data-fill={shouldFillActions ? true : undefined}
										>
											{filteredItems.map((subItem) => (
												<Fragment key={subItem}>
													{renderButton(subItem)}
												</Fragment>
											))}
										</ConsentBannerFooterSubGroup>
									);
								}
								if (!allowedActions.has(item)) {
									return null;
								}
								return <Fragment key={item}>{renderButton(item)}</Fragment>;
							})}
						</ConsentBannerFooter>
					</ConsentBannerCard>
				</Box>
			</ConsentBannerRoot>
		</ErrorBoundary>
	);
};

export const ConsentBanner: FC<ConsentBannerProps> = (props) => (
	<StreamedConsentSurface>
		<ConsentBannerContent {...props} />
	</StreamedConsentSurface>
);

