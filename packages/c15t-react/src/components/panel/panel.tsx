'use client';

import type * as C15tCoreTypes from '@c15t/core';
import type { FC } from 'react';

import { ConsentDialogTrigger } from '~/components/panel-trigger';
import type { ConsentDialogTriggerProps } from '~/components/panel-trigger';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';
import { useActiveUI } from '~/hooks';
import { useComponentConfig } from '~/hooks/use-component-config';

import { ConsentCustomizationCard } from './atoms/card';
import { Root as ConsentDialogRoot } from './atoms/root';

export interface ConsentDialogProps {
	theme?: never;

	disableAnimation?: boolean;

	noStyle?: boolean;

	scrollLock?: boolean;

	trapFocus?: boolean;

	open?: boolean;

	legalLinks?: InlineLegalLinksProps['links'];

	hideBranding?: boolean;

	showTrigger?: boolean | ConsentDialogTriggerProps;

	models?: C15tCoreTypes.Model[];

	uiSource?: string;
}

export const ConsentDialog: FC<ConsentDialogProps> = ({
	open,
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	hideBranding,
	legalLinks,
	showTrigger = false,
	models,
	uiSource,
}) => {
	const activeUI = useActiveUI();

	const config = useComponentConfig({
		disableAnimation: localDisableAnimation,
		noStyle: localNoStyle,
	});

	const rootProps = {
		open: open ?? activeUI === 'dialog',
		...config,
		models,
		scrollLock: localScrollLock,
		trapFocus: localTrapFocus,
		uiSource,
	};

	const triggerProps: ConsentDialogTriggerProps | null =
		// oxlint-disable-next-line no-nested-ternary -- Preserve established branch order and control flow.
		showTrigger === true
			? // oxlint-disable-next-line no-inline-comments -- Preserve declaration order, interface shape, and public compatibility.
				{}
			: showTrigger === false
				? null
				: showTrigger;

	return (
		<>
			{triggerProps && <ConsentDialogTrigger {...triggerProps} />}
			<ConsentDialogRoot {...rootProps}>
				<ConsentCustomizationCard
					noStyle={rootProps.noStyle}
					legalLinks={legalLinks}
					hideBranding={hideBranding}
				/>
			</ConsentDialogRoot>
		</>
	);
};
