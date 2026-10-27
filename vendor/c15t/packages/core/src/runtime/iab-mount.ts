import type { ConsentKernel } from '../types';
import type {
	ConsentRuntimeIABFactory,
	ConsentRuntimeIABFactoryOptions,
	ConsentRuntimeIABHandle,
	RuntimeIABOptions,
} from './types';

export interface RuntimeIABMountOptions {
	createIAB: ConsentRuntimeIABFactory;
	iab: Exclude<RuntimeIABOptions, false>;
	kernel: ConsentKernel;
	onHandle: (handle: ConsentRuntimeIABHandle | null) => void;
}

const normalizeIABOptions = function normalizeIABOptions(
	kernel: ConsentKernel,
	iab: RuntimeIABOptions | undefined
): Omit<ConsentRuntimeIABFactoryOptions, 'kernel'> | null {
	if (iab === false || !iab || iab.enabled === false) {
		return null;
	}
	const currentIab = kernel.getSnapshot().iab;
	const cmpId = iab.cmpId ?? currentIab?.cmpId;
	if (typeof cmpId !== 'number') {
		return null;
	}
	return {
		additionalConsent: iab.additionalConsent,
		cmpId,
		cmpVersion:
			typeof iab.cmpVersion === 'string'
				? Number(iab.cmpVersion)
				: iab.cmpVersion,
		customVendors: iab.customVendors ?? currentIab?.customVendors,
		gvl: iab.gvl ?? currentIab?.gvl ?? undefined,
		gvlURL: iab.gvlURL,
		isServiceSpecific: iab.isServiceSpecific,
		publisherCountryCode: iab.publisherCountryCode,
		publisherRestrictions: iab.publisherRestrictions,
		vendors: iab.vendors,
	};
};

export const mountRuntimeIAB = function mountRuntimeIAB({
	createIAB,
	iab,
	kernel,
	onHandle,
}: RuntimeIABMountOptions): () => void {
	let handle: ConsentRuntimeIABHandle | null = null;
	let mounting = false;
	const mountWhenReady = function mountWhenReady() {
		if (handle || mounting) {
			return;
		}
		const iabOptions = normalizeIABOptions(kernel, iab);
		if (iabOptions) {
			mounting = true;
			try {
				handle = createIAB({ ...iabOptions, kernel });
			} finally {
				mounting = false;
			}
			onHandle(handle);
		}
	};
	mountWhenReady();
	const unsubscribe = kernel.subscribe(mountWhenReady);
	return () => {
		unsubscribe();
		if (handle) {
			handle.dispose();
			handle = null;
			onHandle(null);
		}
	};
};
