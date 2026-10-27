import { displayedCategories } from '../consent/consent-types';
import type { AllConsentNames } from '../consent/consent-types';
import { clearKernelRecords } from '../kernel/clear-records';
import { hostExperiment, startExperiment } from '../libs/experiment';
import { generateSubjectId } from '../libs/generate-subject-id';
import { extractConsentNamesFromCondition } from '../libs/has';
import type { IframeBlockerHandle } from '../modules/iframe-blocker/types';
import { holdNetworkRequests, NOT_HELD } from '../modules/network-blocker/hold';
import type { NetworkHold } from '../modules/network-blocker/hold';
import type { PersistenceHandle } from '../modules/persistence/types';
import type { ScriptLoaderHandle } from '../modules/script-loader/types';
import { resolveWindowDebugMode } from '../modules/window-debug';
import type { HydrationRecords } from '../types';
import { stringifyRuntimeError, wireRuntimeCallbacks } from './callbacks';
import { mountRuntimeGPP } from './gpp-mount';
import { createJourneyController, withJourney } from './journey';
import { afterModuleLoaded } from './lazy-module';
import {
	createRuntimeKernel,
	hasResolvedPrefetch,
	normalizeKernelUser,
} from './runtime-kernel';
import type {
	ConsentRuntime,
	ConsentRuntimeIABHandle,
	ConsentRuntimeModules,
	ConsentRuntimeOptions,
} from './types';

export interface AssembledRuntime {
	releaseHold: () => void;
	adoptJourney: (id: string | null | undefined) => void;
	runtime: ConsentRuntime;
	stop: () => void;
}

const isRecordSeed = function isRecordSeed(
	records: HydrationRecords | undefined
): boolean {
	return Boolean(
		records && Object.keys(records).some((key) => key !== 'subject')
	);
};

export const storageFor = function storageFor(
	options: Pick<
		ConsentRuntimeOptions,
		'consentSource' | 'persistence' | 'storageConfig'
	>
): ConsentRuntimeOptions['storageConfig'] {
	return (
		(!options.consentSource && typeof options.persistence === 'object'
			? options.persistence.storageConfig
			: undefined) ?? options.storageConfig
	);
};

