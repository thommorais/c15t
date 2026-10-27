'use client';

import type { FC } from 'react';

import { Overlay } from './atoms/overlay';
import { Root } from './atoms/root';
import {
	AcceptButton,
	Card,
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
} from './components';
import { PolicyActions } from './policy-actions';
import { ConsentBanner as ConsentBannerComponent } from './prompt';
import type {
	ConsentBannerButton,
	ConsentBannerLayout,
	ConsentBannerProps,
} from './prompt';

export interface ConsentBannerCompoundComponent extends FC<ConsentBannerProps> {
	Root: typeof Root;
	Card: typeof Card;
	Header: typeof Header;
	Title: typeof Title;
	Description: typeof Description;
	PolicyActions: typeof PolicyActions;
	Footer: typeof Footer;
	FooterSubGroup: typeof FooterSubGroup;
	RejectButton: typeof RejectButton;
	CustomizeButton: typeof CustomizeButton;
	AcceptButton: typeof AcceptButton;
	DismissButton: typeof DismissButton;
	Rights: typeof Rights;
	RightLink: typeof RightLink;
	Overlay: typeof Overlay;
}
const ConsentBanner = Object.assign(ConsentBannerComponent, {
	AcceptButton,
	Actions: FooterSubGroup,

	Card,
	Content: Card,
	CustomizeButton,
	Description,
	DismissButton,
	Footer,
	FooterSubGroup,
	Header,
	Overlay,
	PolicyActions,
	RejectButton,
	RightLink,
	Rights,
	Root,
	Title,
}) as ConsentBannerCompoundComponent;

export default ConsentBanner;

export { ConsentBannerOverlay, Overlay } from './atoms/overlay';
export { ConsentBannerRoot, Root } from './atoms/root';
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
	type ConsentBannerRight,
	ConsentBannerRightLink,
	type ConsentBannerRightLinkProps,
	ConsentBannerRights,
	type ConsentBannerRightsProps,
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
} from './components';
export {
	type ConsentBannerSurface,
	useConsentBannerSurface,
} from './surface-context';
export { useBannerCopy } from './use-banner-copy';
export {
	type ConsentBannerPolicyActionRenderProps,
	ConsentBannerPolicyActions,
	type ConsentBannerPolicyActionsProps,
	PolicyActions,
} from './policy-actions';
export {
	ConsentBanner,
	type ConsentBannerButton,
	type ConsentBannerLayout,
	type ConsentBannerProps,
};
