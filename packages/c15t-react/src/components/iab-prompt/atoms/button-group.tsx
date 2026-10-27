'use client';

import actionStyles from '@c15t/ui/styles/components/consent-actions';
import { forwardRef as createForwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

interface IABConsentBannerButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}

const IABConsentBannerButtonGroup = createForwardRef<
	HTMLDivElement,
	IABConsentBannerButtonGroupProps
>(({ children, className, ...props }, ref) => (
	<div
		ref={ref}
		className={
			className
				? `${actionStyles.actionGroup} ${className}`
				: actionStyles.actionGroup
		}
		data-direction="row"
		{...props}
	>
		{children}
	</div>
));

IABConsentBannerButtonGroup.displayName = 'IABConsentBannerButtonGroup';

const IABConsentBannerFooterSpacer = createForwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={className}
		{...props}
	/>
));

IABConsentBannerFooterSpacer.displayName = 'IABConsentBannerFooterSpacer';

export { IABConsentBannerButtonGroup, IABConsentBannerFooterSpacer };
