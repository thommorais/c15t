import type { CornerPosition } from '@c15t/ui/utils/trigger-utils';
import type { ReactNode } from 'react';

import type { ClassNameStyle } from '~/types/theme';

export type TriggerIcon = 'branding' | 'fingerprint' | 'settings' | ReactNode;

export type TriggerVisibility = 'always' | 'after-prompt' | 'never';

export type TriggerSize = 'sm' | 'md' | 'lg';

export type TriggerOrientation = 'horizontal' | 'vertical';

export interface ConsentDialogTriggerProps {
	icon?: TriggerIcon;

	defaultPosition?: CornerPosition;

	persistPosition?: boolean;

	ariaLabel?: string;

	className?: string;

	noStyle?: boolean;

	showWhen?: TriggerVisibility;

	size?: TriggerSize;

	onClick?: () => void;

	onPositionChange?: (position: CornerPosition) => void;
}

export interface ConsentDialogTriggerToolbarAction {
	id: string;

	label: string;

	icon: TriggerIcon;

	onSelect: () => void;

	disabled?: boolean;

	pressed?: boolean;

	className?: string;

	style?: ClassNameStyle['style'];
}

export interface ConsentDialogTriggerToolbarPreferences {
	label?: string;

	icon?: TriggerIcon;

	onSelect?: () => void;

	className?: string;

	style?: ClassNameStyle['style'];
}

export interface ConsentDialogTriggerToolbarProps extends Omit<
	ClassNameStyle,
	'baseClassName'
> {
	actions?: readonly ConsentDialogTriggerToolbarAction[];

	preferences?: ConsentDialogTriggerToolbarPreferences;

	orientation?: TriggerOrientation;

	defaultPosition?: CornerPosition;

	persistPosition?: boolean;

	ariaLabel?: string;

	showWhen?: TriggerVisibility;

	size?: TriggerSize;

	onPositionChange?: (position: CornerPosition) => void;
}

export type { CornerPosition };
