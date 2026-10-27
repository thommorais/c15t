'use client';

import {
	applyExperimentAssignment,
	applyExperimentTheme,
	hostExperiment,
	watchRevocationReload,
} from '@c15t/core';
import type {
	AllConsentNames,
	Callbacks,
	ClearOnRevocationConfig,
	ConsentExperiment,
	ConsentJourneyOption,
	ConsentKernel,
	ConsentPresentation,
	ConsentSnapshot,
	ExperimentState,
	JourneyState,
	HostedModeOptions,
	I18nConfig,
	InitContext,
	KernelConfig,
	KernelOverrides,
	KernelTransport,
	KernelUser,
	LegalLinks,
	ProviderTransportFactory,
	StorageConfig,
	User,
	Vendor,
} from '@c15t/core';
import {
	createPersistence,
	readStoredRecords,
} from '@c15t/core/modules/persistence';
import type { Script } from '@c15t/core/modules/script-loader';
import { createWindowDebug } from '@c15t/core/modules/window-debug';
import type { ConsentControlOptions } from '@c15t/core/runtime';
import {
	claimEarlyJourney,
	createConsentProviderRuntime,
	earlyInitModes,
	lazyRuntimeModule,
	lazyStreamPrefetch,
	readHostedMode,
	streamPrefetchWith,
} from '@c15t/core/runtime/provider';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
	ConsentRuntime,
	ConsentRuntimeModules,
	EarlyInitMode,
	ResolveStreamedInit,
} from '@c15t/core/runtime/provider';
import { applyThemeSlots } from '@c15t/ui/utils';
import type { ReactNode } from 'react';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useState,
	useSyncExternalStore,
} from 'react';

import type { DialogPreload } from './chunk-warming';
import {
	KernelContext,
	ProviderServicesContext,
	StreamedPrefetchContext,
} from './context';
import type { ProviderServices } from './context';
import { ExternalIABProvider } from './external-iab-context';
import { useColorScheme } from './hooks/use-color-scheme';
import { useIsHydrated } from './hooks/use-is-hydrated';
import type {
	UseNetworkBlockerOptions,
	UsePersistenceOptions,
	UseScriptLoaderOptions,
} from './module-hooks';
import { createIframeBlockerOnDemand } from './module-hooks/iframe-blocker';
import type { UseIframeBlockerOptions } from './module-hooks/iframe-blocker';
import { UNCOMMITTED_HOLD_MS } from './module-hooks/network-hold';
import { V3ThemeProvider } from './theme-provider';
import type { ReactUIOptions } from './types/manager';
import type { ReactComponentSlots } from './types/slots';
import type { V3UIConfigValue } from './ui-config-context';

declare const process: { env: { NODE_ENV?: string } };

export type ConsentProviderCallbacks = Pick<
	Callbacks,
	| 'onChoiceRecorded'
	| 'onPermissionsChanged'
	| 'onSurfaceShown'
	| 'onError'
	| 'onBeforeConsentRevocationReload'
>;
export type ConsentProviderPrefetch = Omit<
	KernelConfig,
	'initialDraft' | 'transport'
> &
	ExperimentState &
	JourneyState;

export interface ConsentProviderOptions
	extends
		ConsentControlOptions,
		Pick<
			ReactUIOptions,
			| 'colorScheme'
			| 'disableAnimation'
			| 'noStyle'
			| 'scrollLock'
			| 'theme'
			| 'trapFocus'
		> {
	enabled?: boolean;
	presentation?: ConsentPresentation;
	experiment?: ConsentExperiment;
	journey?: ConsentJourneyOption;
	nonce?: string;
	styles?: boolean;
	mode: ProviderTransportFactory;
	storageConfig?: StorageConfig;
	user?: User | KernelUser;
	overrides?: KernelOverrides;
	prefetch?: ConsentProviderPrefetch | Promise<ConsentProviderPrefetch>;
	streamBanner?: boolean;
	callbacks?: ConsentProviderCallbacks;
	clearOnRevocation?: ClearOnRevocationConfig;
	reloadOnConsentRevoked?: boolean;
	scripts?: Script[];
	vendors?: Vendor[];
	scriptLoader?: UseScriptLoaderOptions;
	networkBlocker?: UseNetworkBlockerOptions | false;
	iframeBlocker?: UseIframeBlockerOptions | false;
	persistence?: boolean | UsePersistenceOptions;
	i18n?: Partial<I18nConfig>;
	consentCategories?: AllConsentNames[];
	components?: ReactComponentSlots;
	legalLinks?: LegalLinks;
	preloadDialog?: DialogPreload;
	__debugPkg?: string;
	__resolveStreamedInit?: ResolveStreamedInit;
	__preloadScriptLoader?: (
		load: () => Promise<unknown>
	) => ConsentRuntimeModules['preloadScriptLoader'];
}

