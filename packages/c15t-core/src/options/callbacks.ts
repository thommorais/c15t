import type { ConsentState } from '../consent/compliance';
import type { KernelEvent } from '../types';

export type Callback<T = void> = (arg: T) => void;

export interface OnErrorPayload {
	error: string;
}

export type OnChoiceRecordedPayload = Omit<
	Extract<KernelEvent, { type: 'choice:recorded' }>,
	'type'
>;
export type OnPermissionsChangedPayload = Omit<
	Extract<KernelEvent, { type: 'permissions:changed' }>,
	'type'
>;
export type OnSurfaceShownPayload = Omit<
	Extract<KernelEvent, { type: 'surface:shown' }>,
	'type'
>;

export interface Callbacks {
	onChoiceRecorded?: Callback<OnChoiceRecordedPayload>;
	onPermissionsChanged?: Callback<OnPermissionsChangedPayload>;
	onSurfaceShown?: Callback<OnSurfaceShownPayload>;
	onError?: Callback<OnErrorPayload>;

	onBeforeConsentRevocationReload?: Callback<{ preferences: ConsentState }>;
}
