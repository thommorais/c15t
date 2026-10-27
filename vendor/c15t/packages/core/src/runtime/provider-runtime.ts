import type { AllConsentNames } from '../consent/consent-types';
import type { InternalKernel } from '../kernel/internals';
import { extractConsentNamesFromCondition } from '../libs/has';
import { isProductionBuild } from '../libs/is-production';
import { declareOwnedVendors, resolveVendors } from '../libs/vendors';
import { holdNetworkRequests, NOT_HELD } from '../modules/network-blocker/hold';
import type { NetworkHold } from '../modules/network-blocker/hold';
import { kernelConfigToInitResponse } from '../transports/init-output';
import type { ConsentSnapshot } from '../types';
import { assembleConsentRuntime } from './assemble';
import { afterModuleLoaded } from './lazy-module';
import type * as ProviderUpdateModule from './provider-update';
import type { ProviderUpdateHost } from './provider-update';
import {
	createRuntimeKernel,
	hasResolvedPrefetch,
	normalizeKernelUser,
} from './runtime-kernel';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
	ConsentRuntime,
	ConsentRuntimeModules,
	ConsentRuntimeOptions,
	ConsentRuntimeUpdate,
	RuntimePrefetch,
	StreamedPrefetch,
} from './types';

type Callbacks = NonNullable<ConsentRuntimeUpdate['callbacks']>;

const LIVE_OPTIONS = new Set<PropertyKey>([
	'consentCategories',
	'iframeBlocker',
	'networkBlocker',
	'nonce',
	'overrides',
	'reloadOnConsentRevoked',
	'scriptLoader',
	'scripts',
	'user',
	'vendors',
]);

const overridesKey = function overridesKey(
	overrides: ConsentRuntimeUpdate['overrides']
): string {
	return JSON.stringify(Object.entries(overrides ?? {}).sort());
};

const changed = function changed(
	applied: ConsentRuntimeUpdate,
	next: ConsentRuntimeUpdate
): boolean {
	for (const key in { ...applied, ...next }) {
		if (applied[key as 'user'] !== next[key as 'user']) {
			return true;
		}
	}
	return false;
};

const ownersOf = function ownersOf(options: ConsentRuntimeUpdate) {
	return [
		...(options.scripts ?? []),
		...(options.networkBlocker ? (options.networkBlocker.rules ?? []) : []),
	];
};

export interface ModuleSlot<Options, Handle extends { dispose: () => void }> {
	create: (options: Options) => Handle;
	factory: (options: Options) => Handle;
	inner: Handle | null;
	last: Options | null;
	standIn: Handle;
}

const moduleSlot = function moduleSlot<
	Options,
	Handle extends { dispose: () => void },
>(factory: (options: Options) => Handle): ModuleSlot<Options, Handle> {
	const slot = { factory, inner: null, last: null } as ModuleSlot<
		Options,
		Handle
	>;
	slot.standIn = new Proxy({} as Handle, {
		get: (_target, method) => {
			const { inner } = slot;
			if (typeof method === 'symbol') {
				return (inner as Record<PropertyKey, unknown> | null)?.[method];
			}
			if (method === 'dispose') {
				return () => {
					slot.inner?.dispose();
					slot.inner = null;
				};
			}
			return (...args: unknown[]) =>
				(
					slot.inner as Record<PropertyKey, (...a: unknown[]) => unknown> | null
				)?.[method]?.(...args);
		},
	});
	slot.create = (options) => {
		slot.last = options;
		slot.inner = factory(options);
		return slot.standIn;
	};
	return slot;
};

const rendersFromStream = function rendersFromStream(
	config: RuntimePrefetch | undefined,
	runsExperiment: boolean
): config is RuntimePrefetch {
	return Boolean(
		config &&
		hasResolvedPrefetch(config) &&
		!runsExperiment &&
		!config.experiment
	);
};

