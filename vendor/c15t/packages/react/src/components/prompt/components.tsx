import type { PolicyRight } from '@c15t/schema/types';
import actionStyles from '@c15t/ui/styles/components/consent-actions';
import styles from '@c15t/ui/styles/components/consent-banner';
import { forwardRef as createForwardRef, isValidElement, useRef } from 'react';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';

import { useConsentLabels } from '~/component-hooks/use-consent-labels';
import { useHeadlessConsentUI } from '~/component-hooks/use-headless-consent-ui';
import { useComposedRefs } from '~/components/shared/libs/compose-refs';
import { Slot } from '~/components/shared/libs/slot';
import { usePolicyRule, useSetActiveUI } from '~/hooks';
import { useFocusTrap } from '~/hooks/use-focus-trap';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/ui-config-context';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { Box } from '../shared/primitives/box';
import type { BoxProps } from '../shared/primitives/box';
import { ConsentButton } from '../shared/primitives/button';
import type { ConsentButtonProps } from '../shared/primitives/button.types';
import type { InlineLegalLinksProps } from '../shared/primitives/legal-links';
import { InlineLegalLinks } from '../shared/primitives/legal-links';
import { useConsentBannerSurface } from './surface-context';
import { useBannerCopy } from './use-banner-copy';

const CONSENT_BANNER_TITLE_NAME = 'ConsentBannerTitle';
const CONSENT_BANNER_DESCRIPTION_NAME = 'ConsentBannerDescription';
const CONSENT_BANNER_FOOTER_NAME = 'ConsentBannerFooter';
const CONSENT_BANNER_CARD_NAME = 'ConsentBannerCard';
const CONSENT_BANNER_HEADER_NAME = 'ConsentBannerHeader';
const CONSENT_BANNER_FOOTER_SUB_GROUP_NAME = 'ConsentBannerFooterSubGroup';
const CONSENT_BANNER_REJECT_BUTTON_NAME = 'ConsentBannerRejectButton';
const CONSENT_BANNER_CUSTOMIZE_BUTTON_NAME = 'ConsentBannerCustomizeButton';
const CONSENT_BANNER_ACCEPT_BUTTON_NAME = 'ConsentBannerAcceptButton';
const CONSENT_BANNER_DISMISS_BUTTON_NAME = 'ConsentBannerDismissButton';
const CONSENT_BANNER_RIGHTS_NAME = 'ConsentBannerRights';
const CONSENT_BANNER_RIGHT_LINK_NAME = 'ConsentBannerRightLink';

export type ConsentBannerRight = Exclude<PolicyRight, 'disclosure'>;

const ConsentBannerTitle = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, asChild, ...props }, ref) => {
	const { title } = useBannerCopy();
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.title}
			data-testid="consent-banner-title"
			slotKey="banner.title"
			{...props}
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<h2>{children ?? title}</h2>
			)}
		</Box>
	);
});

ConsentBannerTitle.displayName = CONSENT_BANNER_TITLE_NAME;

const ConsentBannerDescription = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'> & {
		legalLinks?: InlineLegalLinksProps['links'];
	}
>(
	(
		{ children, legalLinks, asChild, className, style, noStyle, ...props },
		ref
	) => {
		const { description } = useBannerCopy();
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const context = 'banner';
		const descriptionProps = mergeSlotProps(
			components?.description?.[context],
			{
				baseClassName: styles.description,
				className,
				'data-context': context,
				'data-testid': 'consent-banner-description',
				noStyle: noStyle ?? contextNoStyle,
				style,
				...props,
			}
		);

		if (asChild && isValidElement(children)) {
			return (
				<Slot
					ref={ref as Ref<HTMLDivElement>}
					{...descriptionProps}
				>
					{children}
				</Slot>
			);
		}

		return (
			<div
				ref={ref as Ref<HTMLDivElement>}
				{...descriptionProps}
			>
				{children ?? description}
				<InlineLegalLinks
					links={legalLinks}
					context="banner"
					testIdPrefix="consent-banner-legal-link"
				/>
			</div>
		);
	}
);

ConsentBannerDescription.displayName = CONSENT_BANNER_DESCRIPTION_NAME;

const ConsentBannerFooter = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, className, style, ...props }, ref) => {
	const { components } = useUIConfig();
	const { noStyle } = useTheme();
	const actionProps = mergeSlotProps(components?.banner?.actions, {
		baseClassName: className,
		noStyle,
		style,
		...props,
	});

	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.footer}
			data-testid="consent-banner-footer"
			slotKey="banner.footer"
			{...actionProps}
		>
			{children}
		</Box>
	);
});

ConsentBannerFooter.displayName = CONSENT_BANNER_FOOTER_NAME;

const ConsentBannerCard = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => {
	const { blocking } = useConsentBannerSurface();
	const { title } = useBannerCopy();
	const cardRef = useRef<HTMLDivElement>(null);
	const composedRef = useComposedRefs(cardRef, ref);

	const shouldTrapFocus = blocking;
	useFocusTrap(shouldTrapFocus, cardRef);

	return (
		<Box
			ref={composedRef}
			tabIndex={-1}
			baseClassName={styles.card}
			data-testid="consent-banner-card"
			slotKey="banner.card"
			aria-label={props['aria-label'] || title}
			aria-modal={blocking ? 'true' : undefined}
			role={blocking ? 'dialog' : 'region'}
			{...props}
		>
			{children}
		</Box>
	);
});

ConsentBannerCard.displayName = CONSENT_BANNER_CARD_NAME;

const ConsentBannerHeader = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.header}
		data-testid="consent-banner-header"
		slotKey="banner.header"
		{...props}
	>
		{children}
	</Box>
));

