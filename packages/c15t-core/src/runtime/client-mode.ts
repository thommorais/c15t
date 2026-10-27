import { isProductionBuild } from '../libs/is-production';
import { warnNoConsentRecordsInDevelopment } from '../libs/no-records-warning';
import { hasPrefetchedInitialData } from '../libs/prefetch/window-key';
import type { ConsentMode, OfflineModeOptions } from '../modes';
import type { SSRInitialData } from '../options/ssr';
import type * as HostedModule from '../transports/hosted';
import { createHostedInitRequest } from '../transports/hosted-init-request';
import type { HostedInitRequest } from '../transports/hosted-init-request';
import { createHostedRecordTransport } from '../transports/hosted-records';
import type * as ManifestBrowserModule from '../transports/manifest-browser';
import type { BrowserManifestOptions } from '../transports/manifest-browser';
import { createManifestRequestInit } from '../transports/manifest-request';
import type {
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
} from '../transports/mode';
import type * as OfflineModule from '../transports/offline';
import type { InitContext, KernelConfig, KernelTransport } from '../types';

export interface ClientModeOptions {
	backendURL?: string;
	routePrefix?: string;
	initialData?: Promise<SSRInitialData | undefined>;
}

export type LoadInitTransport = (ctx: InitContext) => Promise<KernelTransport>;

export type LoadHostedModule = () => Promise<
	Pick<typeof HostedModule, 'createHostedTransport'>
>;

export type LoadOfflineModule = () => Promise<
	Pick<typeof OfflineModule, 'offline'>
>;

export type LoadManifestBrowserModule = () => Promise<
	Pick<typeof ManifestBrowserModule, 'createBrowserManifestTransport'>
>;

const loadHostedModule: LoadHostedModule = () => import('./lazy-hosted');
const loadOfflineModule: LoadOfflineModule = () => import('./lazy-offline');
const loadManifestBrowserModule: LoadManifestBrowserModule = () =>
	import('./lazy-manifest-browser');

const trimSlash = function trimSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
};

export const createLazyInitTransport = function createLazyInitTransport(
	records: KernelTransport,
	load: LoadInitTransport
): KernelTransport {
	let transportPromise: Promise<KernelTransport> | undefined;
	const resolver = function resolver(
		ctx: InitContext
	): Promise<KernelTransport> {
		transportPromise ??= (async () => {
			try {
				return await load(ctx);
			} catch (error) {
				transportPromise = undefined;
				throw error;
			}
		})();
		return transportPromise;
	};
	const recordTransport =
		async function recordTransport(): Promise<KernelTransport> {
			return transportPromise ? await transportPromise : records;
		};

	return {
		async identify(user, subjectId) {
			await (await recordTransport()).identify?.(user, subjectId);
		},
		async init(ctx) {
			const transport = await resolver(ctx);
			return (await transport.init?.(ctx)) ?? {};
		},
		async loadSubjectRecord(subjectId) {
			return (
				(await (await recordTransport()).loadSubjectRecord?.(subjectId)) ?? null
			);
		},
		async save(payload) {
			const transport = await recordTransport();
			if (!transport.save) {
				throw new Error('c15t: the init transport cannot save.');
			}
			return await transport.save(payload);
		},
	};
};

interface EarlyRequest {
	url: string;
	init: RequestInit & { headers: Record<string, string> };
	response: Promise<Response>;
}

const sendEarly = function sendEarly(
	fetch: typeof globalThis.fetch,
	url: string,
	init: EarlyRequest['init']
): EarlyRequest {
	const response = fetch(url, init);
	void (async () => {
		try {
			await response;
		} catch {
		}
	})();
	return { init, response, url };
};

const isSameRequest = function isSameRequest(
	early: EarlyRequest,
	input: Parameters<typeof globalThis.fetch>[0],
	init: RequestInit | undefined
): boolean {
	return (
		input === early.url &&
		init?.method === early.init.method &&
		init?.credentials === early.init.credentials &&
		JSON.stringify(init?.headers) === JSON.stringify(early.init.headers)
	);
};