export type ExternalRuntimeProviderOptions = Omit<
	ConsentProviderOptions,
	'callbacks' | 'mode' | 'vendors'
> & {
	mode?: ConsentProviderOptions['mode'];
	vendors?: never;
	callbacks?: never;
};

export interface OwnedRuntimeProviderProps {
	options: ConsentProviderOptions;
	children: ReactNode;
	runtime?: undefined;
}

export interface ExternalRuntimeProviderProps {
	options?: ExternalRuntimeProviderOptions;
	children: ReactNode;
	runtime: ConsentRuntime;
}
export type ConsentProviderProps =
	| OwnedRuntimeProviderProps
	| ExternalRuntimeProviderProps;

const connectConsentSourceOnDemand: ConsentRuntimeModules['connectConsentSource'] =
	(kernel, source) => {
		let disconnect: (() => void) | undefined;
		let stopped = false;
		void (async () => {
			try {
				const { connectConsentSource } =
					await import('@c15t/core/runtime/controls');
				if (!stopped) {
					disconnect = connectConsentSource(kernel, source);
				}
			} catch {
			}
		})();
		return () => {
			stopped = true;
			disconnect?.();
		};
	};

const loadScriptLoader = async () =>
	(await import('@c15t/core/modules/script-loader')).createScriptLoader;

const reactRuntimeModules = function reactRuntimeModules(
	options: ConsentProviderOptions
): ConsentRuntimeModules {
	const resolveStreamedInit = options.__resolveStreamedInit;
	return {
		connectConsentSource: connectConsentSourceOnDemand,
		createClearOnRevocation: lazyRuntimeModule(
			async () =>
				(await import('@c15t/core/modules/clear-on-revocation'))
					.createClearOnRevocation
		),
		createIframeBlocker: createIframeBlockerOnDemand,
		createNetworkBlocker: lazyRuntimeModule(
			async () =>
				(await import('@c15t/core/modules/network-blocker'))
					.createNetworkBlocker
		),
		createPersistence,
		createScriptLoader: lazyRuntimeModule(loadScriptLoader),
		createWindowDebug,
		preloadScriptLoader: options.__preloadScriptLoader?.(loadScriptLoader),
		streamPrefetch: resolveStreamedInit
			? streamPrefetchWith(resolveStreamedInit)
			: lazyStreamPrefetch,
		watchRevocationReload,
	};
};

const treeIABModes = new WeakMap<
	ProviderTransportFactory,
	ProviderTransportFactory
>();
type EarlySource =
	| { readonly hosted: HostedModeOptions }
	| { readonly mode: EarlyInitMode; readonly fetch: typeof globalThis.fetch };
interface EarlyInit {
	readonly source: EarlySource;
	readonly key: string;
	readonly transport: KernelTransport;
}
const sentEarly = new Set<EarlyInit>();
let builtTransport: KernelTransport | undefined;
let buildTransport: () => KernelTransport;

const sameHosted = (a: HostedModeOptions, b: HostedModeOptions): boolean =>
	a.fetch === b.fetch &&
	a.initialData === b.initialData &&
	JSON.stringify(a) === JSON.stringify(b);
const sameSource = (a: EarlySource, b: EarlySource): boolean => {
	if ('hosted' in a) {
		return 'hosted' in b && sameHosted(a.hosted, b.hosted);
	}
	return (
		'mode' in b &&
		a.fetch === b.fetch &&
		(a.mode === b.mode || a.mode.sameAs(b.mode))
	);
};
const withTreeIAB = function withTreeIAB(
	mode: ProviderTransportFactory
): ProviderTransportFactory {
	if (typeof mode !== 'function') {
		return mode;
	}
	let wrapped = treeIABModes.get(mode);
	if (!wrapped) {
		wrapped = Object.assign(
			(context: Parameters<ProviderTransportFactory>[0]) =>
				(builtTransport = (buildTransport = () =>
					mode(
						Object.create(context, { iabEnabled: { value: undefined } })
					))()),
			{ kind: mode.kind }
		);
		treeIABModes.set(mode, wrapped);
	}
	return wrapped;
};

