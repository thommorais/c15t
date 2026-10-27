'use client';

import * as atoms from './atoms';
import { ConsentGate as ConsentGateComponent } from './consent-gate';
import type { ConsentGateCompoundComponent } from './types';

const ConsentGate = Object.assign(ConsentGateComponent, {
	Button: atoms.ConsentGateButton,
	Root: atoms.ConsentGateRoot,
	Title: atoms.ConsentGateTitle,
}) as ConsentGateCompoundComponent;

export { ConsentGateButton, ConsentGateRoot, ConsentGateTitle } from './atoms';
export type { ConsentGateCompoundComponent, ConsentGateProps } from './types';
export { ConsentGate };
export type { FrameCompoundComponent, FrameProps } from './frame';
export { Frame, FrameButton, FrameRoot, FrameTitle } from './frame';
