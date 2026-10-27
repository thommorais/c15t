import type { AllConsentNames } from '@c15t/core';
import type { ComponentPropsWithRef, FC, ReactNode } from 'react';

import type { Theme } from '~/types/theme';

import type * as Atom from './atoms';

export interface ConsentGateProps extends ComponentPropsWithRef<'div'> {
	children: ReactNode;

	category: AllConsentNames;

	placeholder?: ReactNode;

	noStyle?: boolean;

	theme?: Theme;
}

export interface ConsentGateCompoundComponent extends FC<ConsentGateProps> {
	Root: typeof Atom.ConsentGateRoot;
	Title: typeof Atom.ConsentGateTitle;
	Button: typeof Atom.ConsentGateButton;
}