const toRuntimeOptions = function toRuntimeOptions(
	options: ConsentProviderOptions
): ConsentProviderRuntimeOptions {
	return {
		...options,
		mode: withTreeIAB(options.mode),
		pkg: options.__debugPkg ?? '@c15t/react',
	};
};

const hasStoredChoice = function hasStoredChoice(
	options: ConsentProviderOptions
): boolean {
	const { persistence } = options;
	if (persistence === false || options.consentSource) {
		return false;
	}
	const settings = typeof persistence === 'object' ? persistence : {};
	if (settings.skipHydration) {
		return false;
	}
	const now = settings.now ? settings.now() : Date.now();
	const { records } = readStoredRecords(
		settings.storageConfig ?? options.storageConfig,
		now
	);
	return Boolean(records.choice || records.noticeDismissal);
};

const earlyInitKey = function earlyInitKey(
	context: Pick<InitContext, 'journey' | 'overrides' | 'user'>
): string {
	const { journey } = context;
	return JSON.stringify({
		journey: journey ? [journey.id, journey.scope, journey.storedChoice] : null,
		overrides: context.overrides,
		user: context.user,
	});
};

const earlySend = function earlySend(
	options: ConsentProviderOptions,
	snapshot: Pick<ConsentSnapshot, 'overrides' | 'policyPending'>,
	clientRender: boolean
): { source: EarlySource; storedChoice: boolean } | undefined {
	if (
		!(clientRender && snapshot.policyPending) ||
		options.prefetch ||
		options.experiment
	) {
		return undefined;
	}
	const hostedMode = readHostedMode(options.mode);
	if (hostedMode) {
		return {
			source: {
				hosted: { ...hostedMode, fetch: hostedMode.fetch ?? globalThis.fetch },
			},
			storedChoice: hasStoredChoice(options),
		};
	}
	const earlyMode = earlyInitModes.get(options.mode);
	if (
		!earlyMode ||
		hasStoredChoice(options) ||
		!earlyMode.requestsInit(snapshot.overrides)
	) {
		return undefined;
	}
	return {
		source: { fetch: globalThis.fetch, mode: earlyMode },
		storedChoice: false,
	};
};

interface OwnedRuntimeEntry {
	readonly runtime: ConsentProviderRuntime;
	apply: (options: ConsentProviderOptions) => void;
	mount: () => (() => void) | null;
}

interface PendingEntry {
	holdKey: string | null;
	sequence: number;
	expire: () => void;
}

const uncommitted = new Set<PendingEntry>();
let entrySequence = 0;

const createOwnedRuntimeEntry = function createOwnedRuntimeEntry(
	initialOptions: ConsentProviderOptions,
	clientRender: boolean
): OwnedRuntimeEntry {
	const { networkBlocker } = initialOptions;
	const runtime = createConsentProviderRuntime(
		toRuntimeOptions(initialOptions),
		reactRuntimeModules(initialOptions)
	);
	let options = initialOptions;
	let expired = false;
	let committed = false;
	let mounts = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const transport = builtTransport as KernelTransport;
	let early: EarlyInit | undefined;
	let sent: EarlyInit | undefined;
	entrySequence += 1;
	const pending: PendingEntry = {
		expire() {
			sentEarly.delete(sent as EarlyInit);
			uncommitted.delete(pending);
			clearTimeout(timer);
			expired = true;
			runtime.dispose();
		},
		holdKey:
			initialOptions.enabled !== false &&
			networkBlocker &&
			networkBlocker.enabled !== false
				? JSON.stringify(networkBlocker.rules)
				: null,
		sequence: entrySequence,
	};
	if (typeof window === 'undefined') {
		committed = true;
	} else {
		uncommitted.add(pending);
		timer = setTimeout(pending.expire, UNCOMMITTED_HOLD_MS);
		const snapshot = runtime.kernel.getSnapshot();
		const sending = earlySend(initialOptions, snapshot, clientRender);
		if (sending) {
			const { source, storedChoice } = sending;
			const journey = claimEarlyJourney({
				option: initialOptions.journey,
				storedChoice,
			});
			const context = journey
				? { journey, overrides: snapshot.overrides, user: snapshot.user }
				: { overrides: snapshot.overrides, user: snapshot.user };
			const key = earlyInitKey(context);
			for (const other of sentEarly) {
				if (other.key === key && sameSource(other.source, source)) {
					early = other;
				}
			}
			if (!early) {
				const carrier = buildTransport();
				const init = carrier.init as NonNullable<KernelTransport['init']>;
				const request = init(context);
				// oxlint-disable-next-line promise/prefer-await-to-then -- Only marks the rejection handled.
				request.catch(() => undefined);
				let used = false;
				carrier.init = (next) => {
					const reuse = !used && earlyInitKey(next) === key;
					used = true;
					return reuse ? request : init(next);
				};
				sent = { key, source, transport: carrier };
				early = sent;
				sentEarly.add(sent);
			}
		}
	}

	const commit = function commit(): boolean {
		if (expired) {
			return false;
		}
		if (committed) {
			return true;
		}
		committed = true;
		if (sentEarly.delete(early as EarlyInit)) {
			Object.assign(transport, early?.transport);
		}
		uncommitted.delete(pending);
		clearTimeout(timer);
		if (pending.holdKey !== null) {
			for (const other of uncommitted) {
				if (
					other.sequence < pending.sequence &&
					other.holdKey === pending.holdKey
				) {
					other.expire();
				}
			}
		}
		return true;
	};

	return {
		apply(next) {
			if (next !== options) {
				options = next;
				// oxlint-disable-next-line promise/prefer-await-to-then -- Fire and forget from an effect: only the rejection needs a handler.
				runtime.update(toRuntimeOptions(next)).catch(() => undefined);
			}
		},
		mount() {
			if (!commit()) {
				return null;
			}
			mounts += 1;
			const mount = mounts;
			runtime.start();
			return () => {
				queueMicrotask(() => {
					if (mounts === mount) {
						runtime.dispose();
					}
				});
			};
		},
		runtime,
	};
};

