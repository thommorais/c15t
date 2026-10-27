import type { ConsentKernel } from '../types';

export interface KernelIABControls {
	whenReady?: () => Promise<void>;
	setVendorConsent: (id: string | number, value: boolean) => void;
	setVendorLegitimateInterest: (id: string | number, value: boolean) => void;
	setPurposeConsent: (id: number, value: boolean) => void;
	setPurposeLegitimateInterest: (id: number, value: boolean) => void;
	setSpecialFeatureOptIn: (id: number, value: boolean) => void;
	setAdTechProviderConsent?: (id: number, value: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	save: () => Promise<void>;
}

interface Registration {
	controls?: KernelIABControls;
	listeners: Set<() => void>;
}

const registrations = new WeakMap<ConsentKernel, Registration>();

const registrationFor = (kernel: ConsentKernel): Registration => {
	let registration = registrations.get(kernel);
	if (!registration) {
		registration = { listeners: new Set() };
		registrations.set(kernel, registration);
	}
	return registration;
};

const notify = (registration: Registration): void => {
	for (const listener of registration.listeners) {
		try {
			listener();
		} catch {
		}
	}
};

export const registerIABControls = (
	kernel: ConsentKernel,
	controls: KernelIABControls
): (() => void) => {
	const registration = registrationFor(kernel);
	registration.controls = controls;
	notify(registration);
	return () => {
		if (registration.controls === controls) {
			registration.controls = undefined;
			notify(registration);
		}
	};
};

export const getIABControls = (
	kernel: ConsentKernel
): KernelIABControls | undefined => registrations.get(kernel)?.controls;

export const subscribeIABControls = (
	kernel: ConsentKernel,
	listener: () => void
): (() => void) => {
	const registration = registrationFor(kernel);
	registration.listeners.add(listener);
	return () => registration.listeners.delete(listener);
};
