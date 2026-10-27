import type { KernelOverrides } from '../types';
import type { ProviderTransportFactory } from './mode';

export interface EarlyInitMode {
	requestsInit: (overrides: Readonly<KernelOverrides>) => boolean;
	sameAs: (other: EarlyInitMode) => boolean;
}

export const earlyInitModes = new WeakMap<
	ProviderTransportFactory,
	EarlyInitMode
>();
