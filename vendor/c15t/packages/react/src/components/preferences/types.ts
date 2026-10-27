import type { ReactNode } from 'react';

import type { InlineLegalLinksProps } from '../shared/primitives/legal-links';

export interface ConsentWidgetRootProps {
	children: ReactNode;
	useProvider?: boolean;
	disableAnimation?: boolean;

	noStyle?: boolean;

	scrollLock?: boolean;

	trapFocus?: boolean;

	uiSource?: string;
}

export interface ConsentWidgetProps extends Omit<
	ConsentWidgetRootProps,
	'children'
> {
	hideBranding?: boolean;
	legalLinks?: InlineLegalLinksProps['links'];
}
