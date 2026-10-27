import type { ConsentComponentSlotKey } from '@c15t/schema/config';
import type { ButtonMode } from '@c15t/ui/styles/primitives';
import type { ComponentRef, HTMLAttributes, MouseEvent } from 'react';

import type { CSSVariables, ExtendThemeKeys } from '~/types/theme';

export type ConsentButtonElement = ComponentRef<'button'>;

export interface ConsentButtonProps
	extends
		Omit<HTMLAttributes<HTMLButtonElement>, 'style'>,
		ExtendThemeKeys<CSSVariables> {
	slotKey?: ConsentComponentSlotKey;
	noStyle?: boolean;
	asChild?: boolean;
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	variant?: 'primary' | 'neutral';
	mode?: ButtonMode;
	consentAction?: 'accept' | 'reject' | 'customize' | 'dismiss' | 'save';
	isPrimary?: boolean;
}
