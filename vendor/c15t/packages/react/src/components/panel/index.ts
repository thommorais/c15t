'use client';

import type { FC } from 'react';

import {
	Card,
	ConsentCustomizationCard,
	ConsentDialogContent,
	ConsentDialogFooter,
	ConsentDialogHeader,
	ConsentDialogHeaderDescription,
	ConsentDialogHeaderTitle,
	Content,
	Footer,
	Header,
	HeaderDescription,
	HeaderTitle,
} from './atoms/card';
import { Overlay } from './atoms/overlay';
import { Root } from './atoms/root';
import { ConsentDialog as ConsentDialogComponent } from './panel';
import type { ConsentDialogProps } from './panel';

export type { ConsentDialogProps };

export interface ConsentDialogCompoundComponent extends FC<ConsentDialogProps> {
	Card: typeof Card;
	Header: typeof Header;
	HeaderTitle: typeof HeaderTitle;
	HeaderDescription: typeof HeaderDescription;
	Content: typeof Content;
	Footer: typeof Footer;
	ConsentCustomizationCard: typeof ConsentCustomizationCard;
	ConsentDialogFooter: typeof ConsentDialogFooter;
	ConsentDialogHeader: typeof ConsentDialogHeader;
	ConsentDialogHeaderTitle: typeof ConsentDialogHeaderTitle;
	ConsentDialogHeaderDescription: typeof ConsentDialogHeaderDescription;
	ConsentDialogContent: typeof ConsentDialogContent;
	Overlay: typeof Overlay;
	Root: typeof Root;
}

const ConsentDialog = Object.assign(ConsentDialogComponent, {
	Card,
	ConsentCustomizationCard,
	ConsentDialogContent,
	ConsentDialogFooter,
	ConsentDialogHeader,
	ConsentDialogHeaderDescription,
	ConsentDialogHeaderTitle,
	Content,
	Footer,
	Header,
	HeaderDescription,
	HeaderTitle,
	Overlay,
	Root,
}) as ConsentDialogCompoundComponent;

export default ConsentDialog;

export {
	Card,
	ConsentCustomizationCard,
	ConsentDialogContent,
	ConsentDialogFooter,
	ConsentDialogHeader,
	ConsentDialogHeaderDescription,
	ConsentDialogHeaderTitle,
	Content,
	Footer,
	Header,
	HeaderDescription,
	HeaderTitle,
} from './atoms/card';
export { ConsentDialogOverlay, Overlay } from './atoms/overlay';
export { ConsentDialogRoot, Root } from './atoms/root';
export { ConsentDialog };
