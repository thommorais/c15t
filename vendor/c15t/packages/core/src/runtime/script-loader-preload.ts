import { writePolicyResolutionWire } from '@c15t/schema/types';

import { evaluateConsent } from '../modules/has';
import type { ConsentKernel } from '../types';
import type {
	ConsentRuntimeModules,
	ConsentRuntimeOptions,
	RuntimePrefetch,
} from './types';

type PreloadScriptLoader = NonNullable<
	ConsentRuntimeModules['preloadScriptLoader']
>;

export const scriptLoaderRunsAtStart = function scriptLoaderRunsAtStart(
	kernel: ConsentKernel,
	options: ConsentRuntimeOptions,
	createKernel: Parameters<PreloadScriptLoader>[2],
	createPersistence: Parameters<PreloadScriptLoader>[3],
	streamed?: RuntimePrefetch
): boolean | Promise<boolean> {
	let judged = kernel;
	let folding: Promise<boolean> | undefined;
	const runs = (): boolean => {
		const snapshot = judged.getSnapshot();
		const now = Date.now();
		return (options.scripts ?? []).some(
			(script) =>
				script.alwaysLoad === true || evaluateConsent(script, snapshot, now)
		);
	};
	const dispose = (): void => {
		if (judged !== kernel) {
			judged.dispose();
		}
	};
	try {
		const prefetch = streamed ?? options.prefetch;
		if (
			(options.enabled ?? true) &&
			!options.consentSource &&
			prefetch?.initialPolicyResolution
		) {
			const resolution = prefetch.initialPolicyResolution;
			const records = streamed?.initialRecords;
			const seed = streamed ? undefined : prefetch.initialRecords;
			judged = createKernel(
				Object.assign(Object.create(options) as ConsentRuntimeOptions, {
					mode: (() => ({
						init: () =>
							Promise.resolve({
								policyResolution: writePolicyResolutionWire(resolution),
								records,
							}),
					})) as unknown as ConsentRuntimeOptions['mode'],
					prefetch: { ...prefetch, initialRecords: seed },
				})
			);
			const { persistence } = options;
			if (persistence !== false) {
				const settings = typeof persistence === 'object' ? persistence : {};
				createPersistence({
					keepSubject: true,
					kernel: judged,
					now: settings.now,
					skipHydration:
						settings.skipHydration ??
						Object.keys(seed ?? {}).some((key) => key !== 'subject'),
					storageConfig: settings.storageConfig ?? options.storageConfig,
					sync: false,
				}).dispose();
			}
			let gpc: unknown;
			try {
				gpc = (navigator as { globalPrivacyControl?: unknown })
					.globalPrivacyControl;
			} catch {
			}
			if (gpc === true) {
				judged.set.privacySignals({ gpc: true });
			}
			if (records) {
				folding = (async () => {
					try {
						await judged.commands.init();
						return runs();
					} catch {
						return false;
					} finally {
						dispose();
					}
				})();
				return folding;
			}
		}
		return runs();
	} catch {
		return false;
	} finally {
		if (!folding) {
			dispose();
		}
	}
};

export const preloadScriptLoaderWith = function preloadScriptLoaderWith(
	load: () => Promise<unknown>
): PreloadScriptLoader {
	return (read, prefetch, createKernel, createPersistence) => {
		if (typeof document === 'undefined' || !read()?.[1].scripts?.length) {
			return;
		}
		const runs = (streamed?: RuntimePrefetch) => {
			const state = read();
			return (
				!!state &&
				scriptLoaderRunsAtStart(
					state[0],
					state[1],
					createKernel,
					createPersistence,
					streamed
				)
			);
		};
		void (async () => {
			try {
				if (
					runs() === true ||
					(typeof (prefetch as PromiseLike<unknown> | undefined)?.then ===
						'function' &&
						(await runs(await (prefetch as PromiseLike<RuntimePrefetch>))))
				) {
					await load();
				}
			} catch {
			}
		})();
	};
};
