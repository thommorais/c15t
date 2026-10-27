import type { InternalKernel } from '../kernel/internals';
import type { ConsentKernel, ConsentState, Unsubscribe } from '../types';
import type { ConsentRuntimeOptions, ExternalConsentSource } from './types';

export type ConsentControlOptions = Pick<
	ConsentRuntimeOptions,
	'consentSource'
>;

export const connectConsentSource = (
	kernel: ConsentKernel,
	source: ExternalConsentSource
): Unsubscribe => {
	let disposed = false;
	const report = (error: unknown) => {
		if (!disposed) {
			(kernel as InternalKernel).events.emit({
				command: 'preferences',
				error,
				type: 'command:error',
			});
		}
	};
	const unsubscribePreferences = kernel.events.on(
		'preferences:requested',
		() => {
			void (async () => {
				try {
					await source.openPreferences();
				} catch (error) {
					report(error);
				}
			})();
		}
	);
	const sync = () => {
		if (disposed) {
			return;
		}
		let permissions: Partial<ConsentState> | null = null;
		try {
			permissions = source.getPermissions();
		} catch {
		}
		kernel.set.externalPermissions(permissions ?? {});
	};
	let unsubscribe: Unsubscribe;
	try {
		unsubscribe = source.subscribe(sync);
	} catch (error) {
		kernel.set.externalPermissions({});
		report(error);
		disposed = true;
		unsubscribePreferences();
		return () => {
		};
	}
	sync();
	return () => {
		disposed = true;
		unsubscribe();
		unsubscribePreferences();
	};
};