const settle = function settle(
	prefetch: PromiseLike<RuntimePrefetch | undefined>
): PromiseLike<RuntimePrefetch | undefined> {
	type Recorded = PromiseLike<RuntimePrefetch | undefined> & {
		status?: string;
		value?: RuntimePrefetch;
	};
	const source = prefetch as Recorded;
	if (source.status === 'fulfilled') {
		const value = source.value ?? undefined;
		return Object.assign(Promise.resolve(value), {
			status: 'fulfilled',
			value,
		});
	}
	const recorded: { settled?: Recorded } = {};
	const settled: Recorded = (async () => {
		let config: RuntimePrefetch | undefined;
		try {
			config = (await prefetch) ?? undefined;
		} catch {
		}
		if (recorded.settled) {
			recorded.settled.status = 'fulfilled';
			recorded.settled.value = config;
		}
		return config;
	})();
	settled.status = 'pending';
	recorded.settled = settled;
	return settled;
};

// oxlint-disable-next-line max-lines-per-function -- One cohesive lifecycle around two runtimes.
export const createConsentProviderRuntime =
	function createConsentProviderRuntime(
		options: ConsentProviderRuntimeOptions,
		modules: ConsentRuntimeModules
	): ConsentProviderRuntime {
		const initial = options;
		const knownPrefetch =
			typeof (initial.prefetch as PromiseLike<unknown> | undefined)?.then ===
			'function'
				? undefined
				: (initial.prefetch as RuntimePrefetch | undefined);
		let current: ConsentRuntimeUpdate = options;
		let enabled = options.enabled ?? true;
		let started = false;
		let disposed = false;
		let adoptedPrefetch: RuntimePrefetch | undefined;
		let overridesChanged = false;
		const listeners = new Set<() => void>();
		const notify = function notify() {
			for (const listener of listeners) {
				listener();
			}
		};
		const ownerSource = Symbol('consent-provider');
		const callbacks = new Proxy({} as Callbacks, {
			get: (_target, name) => current.callbacks?.[name as keyof Callbacks],
		});

		const build = function build(on: boolean) {
			let extras: (() => void)[] = [];
			const built: { runtime?: ConsentRuntime } = {};
			const { streamPrefetch } = modules;
			const pending = on && initial.prefetch !== knownPrefetch;
			if (pending && !streamPrefetch && !isProductionBuild()) {
				console.warn(
					'c15t: `prefetch` is a promise, but the runtime was created without `streamPrefetch` in its modules. It is ignored and the runtime requests the policy itself.'
				);
			}
			const mode =
				pending && streamPrefetch
					? streamPrefetch(
							initial.mode,
							initial.prefetch as PromiseLike<RuntimePrefetch>,
							initial,
							() => built.runtime?.kernel
						)
					: initial.mode;
			const view = new Proxy({} as ConsentRuntimeOptions, {
				get: (_target, key) => {
					if (key === 'enabled') {
						return on;
					}
					if (key === 'callbacks') {
						return callbacks;
					}
					if (key === 'mode') {
						return mode;
					}
					if (key === 'prefetch') {
						if (on && adoptedPrefetch) {
							return adoptedPrefetch;
						}
						return knownPrefetch && overridesChanged
							? { ...knownPrefetch, initialPolicyPending: true }
							: knownPrefetch;
					}
					const source = LIVE_OPTIONS.has(key) ? current : initial;
					return source[key as keyof ConsentRuntimeUpdate];
				},
			});
			const track = (dispose: () => void) => extras.push(dispose);
			const scripts = moduleSlot(modules.createScriptLoader);
			const network = moduleSlot(modules.createNetworkBlocker);
			const iframes = moduleSlot(modules.createIframeBlocker);
			const cleanup = moduleSlot(modules.createClearOnRevocation);
			const assembled = assembleConsentRuntime(view, {
				...modules,
				createClearOnRevocation: cleanup.create,
				createIframeBlocker: iframes.create,
				createNetworkBlocker: network.create,
				createScriptLoader: scripts.create,
			});
			built.runtime = assembled.runtime;
			const stop = () => {
				for (const dispose of extras.reverse()) {
					dispose();
				}
				extras = [];
				assembled.stop();
			};
			return {
				...assembled,
				cleanup,
				iframes,
				network,
				scripts,
				stop,
				track,
				view,
			};
		};
		type Built = ReturnType<typeof build>;

		const main = build(true);
		main.runtime.subscribe(notify);
		if (
			modules.streamPrefetch &&
			initial.prefetch &&
			initial.prefetch !== knownPrefetch
		) {
			void (async () => {
				try {
					const streamed = await (initial.prefetch as PromiseLike<
						RuntimePrefetch | undefined
					>);
					main.adoptJourney(
						streamed?.journey === null ? null : streamed?.journey?.id
					);
				} catch {
				}
			})();
		}
		let permissive: Built | null = null;
		if (!enabled) {
			main.stop();
			main.releaseHold();
			permissive = build(false);
		}
		const active = (): Built => permissive ?? main;

		let initApplied = false;
		main.runtime.kernel.events.on('init:applied', () => {
			initApplied = true;
		});
		let streamedRecordsGeneration = main.runtime.kernel.getRecordsGeneration();
		const runsExperiment = initial.experiment !== undefined;
		let streamedMemo:
			| { config: RuntimePrefetch; snapshot: ConsentSnapshot }
			| undefined;
		const streamed: StreamedPrefetch | undefined =
			modules.streamPrefetch &&
			enabled &&
			!initial.consentSource &&
			initial.prefetch !== knownPrefetch
				? {
						adopt(config) {
							if (
								initApplied ||
								disposed ||
								permissive ||
								typeof document === 'undefined' ||
								!rendersFromStream(config, runsExperiment)
							) {
								return;
							}
							const response = kernelConfigToInitResponse(config);
							if (!response) {
								return;
							}
							if (
								main.runtime.kernel.getRecordsGeneration() !==
								streamedRecordsGeneration
							) {
								response.records = undefined;
								response.subjectId = undefined;
							}
							const resolvedOverrides = {
								...(response.resolvedOverrides ?? {}),
								...(current.overrides ?? {}),
							};
							if (Object.keys(resolvedOverrides).length > 0) {
								response.resolvedOverrides = resolvedOverrides;
							}
							initApplied = true;
							if (!started) {
								adoptedPrefetch = config;
							}
							main.adoptJourney(
								config.journey === null ? null : config.journey?.id
							);
							(main.runtime.kernel as InternalKernel).adoptInit(
								response,
								started
							);
						},
						settled: settle(
							initial.prefetch as PromiseLike<RuntimePrefetch | undefined>
						),
						snapshotFor(config) {
							if (!rendersFromStream(config, runsExperiment)) {
								return main.runtime.kernel.getServerSnapshot();
							}
							if (streamedMemo?.config !== config) {
								streamedMemo = {
									config,
									snapshot: createRuntimeKernel({
										...initial,
										mode: Object.assign(() => ({}), {
											kind: initial.mode.kind,
										}),
										prefetch: config,
									}).getServerSnapshot(),
								};
							}
							return streamedMemo.snapshot;
						},
					}
				: undefined;

		const setEnabled = function setEnabled(next: boolean): void {
			if (disposed || next === enabled) {
				return;
			}
			enabled = next;
			if (next) {
				permissive?.stop();
				permissive?.runtime.dispose();
				permissive = null;
				if (started) {
					main.runtime.start();
				}
			} else {
				main.runtime.kernel.set.activeUI('none');
				main.stop();
				main.releaseHold();
				permissive = build(false);
				if (started) {
					permissive.runtime.start();
				}
			}
			notify();
		};

		const setConsentCategories = function setConsentCategories(
			categories: AllConsentNames[] | undefined
		): void {
			main.runtime.setConsentCategories(categories);
			permissive?.runtime.setConsentCategories(categories);
		};

		let applied: ConsentRuntimeUpdate = options;
		let updater: Promise<typeof ProviderUpdateModule> | undefined;
		const host: ProviderUpdateHost = {
			active: () => active(),
			get enabled() {
				return enabled;
			},
			initial,
			main,
			ownerSource,
			tools: {
				afterModuleLoaded,
				declareOwnedVendors,
				extractConsentNamesFromCondition,
				holdNetworkRequests,
				normalizeKernelUser,
				notHeld: NOT_HELD,
				resolveVendors,
			},
		};
		const applyUpdate = async function applyUpdate(
			hold: NetworkHold | undefined
		): Promise<void> {
			if (changed(applied, current)) {
				let apply: typeof ProviderUpdateModule.applyProviderUpdate;
				try {
					updater ??= import('./provider-update');
					apply = (await updater).applyProviderUpdate;
				} catch (error) {
					updater = undefined;
					hold?.block();
					throw error;
				}
				if (disposed) {
					hold?.block();
					return;
				}
				if (applied !== current) {
					const previous = applied;
					applied = current;
					apply(host, previous, current, started);
				}
			}
			hold?.release()();
		};

		modules.preloadScriptLoader?.(
			() =>
				started || disposed
					? undefined
					: [active().runtime.kernel, active().view],
			initial.prefetch,
			createRuntimeKernel,
			modules.createPersistence
		);

		const runtime: ConsentRuntime = main.runtime;
		const provider: Omit<
			ConsentProviderRuntime,
			| 'clearRecords'
			| 'experiment'
			| 'iab'
			| 'identify'
			| 'processIframes'
			| 'reconcileStorage'
		> = {
			get consentCategories() {
				return active().runtime.consentCategories;
			},
			dispose() {
				disposed = true;
				started = false;
				permissive?.stop();
				permissive?.runtime.dispose();
				permissive = null;
				main.stop();
				runtime.dispose();
				listeners.clear();
			},
			get enabled() {
				return enabled;
			},
			get kernel() {
				return active().runtime.kernel;
			},
			async reinit() {
				if (enabled) {
					await runtime.reinit();
				}
			},
			get scripts() {
				return current.scripts ?? [];
			},
			setConsentCategories,
			setEnabled,
			setLanguage(language) {
				if (enabled) {
					runtime.setLanguage(language);
					return;
				}
				runtime.kernel.set.language(language);
				active().runtime.kernel.set.language(language);
				overridesChanged = true;
			},
			setOverrides(overrides) {
				runtime.setOverrides(overrides);
				overridesChanged ||= !started || !enabled;
			},
			start() {
				if (started || disposed || typeof document === 'undefined') {
					return;
				}
				started = true;
				active().runtime.start();
				streamedRecordsGeneration = main.runtime.kernel.getRecordsGeneration();
				declareOwnedVendors(runtime.kernel, ownersOf(current), ownerSource);
			},
			get started() {
				return started;
			},
			streamed,
			subscribe(listener) {
				listeners.add(listener);
				return function unsubscribe() {
					listeners.delete(listener);
				};
			},
			update(next) {
				if (disposed) {
					return Promise.resolve();
				}
				const previous = current;
				current = { ...next, mode: next.mode ?? initial.mode };
				if (
					overridesKey(current.overrides) !== overridesKey(previous.overrides)
				) {
					runtime.setOverrides(current.overrides ?? {});
					if (started && enabled) {
						void runtime.reinit();
					} else {
						overridesChanged = true;
					}
				}
				setEnabled(current.enabled ?? true);
				if (
					JSON.stringify(current.consentCategories) !==
					JSON.stringify(previous.consentCategories)
				) {
					setConsentCategories(current.consentCategories);
				}
				const before = previous.networkBlocker || undefined;
				const after = current.networkBlocker || undefined;
				const hold =
					started &&
					enabled &&
					after &&
					after.enabled !== false &&
					(after.rules !== before?.rules || before?.enabled === false)
						? holdNetworkRequests(after.rules)
						: undefined;
				return applyUpdate(hold);
			},
		};
		return Object.setPrototypeOf(provider, runtime) as ConsentProviderRuntime;
	};