const createRuntimeHolder = function createRuntimeHolder() {
	let entry: OwnedRuntimeEntry | null = null;
	return {
		get(
			options: ConsentProviderOptions,
			clientRender: boolean
		): OwnedRuntimeEntry {
			entry ??= createOwnedRuntimeEntry(options, clientRender);
			return entry;
		},
		reset() {
			entry = null;
		},
	};
};

const increment = (count: number): number => count + 1;
const subscribeNothing = (): (() => void) => () => undefined;

const useOwnedRuntime = function useOwnedRuntime(
	options: ConsentProviderOptions | undefined
): { entry: OwnedRuntimeEntry; rebuild: () => void } | undefined {
	// oxlint-disable-next-line react/hook-use-state -- Created once, during the first render.
	const [holder] = useState(createRuntimeHolder);
	const [, rerender] = useReducer(increment, 0);
	const clientRender = useIsHydrated();
	const rebuild = useCallback(() => {
		holder.reset();
		rerender();
	}, [holder]);
	return options
		? { entry: holder.get(options, clientRender), rebuild }
		: undefined;
};

const useBrowserLayoutEffect =
	typeof document === 'undefined' ? useEffect : useLayoutEffect;

const OwnedRuntimeLifecycle = ({
	entry,
	options,
	rebuild,
}: {
	entry: OwnedRuntimeEntry;
	options: ConsentProviderOptions;
	rebuild: () => void;
}) => {
	useBrowserLayoutEffect(() => entry.apply(options), [entry, options]);

	useEffect(() => {
		const unmount = entry.mount();
		if (!unmount) {
			rebuild();
			return;
		}
		return unmount;
	}, [entry, rebuild]);

	return null;
};

const isPromiseLike = function isPromiseLike(
	value: unknown
): value is PromiseLike<unknown> {
	return (
		typeof (value as PromiseLike<unknown> | undefined)?.then === 'function'
	);
};