const withEarlyRequest = function withEarlyRequest(
	fetch: typeof globalThis.fetch,
	early: EarlyRequest
): typeof globalThis.fetch {
	let pending: EarlyRequest | undefined = early;
	const fetchWithEarlyRequest = (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: RequestInit
	): Promise<Response> => {
		if (pending && isSameRequest(pending, input, init)) {
			const { response } = pending;
			pending = undefined;
			return response;
		}
		return fetch(input, init);
	};
	return fetchWithEarlyRequest as typeof globalThis.fetch;
};

export interface LazyHostedOptions {
	backendURL: string;
	initURL?: string;
	assertDecisionInputs?: boolean;
	headers?: Record<string, string>;
	kind?: ProviderTransportKind;
	initialData?: Promise<SSRInitialData | undefined>;
}

const startEarlyInit = function startEarlyInit(
	options: LazyHostedOptions,
	fetch: typeof globalThis.fetch | undefined,
	ctx: InitContext
): EarlyRequest | undefined {
	if (
		typeof window === 'undefined' ||
		!fetch ||
		options.initialData ||
		(options.headers && Object.keys(options.headers).length > 0) ||
		(!options.initURL && hasPrefetchedInitialData())
	) {
		return undefined;
	}
	const request: HostedInitRequest = createHostedInitRequest({
		...ctx,
		backendURL: options.backendURL,
		initURL: options.initURL,
	});
	return sendEarly(fetch, request.url, request.init);
};

export const lazyHosted = function lazyHosted(
	options: LazyHostedOptions,
	load: LoadHostedModule = loadHostedModule
): ProviderTransportFactory {
	const assertDecisionInputs =
		options.assertDecisionInputs ?? options.initURL !== undefined;
	return Object.assign(
		(): KernelTransport => {
			const fetch = globalThis.fetch?.bind(globalThis);
			return createLazyInitTransport(
				createHostedRecordTransport(
					{ backendURL: options.backendURL, fetch },
					assertDecisionInputs
						? {
								inputs: () => undefined,
								pending: () => undefined,
								required: true,
							}
						: undefined
				),
				async (ctx) => {
					const early = startEarlyInit(options, fetch, ctx);
					const { createHostedTransport } = await load();
					return createHostedTransport({
						assertDecisionInputs,
						backendURL: options.backendURL,
						fetch: early && fetch ? withEarlyRequest(fetch, early) : fetch,
						headers: options.headers,
						initURL: options.initURL,
						initialData: options.initialData,
						pagePrefetch: true,
					});
				}
			);
		},
		{ kind: options.kind ?? ('hosted' as const) }
	);
};

export const lazyOffline = function lazyOffline(
	options: OfflineModeOptions = {},
	load: LoadOfflineModule = loadOfflineModule
): ProviderTransportFactory {
	return Object.assign(
		(context: ProviderTransportContext): KernelTransport => {
			warnNoConsentRecordsInDevelopment(options.acknowledgeNoRecords);
			let transportPromise: Promise<KernelTransport> | undefined;
			const loadTransport = function loadTransport(): Promise<KernelTransport> {
				transportPromise ??= (async () => {
					try {
						const { offline } = await load();
						return offline({
							acknowledgeNoRecords: true,
							policyRules: options.policyRules ?? context.policyRules,
						})(context);
					} catch (error) {
						transportPromise = undefined;
						throw error;
					}
				})();
				return transportPromise;
			};
			return {
				async init(ctx) {
					const transport = await loadTransport();
					return (await transport.init?.(ctx)) ?? {};
				},
			};
		},
		{ kind: 'offline' as const }
	);
};

export type LazyBrowserManifestOptions = BrowserManifestOptions & {
	backendURL: string;
};

const hasPolicy = function hasPolicy(
	config: Partial<KernelConfig> | undefined
): boolean {
	return Boolean(
		config?.initialPolicyResolution && config.initialPolicyPending !== true
	);
};

