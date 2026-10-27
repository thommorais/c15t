'use client';

import styles from '@c15t/ui/styles/components/consent-dialog-trigger';
import { isValidElement } from 'react';
import type { ReactNode } from 'react';

import { BrandingCompactLogo } from '~/components/shared/ui/branding';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/ui-config-context';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import type { TriggerIcon as TriggerIconType } from '../types';
import { useTriggerContext } from './root';
import { FingerprintIcon, SettingsIcon } from './trigger-icons';

export interface TriggerIconProps {
	icon?: TriggerIconType;

	className?: string;

	noStyle?: boolean;
}

export const TriggerIcon = ({
	icon = 'branding',
	className,
	noStyle,
}: TriggerIconProps): ReactNode => {
	const { components } = useUIConfig();
	const { noStyle: contextNoStyle } = useTheme();
	const { branding } = useTriggerContext();
	const iconProps = mergeSlotProps(components?.trigger?.icon, {
		baseClassName: styles.icon,
		className,
		noStyle: noStyle ?? contextNoStyle,
	});

	if (isValidElement(icon)) {
		return (
			<span
				{...iconProps}
				aria-hidden="true"
			>
				{icon}
			</span>
		);
	}

	let iconElement: ReactNode;
	switch (icon) {
		case 'fingerprint':
			iconElement = <FingerprintIcon />;
			break;
		case 'settings':
			iconElement = <SettingsIcon />;
			break;
		default:
			iconElement = <BrandingCompactLogo branding={branding} />;
	}

	return (
		<span
			{...iconProps}
			aria-hidden="true"
		>
			{iconElement}
		</span>
	);
};

TriggerIcon.displayName = 'ConsentDialogTrigger.Icon';