// oxlint-disable-next-line complexity -- Provider selects owned or borrowed lifecycle and renders its contexts.
export const ConsentProvider = (props: ConsentProviderProps) => {
	const { children } = props;
	const options = (props.options ?? {}) as ConsentProviderOptions;
	// oxlint-disable-next-line react/hook-use-state -- Read once, at mount.
	const [mountedRuntime] = useState(() => props.runtime);
	const owned = useOwnedRuntime(mountedRuntime ? undefined : options);
	const providerRuntime = owned?.entry.runtime;
	const borrowed = mountedRuntime
		? (props.runtime ?? mountedRuntime)
		: undefined;
	const runtime = (providerRuntime ?? borrowed) as ConsentRuntime;
	const kernel: ConsentKernel = useSyncExternalStore(
		providerRuntime ? providerRuntime.subscribe : subscribeNothing,
		() => runtime.kernel,
		() => runtime.kernel
	);
	// oxlint-disable-next-line react/hook-use-state -- Read once, at mount.
	const [borrowedExperiment] = useState(() =>
		mountedRuntime
			? (mountedRuntime.experiment ??
				hostExperiment(
					options.experiment,
					isPromiseLike(options.prefetch) ? undefined : options.prefetch
				))
			: undefined
	);
	const experiment = providerRuntime
		? providerRuntime.experiment
		: borrowedExperiment;

	const borrowedCategories = borrowed ? options.consentCategories : undefined;
	useEffect(() => {
		if (borrowed && borrowedCategories !== undefined) {
			borrowed.setConsentCategories(borrowedCategories);
		}
	}, [borrowed, borrowedCategories]);

	const { presentation } = options;
	const services = useMemo<ProviderServices>(
		() => ({
			clearRecords: () => runtime.clearRecords(),
			getConsentCategories: () => runtime.consentCategories,
			getPresentation: () =>
				applyExperimentAssignment(
					presentation,
					experiment,
					kernel.getSnapshot().experiment
				),
			isStarted: () => runtime.started,
			runtime,
			setLanguage: (code: string) => runtime.setLanguage(code),
		}),
		[experiment, kernel, presentation, runtime]
	);

	const hasBorrowedCallbacks = !!borrowed && options.callbacks !== undefined;
	useEffect(() => {
		if (process.env.NODE_ENV === 'production' || !hasBorrowedCallbacks) {
			return;
		}
		console.warn(
			'c15t ConsentProvider: `options.callbacks` is ignored when you pass `runtime`. Pass them to createConsentRuntime({ callbacks }) instead.'
		);
	}, [hasBorrowedCallbacks]);

	const assignment = useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => kernel.getSnapshot().experiment,
		() => kernel.getServerSnapshot().experiment
	);
	const userTheme = useMemo(
		() => applyExperimentTheme(options.theme, experiment, assignment),
		[options.theme, experiment, assignment]
	);
	useEffect(() => {
		if (process.env.NODE_ENV === 'production') {
			return;
		}
		const tokenKeys = [
			'colors',
			'dark',
			'motion',
			'radius',
			'shadows',
			'spacing',
			'typography',
		];
		if (
			!userTheme ||
			!tokenKeys.some((key) => key in userTheme) ||
			document.getElementById('c15t-theme')
		) {
			return;
		}
		console.warn(
			'c15t: `theme` tokens are no longer turned into CSS in the browser. Render <ConsentTheme theme={theme} /> on the server, or put the CSS from generateThemeCSS() in your stylesheet. See https://c15t.com/docs/frameworks/react/customize'
		);
	}, [userTheme]);

	const themeContextValue = useMemo(
		() => ({
			colorScheme: options.colorScheme,
			disableAnimation: options.disableAnimation,
			noStyle: options.noStyle,
			scrollLock: options.scrollLock,
			theme: userTheme,
			trapFocus: options.trapFocus,
		}),
		[
			userTheme,
			options.noStyle,
			options.disableAnimation,
			options.scrollLock,
			options.trapFocus,
			options.colorScheme,
		]
	);

	const uiConfigValue = useMemo<V3UIConfigValue>(
		() => ({
			components: applyThemeSlots(
				userTheme?.slots,
				options.components,
				'className'
			),
			experiment,
			legalLinks: options.legalLinks,
			nonce: options.nonce,
			preloadDialog: options.preloadDialog,
			presentation: options.presentation,
			styles: options.styles,
			theme: options.theme,
		}),
		[
			userTheme?.slots,
			options.components,
			experiment,
			options.legalLinks,
			options.nonce,
			options.preloadDialog,
			options.presentation,
			options.styles,
			options.theme,
		]
	);

	useColorScheme(options.colorScheme);

	return (
		<KernelContext.Provider value={kernel}>
			<ProviderServicesContext.Provider value={services}>
				<V3ThemeProvider
					themeConfig={themeContextValue}
					uiConfig={uiConfigValue}
				>
					{owned ? (
						<OwnedRuntimeLifecycle
							entry={owned.entry}
							options={options}
							rebuild={owned.rebuild}
						/>
					) : null}
					{borrowed ? (
						<ExternalIABProvider runtime={borrowed}>
							{children}
						</ExternalIABProvider>
					) : (
						<StreamedPrefetchContext.Provider
							value={
								options.streamBanner === false
									? undefined
									: providerRuntime?.streamed
							}
						>
							{children}
						</StreamedPrefetchContext.Provider>
					)}
				</V3ThemeProvider>
			</ProviderServicesContext.Provider>
		</KernelContext.Provider>
	);
};