export const lazyBrowserManifest = function lazyBrowserManifest(
	options: LazyBrowserManifestOptions,
	load: LoadManifestBrowserModule = loadManifestBrowserModule
): ProviderTransportFactory {
	return Object.assign(
		(context?: ProviderTransportContext): KernelTransport => {
			const fetch =
				options.fetch ??
				(typeof globalThis.fetch === 'function'
					? globalThis.fetch.bind(globalThis)
					: undefined);
			const manifestURL =
				options.manifestURL ?? `${trimSlash(options.backendURL)}/manifest`;
			let early: EarlyRequest | undefined;
			let firstLoad: ReturnType<LoadManifestBrowserModule> | undefined;
			let initStarted = false;
			const request = (): EarlyRequest | undefined =>
				fetch && !options.snapshot
					? sendEarly(
							fetch,
							manifestURL,
							createManifestRequestInit({
								credentials: options.credentials,
								headers: options.headers,
							})
						)
					: undefined;
			const warm = (): void => {
				if (initStarted || typeof window === 'undefined') {
					return;
				}
				early = request();
				const loading = load();
				void (async () => {
					try {
						await loading;
					} catch {
					}
				})();
				firstLoad = loading;
			};
			if (!hasPolicy(context?.prefetch)) {
				const pending = context?.pendingPrefetch;
				if (pending) {
					void (async () => {
						try {
							if ((await pending)?.initialPolicyResolution !== undefined) {
								return;
							}
						} catch {
						}
						warm();
					})();
				} else {
					warm();
				}
			}
			return createLazyInitTransport(
				createHostedRecordTransport({
					backendURL: options.backendURL,
					domain: options.domain,
					fetch,
				}),
				async () => {
					initStarted = true;
					if (!firstLoad) {
						early = request();
					}
					const pending = firstLoad ?? load();
					firstLoad = undefined;
					const { createBrowserManifestTransport } = await pending;
					return createBrowserManifestTransport(
						{
							...options,
							fetch: early && fetch ? withEarlyRequest(fetch, early) : fetch,
							manifestURL: options.snapshot ? options.manifestURL : manifestURL,
						} as BrowserManifestOptions,
						context
					);
				}
			);
		},
		{ kind: 'manifest' as const }
	);
};

let warnedImplementation = false;

export const clientMode = function clientMode(
	mode: ConsentMode | ProviderTransportFactory | undefined,
	options: ClientModeOptions = {}
): ProviderTransportFactory {
	if (typeof mode === 'function') {
		if (
			mode.kind !== 'custom' &&
			!warnedImplementation &&
			!isProductionBuild()
		) {
			warnedImplementation = true;
			console.warn(
				`c15t: \`mode\` is the ${mode.kind}() transport itself, so its code ships in the client bundle. Pass the ${mode.kind}() your framework package exports instead: it is plain data, and the root loads the code only when it runs.`
			);
		}
		return mode;
	}
	const data: ConsentMode = mode ?? { type: 'manifest' };
	const routePrefix =
		options.routePrefix === undefined
			? undefined
			: trimSlash(options.routePrefix);
	if (data.type === 'offline') {
		return Object.assign(
			lazyOffline({
				acknowledgeNoRecords: data.acknowledgeNoRecords,
				policyRules: data.policyRules,
			}),
			data
		);
	}
	if (data.type === 'hosted') {
		const backendURL = data.backendURL ?? options.backendURL;
		if (backendURL === undefined) {
			throw new Error(
				'c15t: hosted() needs a backend URL. Set `backendURL` on the mode or in your config.'
			);
		}
		return Object.assign(
			lazyHosted({
				backendURL,
				headers: data.headers,
				initialData: options.initialData,
			}),
			data
		);
	}
	const { backendURL } = options;
	if (backendURL === undefined) {
		throw new Error(
			'c15t: manifest() needs a backend URL. Set `backendURL` in your config.'
		);
	}
	if (data.resolve === 'browser') {
		const {
			resolve: _resolve,
			source: _source,
			type: _type,
			...browser
		} = data;
		return Object.assign(
			lazyBrowserManifest({
				...browser,
				backendURL,
				manifestURL:
					data.manifestURL ??
					(routePrefix === undefined ? undefined : `${routePrefix}/manifest`),
			} as LazyBrowserManifestOptions),
			data
		);
	}
	return Object.assign(
		lazyHosted({
			backendURL,
			initURL: routePrefix === undefined ? undefined : `${routePrefix}/init`,
			initialData: options.initialData,
			kind: 'manifest',
		}),
		data
	);
};
