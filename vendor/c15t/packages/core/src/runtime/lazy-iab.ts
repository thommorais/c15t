import type {
	ConsentRuntimeIABFactory,
	ConsentRuntimeIABHandle,
} from './types';

export type IABModuleLoader = () => Promise<{
	createIAB: ConsentRuntimeIABFactory;
}>;

export interface LazyIABFactory {
	create: ConsentRuntimeIABFactory;
	whenReady: () => Promise<void>;
}

const QUEUED_METHODS = new Set<keyof ConsentRuntimeIABHandle>([
	'acceptAll',
	'generateTCString',
	'rejectAll',
	'save',
	'setAdTechProviderConsent',
	'setPurposeConsent',
	'setPurposeLegitimateInterest',
	'setSpecialFeatureOptIn',
	'setVendorConsent',
	'setVendorLegitimateInterest',
]);

export const createLazyIABFactory = function createLazyIABFactory(
	load: IABModuleLoader
): LazyIABFactory {
	let ready: Promise<unknown> = Promise.resolve();

	const create: ConsentRuntimeIABFactory = function create(options) {
		let inner: ConsentRuntimeIABHandle | null = null;
		let disposed = false;
		let failed = false;

		const pending = (async () => {
			try {
				const { createIAB } = await load();
				if (disposed) {
					return;
				}
				inner = createIAB(options);
			} catch {
				failed = true;
			}
		})();
		const previous = ready;
		ready = (async () => {
			await previous;
			await pending;
		})();

		return new Proxy({} as ConsentRuntimeIABHandle, {
			get(_target, property) {
				if (property === 'dispose') {
					return () => {
						disposed = true;
						inner?.dispose();
						inner = null;
					};
				}
				if (property === 'whenReady') {
					return async () => {
						await pending;
						await inner?.whenReady?.();
					};
				}
				const source = inner as Record<string, unknown> | null;
				if (source) {
					const value = source[property as string];
					return typeof value === 'function' ? value.bind(source) : value;
				}
				if (
					!failed &&
					typeof property === 'string' &&
					QUEUED_METHODS.has(property as keyof ConsentRuntimeIABHandle)
				) {
					return async (...args: unknown[]) => {
						await pending;
						const target = inner as Record<string, unknown> | null;
						const method = target?.[property];
						return typeof method === 'function'
							? method.apply(target, args)
							: undefined;
					};
				}
				return undefined;
			},
			has(_target, property) {
				return (
					property === 'dispose' ||
					property === 'whenReady' ||
					(inner
						? property in inner
						: !failed &&
							QUEUED_METHODS.has(property as keyof ConsentRuntimeIABHandle))
				);
			},
		});
	};

	return {
		create,
		async whenReady() {
			await ready;
		},
	};
};