// oxlint-disable-next-line max-lines-per-function -- One cohesive lifecycle: construct, start, stop, dispose.
export const assembleConsentRuntime = function assembleConsentRuntime(
	options: ConsentRuntimeOptions,
	modules: ConsentRuntimeModules
): AssembledRuntime {
	const { consentSource } = options;
	const enabled = options.enabled ?? true;
	const experiment = hostExperiment(options.experiment, options.prefetch);
	const journey = createJourneyController({
		option: options.prefetch?.journey === null ? false : options.journey,
		serverId: options.prefetch?.journey?.id,
	});
	const kernel = createRuntimeKernel(options, (transport) =>
		withJourney(transport, journey)
	);
	const holdRequests = (): NetworkHold | null =>
		enabled &&
		options.networkBlocker &&
		options.networkBlocker.enabled !== false
			? holdNetworkRequests(options.networkBlocker.rules)
			: null;
	let hold = holdRequests();

	let iabHandle: ConsentRuntimeIABHandle | null = null;
	let iframeBlocker: IframeBlockerHandle | null = null;
	let persistenceHandle: PersistenceHandle | null = null;
	let started = false;
	let disposed = false;
	let adopted = false;

	const iabListeners = new Set<() => void>();
	const emitIAB = function emitIAB(handle: ConsentRuntimeIABHandle | null) {
		iabHandle = handle;
		for (const listener of iabListeners) {
			listener();
		}
	};

	const wire = (): (() => void)[] => [
		wireRuntimeCallbacks({
			callbacks: options.callbacks,
			kernel,
		}),
		modules.watchRevocationReload({
			getOnBeforeReload: () =>
				options.callbacks?.onBeforeConsentRevocationReload,
			isEnabled: () => options.reloadOnConsentRevoked !== false,
			kernel,
		}),
		kernel.events.on('init:applied', ({ snapshot }) => {
			const declared = snapshot.vendors?.declared ?? [];
			if (declared.length > 0) {
				kernel.set.registerConsentCategories(
					declared.flatMap((vendor) =>
						extractConsentNamesFromCondition(vendor.category)
					)
				);
			}
		}),
	];
	let disposers: (() => void)[] = wire();

	const runInit = async function runInit(): Promise<void> {
		if (disposed || consentSource || !enabled) {
			return;
		}
		await kernel.commands.init();
	};

	const stop = function stop(): void {
		started = false;
		for (const dispose of disposers.reverse()) {
			dispose();
		}
		disposers = [];
	};

	const runtime: ConsentRuntime = {
		clearRecords() {
			if (persistenceHandle) {
				persistenceHandle.clear();
				return;
			}
			clearKernelRecords(kernel);
		},
		get consentCategories(): AllConsentNames[] {
			const snapshot = kernel.getSnapshot();
			return displayedCategories(
				snapshot.evaluationPolicy.choiceScope ?? snapshot.policyRule.scope
			);
		},
		dispose() {
			disposed = true;
			stop();
			kernel.dispose();
			hold?.block();
			hold = null;
			iabListeners.clear();
		},
		experiment,
		get iab() {
			return iabHandle;
		},
		async identify(user) {
			const nextUser = normalizeKernelUser(user);
			if (!nextUser) {
				return;
			}
			try {
				await kernel.commands.identify(nextUser);
			} catch {
			}
		},
		kernel,
		processIframes() {
			iframeBlocker?.processAllIframes();
		},
		reconcileStorage() {
			return persistenceHandle?.reconcile() ?? false;
		},
		reinit: runInit,
		get scripts() {
			return options.scripts ?? [];
		},
		setConsentCategories(categories) {
			kernel.set.consentCategories(categories);
		},
		setLanguage(language) {
			if (language !== kernel.getSnapshot().overrides.language) {
				kernel.set.language(language);
				void runInit();
			}
		},
		setOverrides(overrides) {
			kernel.set.overrides(overrides);
		},
		// oxlint-disable-next-line complexity -- Starts the runtime modules in dependency order.
		start() {
			if (started || disposed || typeof document === 'undefined') {
				return;
			}
			started = true;
			if (disposers.length === 0) {
				disposers = wire();
			}

			if (options.windowDebug !== false) {
				const windowDebug = modules.createWindowDebug({
					getHosting: () => kernel.getSnapshot().hosting,
					mode: resolveWindowDebugMode(options.mode),
					pkg: options.pkg ?? '@c15t/core',
				});
				disposers.push(() => windowDebug.dispose());
			}

			const { persistence: persistenceOption } = options;
			if (enabled && !consentSource && persistenceOption !== false) {
				const { now, skipHydration, sync } =
					typeof persistenceOption === 'object' ? persistenceOption : {};
				const seed = options.prefetch?.initialRecords;
				const seeded = skipHydration ?? isRecordSeed(seed);
				const persistence = modules.createPersistence({
					kernel,
					now,
					skipHydration: seeded,
					storageConfig: storageFor(options),
					sync,
				});
				persistenceHandle = persistence;
				disposers.push(() => {
					persistence.dispose();
					persistenceHandle = null;
				});
			}
			const { externalPermissions, subject } = kernel.getSnapshot();
			if (
				enabled &&
				!consentSource &&
				!externalPermissions &&
				!subject?.subjectId
			) {
				kernel.hydrate({
					subject: { ...subject, subjectId: generateSubjectId() },
				});
			}
			if (enabled && !consentSource) {
				disposers.push(journey.start(kernel));
			}
			if (enabled && consentSource) {
				disposers.push(modules.connectConsentSource(kernel, consentSource));
				kernel.events.emit({
					snapshot: kernel.getSnapshot(),
					type: 'init:applied',
				});
			}
			if (enabled && experiment && !consentSource) {
				disposers.push(
					startExperiment({
						experiment,
						kernel,
						presentation: options.presentation,
						storageConfig: options.storageConfig,
						theme: options.theme,
					})
				);
			}

			if (enabled && !consentSource) {
				if (hasResolvedPrefetch(options.prefetch)) {
					kernel.hydrate({
						now: adopted
							? Date.now()
							: (options.prefetch?.now ??
								kernel.getServerSnapshot().evaluatedAt),
					});
					adopted = true;
					kernel.markLive();
					const { gpc } = kernel.getSnapshot().privacySignals;
					if (gpc.detected && gpc.active) {
						kernel.set.privacySignals({ gpc: true });
					}
					kernel.events.emit({
						snapshot: kernel.getSnapshot(),
						type: 'init:applied',
					});
				} else {
					void runInit();
				}
			}

			let loader: ScriptLoaderHandle | undefined;
			if (options.scripts && options.scripts.length > 0) {
				loader = modules.createScriptLoader({
					kernel,
					nonce: options.nonce,
					onDebug: options.scriptLoader?.onDebug,
					scripts: options.scripts,
				});
				const mounted = loader;
				disposers.push(() => mounted.dispose());
			}

			if (enabled && options.networkBlocker) {
				const claimed = hold ?? holdRequests() ?? NOT_HELD;
				hold = null;
				const blocker = modules.createNetworkBlocker({
					enabled: options.networkBlocker.enabled,
					hold: claimed,
					kernel,
					logBlockedRequests: options.networkBlocker.logBlockedRequests,
					onRequestBlocked: options.networkBlocker.onRequestBlocked,
					rules: options.networkBlocker.rules,
				});
				afterModuleLoaded(blocker, claimed.fail);
				disposers.push(() => {
					blocker.dispose();
					claimed.block();
				});
			}

			if (enabled && options.iframeBlocker !== false) {
				const blocker = modules.createIframeBlocker({
					kernel,
					...(options.iframeBlocker ?? {}),
				});
				iframeBlocker = blocker;
				disposers.push(() => {
					iframeBlocker = null;
					blocker.dispose();
				});
			}

			const { createIAB, iab } = options;
			if (enabled && createIAB && iab && !consentSource && modules.mountIAB) {
				disposers.push(
					modules.mountIAB({ createIAB, iab, kernel, onHandle: emitIAB })
				);
			}
			const { gpp, loadGPP } = options;
			if (enabled && gpp && loadGPP && !consentSource) {
				disposers.push(
					mountRuntimeGPP({
						gpp,
						kernel,
						loadGPP,
						onError: (error) =>
							options.callbacks?.onError?.({
								error: stringifyRuntimeError(error),
							}),
					})
				);
			}
			const { clearOnRevocation } = options;
			if (enabled && clearOnRevocation) {
				let cleanup: { dispose: () => void } | null = null;
				let cancelled = false;
				const mountCleanup = () => {
					if (!cancelled) {
						cleanup = modules.createClearOnRevocation({
							config: clearOnRevocation,
							kernel,
							storageConfig: storageFor(options),
						});
					}
				};
				disposers.push(() => {
					cancelled = true;
					cleanup?.dispose();
				});
				afterModuleLoaded(loader, mountCleanup);
			}
		},
		get started() {
			return started;
		},
		subscribe(listener) {
			iabListeners.add(listener);
			return function unsubscribeIAB() {
				iabListeners.delete(listener);
			};
		},
	};
	const releaseHold = function releaseHold(): void {
		const held = hold;
		hold = null;
		held?.release()();
	};
	return { adoptJourney: journey.adopt, releaseHold, runtime, stop };
};
