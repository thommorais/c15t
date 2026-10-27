'use client';

import { forwardRef as createForwardRef } from 'react';
import type { ReactNode, Ref } from 'react';

import { ConsentButton } from '~/components/shared/primitives/button';
import type { ConsentButtonProps } from '~/components/shared/primitives/button.types';
import { useHasConsentPreferences, usePolicyRule } from '~/hooks';

export interface ConsentDialogLinkProps extends Omit<
	ConsentButtonProps,
	'children'
> {
	children: ReactNode;
}

export const ConsentDialogLink = createForwardRef<
	HTMLButtonElement,
	ConsentDialogLinkProps
>(({ children, noStyle = true, ...props }, ref) => {
	const policy = usePolicyRule();
	const hasConsentUI = useHasConsentPreferences();
	if (!hasConsentUI) {
		return null;
	}
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="open-consent-dialog"
			noStyle={noStyle}
			data-testid="consent-dialog-link"
			data-c15t-rights={policy.rights.join(' ')}
			{...props}
		>
			{children}
		</ConsentButton>
	);
});

ConsentDialogLink.displayName = 'ConsentDialogLink';