ConsentBannerHeader.displayName = CONSENT_BANNER_HEADER_NAME;

const ConsentBannerFooterSubGroup = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={actionStyles.actionGroup}
		data-testid="consent-banner-footer-sub-group"
		slotKey="banner.actionGroup"
		{...props}
	>
		{children}
	</Box>
));

ConsentBannerFooterSubGroup.displayName = CONSENT_BANNER_FOOTER_SUB_GROUP_NAME;

const ConsentBannerRejectButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="reject-consent"
			consentAction="reject"
			data-testid="consent-banner-reject-button"
			closeConsentBanner
			{...props}
		>
			{children ?? labels.actions.reject}
		</ConsentButton>
	);
});

ConsentBannerRejectButton.displayName = CONSENT_BANNER_REJECT_BUTTON_NAME;

const ConsentBannerCustomizeButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="open-consent-dialog"
			consentAction="customize"
			data-testid="consent-banner-customize-button"
			{...props}
		>
			{children ?? labels.actions.customize}
		</ConsentButton>
	);
});

ConsentBannerCustomizeButton.displayName = CONSENT_BANNER_CUSTOMIZE_BUTTON_NAME;

const ConsentBannerAcceptButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	const { noStyle } = useTheme();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="accept-consent"
			consentAction="accept"
			data-testid="consent-banner-accept-button"
			closeConsentBanner
			noStyle={noStyle}
			{...props}
		>
			{children ?? labels.actions.accept}
		</ConsentButton>
	);
});

ConsentBannerAcceptButton.displayName = CONSENT_BANNER_ACCEPT_BUTTON_NAME;

const ConsentBannerDismissButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	const { noStyle } = useTheme();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="dismiss-notice"
			consentAction="dismiss"
			data-action="dismiss"
			data-testid="consent-banner-dismiss-button"
			noStyle={noStyle}
			{...props}
		>
			{children ?? labels.actions.dismiss}
		</ConsentButton>
	);
});

ConsentBannerDismissButton.displayName = CONSENT_BANNER_DISMISS_BUTTON_NAME;

export interface ConsentBannerRightLinkProps extends Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	'children' | 'type'
> {
	right: ConsentBannerRight;
	children?: ReactNode;
	asChild?: boolean;
	noStyle?: boolean;
}

const ConsentBannerRightLink = createForwardRef<
	HTMLButtonElement,
	ConsentBannerRightLinkProps
>(
	(
		{ right, children, asChild, className, style, noStyle, onClick, ...props },
		ref
	) => {
		const labels = useConsentLabels();
		const policy = usePolicyRule();
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const setActiveUI = useSetActiveUI();
		const label = labels.preferenceControls[right];
		const mergedProps = mergeSlotProps(
			getSlotProps(components, 'banner.rightLink'),
			{
				baseClassName: styles.rightLink,
				className,
				noStyle: noStyle ?? contextNoStyle,
				style,
			}
		);
		const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
			onClick?.(event);
			if (!event.defaultPrevented) {
				setActiveUI('dialog');
			}
		};
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp
				ref={ref as Ref<HTMLButtonElement>}
				type={asChild ? undefined : 'button'}
				{...mergedProps}
				data-action="right"
				data-right={right}
				data-c15t-rights={policy.rights.join(' ')}
				data-testid={`consent-banner-right-link-${right}`}
				onClick={handleClick}
				{...props}
			>
				{children ?? label}
			</Comp>
		);
	}
);

ConsentBannerRightLink.displayName = CONSENT_BANNER_RIGHT_LINK_NAME;

export interface ConsentBannerRightsProps extends Omit<BoxProps, 'slotKey'> {
	rights?: readonly PolicyRight[];
}

const ConsentBannerRights = createForwardRef<
	HTMLDivElement,
	ConsentBannerRightsProps
>(({ rights, children, ...props }, ref) => {
	const { banner } = useHeadlessConsentUI();
	const resolvedRights = (rights ?? banner.preferenceControls).filter(
		(right): right is ConsentBannerRight => right !== 'disclosure'
	);
	if (children === undefined && resolvedRights.length === 0) {
		return null;
	}
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.rights}
			data-testid="consent-banner-rights"
			slotKey="banner.rights"
			{...props}
		>
			{children ??
				resolvedRights.map((right) => (
					<ConsentBannerRightLink
						key={right}
						right={right}
					/>
				))}
		</Box>
	);
});

ConsentBannerRights.displayName = CONSENT_BANNER_RIGHTS_NAME;

const Title = ConsentBannerTitle;
const Description = ConsentBannerDescription;
const Footer = ConsentBannerFooter;
const FooterSubGroup = ConsentBannerFooterSubGroup;
const Card = ConsentBannerCard;
const Header = ConsentBannerHeader;
const RejectButton = ConsentBannerRejectButton;
const CustomizeButton = ConsentBannerCustomizeButton;
const AcceptButton = ConsentBannerAcceptButton;
const DismissButton = ConsentBannerDismissButton;
const Rights = ConsentBannerRights;
const RightLink = ConsentBannerRightLink;

export {
	AcceptButton,
	Card,
	ConsentBannerAcceptButton,
	ConsentBannerCard,
	ConsentBannerCustomizeButton,
	ConsentBannerDescription,
	ConsentBannerDismissButton,
	ConsentBannerFooter,
	ConsentBannerFooterSubGroup,
	ConsentBannerHeader,
	ConsentBannerRejectButton,
	ConsentBannerRightLink,
	ConsentBannerRights,
	ConsentBannerTitle,
	CustomizeButton,
	Description,
	DismissButton,
	Footer,
	FooterSubGroup,
	Header,
	RejectButton,
	RightLink,
	Rights,
	Title,
};
