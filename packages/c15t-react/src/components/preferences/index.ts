'use client';

import type { FC } from 'react';

import {
	Accordion,
	AccordionArrow,
	AccordionContent,
	AccordionItem,
	AccordionItems,
	AccordionTrigger,
	AccordionTriggerInner,
	Switch,
	VendorList,
} from './atoms/accordion';
import {
	AcceptAllButton,
	CustomizeButton,
	RejectButton,
	SaveButton,
} from './atoms/button';
import { Footer, FooterSubGroup } from './atoms/footer';
import { Root } from './atoms/root';
import { PolicyActions } from './policy-actions';
import { ConsentWidget as ConsentWidgetComponent } from './preferences';
import type { ConsentWidgetProps } from './types';

export type { ConsentWidgetProps };

export interface ConsentWidgetCompoundComponent extends FC<ConsentWidgetProps> {
	AccordionTrigger: typeof AccordionTrigger;
	AccordionTriggerInner: typeof AccordionTriggerInner;
	AccordionContent: typeof AccordionContent;
	AccordionArrow: typeof AccordionArrow;
	Accordion: typeof Accordion;
	Switch: typeof Switch;
	AccordionItems: typeof AccordionItems;
	AccordionItem: typeof AccordionItem;
	VendorList: typeof VendorList;
	Root: typeof Root;
	AcceptAllButton: typeof AcceptAllButton;
	CustomizeButton: typeof CustomizeButton;
	SaveButton: typeof SaveButton;
	RejectButton: typeof RejectButton;
	PolicyActions: typeof PolicyActions;
	Footer: typeof Footer;
	FooterSubGroup: typeof FooterSubGroup;
}

const ConsentWidget = Object.assign(ConsentWidgetComponent, {
	AcceptAllButton,
	Accordion,
	AccordionArrow,
	AccordionContent,
	AccordionItem,
	AccordionItems,
	AccordionTrigger,
	AccordionTriggerInner,
	CustomizeButton,
	Footer,
	FooterSubGroup,

	PolicyActions,
	RejectButton,
	Root,
	SaveButton,
	Switch,
	VendorList,
}) as ConsentWidgetCompoundComponent;

export default ConsentWidget;

export {
	Accordion,
	AccordionArrow,
	AccordionContent,
	AccordionItem,
	AccordionItems,
	AccordionTrigger,
	AccordionTriggerInner,
	ConsentWidgetAccordion,
	ConsentWidgetAccordionArrow,
	ConsentWidgetAccordionContent,
	ConsentWidgetAccordionItem,
	ConsentWidgetAccordionItems,
	ConsentWidgetAccordionTrigger,
	ConsentWidgetAccordionTriggerInner,
	ConsentWidgetSwitch,
	ConsentWidgetVendorList,
	Switch,
	VendorList,
} from './atoms/accordion';
export {
	AcceptAllButton,
	ConsentWidgetAcceptAllButton,
	ConsentWidgetCustomizeButton,
	ConsentWidgetRejectButton,
	ConsentWidgetSaveButton,
	CustomizeButton,
	RejectButton,
	SaveButton,
} from './atoms/button';
export {
	ConsentWidgetFooter,
	ConsentWidgetFooterSubGroup,
	Footer,
	FooterSubGroup,
} from './atoms/footer';
export { ConsentWidgetRoot, Root } from './atoms/root';
export {
	type ConsentWidgetPolicyActionRenderProps,
	ConsentWidgetPolicyActions,
	type ConsentWidgetPolicyActionsProps,
	PolicyActions,
} from './policy-actions';
export { ConsentWidget };
