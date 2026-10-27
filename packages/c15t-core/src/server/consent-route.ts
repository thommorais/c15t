import {
	appendJourneyParams,
	applyInitParamsToHeaders,
	CONSENT_REQUEST_HEADER_NAMES,
	extractConsentRequestInputs,
	getIpAddress,
	INIT_PARAM_HEADERS,
	parsePolicyContractHeader,
	POLICY_CONTRACT_HEADER,
	POLICY_CONTRACT_VERSION,
	readJourneyParams,
	readPolicyResolutionWire,
	writePolicyResolutionWire,
} from '@c15t/schema/types';
import type {
	AdTechProvider,
	ConsentManifest,
	ConsentManifestAdditionalConsent,
	ConsentManifestGVLReference,
	ConsentSessionSource,
	GlobalVendorList,
	InitOutput,
	ResolveInitFromManifestInputs,
	SessionJourney,
} from '@c15t/schema/types';

import {
	fetchCachedManifest,
	getManifestAge,
	MANIFEST_PASSTHROUGH_HEADERS,
	ManifestUnavailableError,
	withResolutionBudget,
} from '../libs/manifest-cache-runtime';
import type {
	CachedManifestResponse,
	ManifestCache,
	ManifestFetch,
} from '../libs/manifest-cache-runtime';
import { reportConsentSession } from '../libs/session-report';
import {
	fetchCachedAdTechProviders,
	loadManifestAdTechProviders,
} from '../transports/ad-tech-provider-cache';
import type { AdTechProviderCache } from '../transports/ad-tech-provider-cache';
import {
	deferInitGvlToRoute,
	serveGvlReference,
} from '../transports/gvl-reference';
import { mapInitOutputToInitResponse } from '../transports/init-output';
import {
	getResolverInputsFromHeaders,
	resolveManifestInit,
} from '../transports/manifest-cache';
import {
	c15tProtocolHeaders,
	readProducerPolicyContract,
} from '../transports/version-header';
import {
	CONSENT_PROXY_FORWARDING_HEADERS,
	filterCookieHeader,
	forwardConsentRequest,
	resolveConsentProxyOptions,
	stripIdentityForCleartext,
} from './consent-proxy';
import type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
} from './consent-proxy';
import { fetchCachedGvl } from './gvl-cache';
import { resolveRequestBackendURL } from './request-origin';

export const CONSENT_ROUTE_TIMEOUT_HEADER = 'x-c15t-timeout-ms';

const MAX_ROUTE_TIMEOUT_MS = 10_000;

const INIT_CACHE_CONTROL = 'private, no-store';

const IN_PROCESS_ORIGIN = 'http://localhost';

const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/u;

export type ConsentRouteName = 'manifest' | 'init' | 'proxy';

export type ConsentRouteFetchGvl = (input: {
	reference: ConsentManifestGVLReference;
	language: string;
	fetch: typeof globalThis.fetch;
}) => Promise<GlobalVendorList | null>;

export interface ConsentRouteHandlerOptions {
	adapter: string;
	backendURL?: string;
	manifestURL?: string;
	manifest?: ConsentManifest;
	fetch?: ManifestFetch;
	manifestFetchInit?: Omit<RequestInit, 'headers' | 'method'>;
	fetchGvl?: ConsentRouteFetchGvl;
	trustForwardedHeaders?: boolean;
	reportSessions?: boolean;
	proxy?: boolean | ConsentProxyOptions;
	cache?: ManifestCache;
}

export interface ConsentRouteRequestContext {
	route?: ConsentRouteName;
	path?: string;
	waitUntil?: (task: Promise<void>) => void;
	localFetch?: ManifestFetch;
	forwarding?: () => ConsentProxyForwarding;
	inputs?: ResolveInitFromManifestInputs;
}

export type ConsentRouteHandler = (
	request: Request,
	context?: ConsentRouteRequestContext
) => Promise<Response>;

export interface ConsentInitReport {
	adapter: string;
	backendURL: string | undefined;
	source: ConsentSessionSource;
	headers: Headers;
	method?: string;
	fetch?: typeof globalThis.fetch;
	waitUntil?: (task: Promise<void>) => void;
	abandoned?: () => boolean;
	experiment?: { id: string; arm: string };
	journey?: SessionJourney;
	url?: string;
}

export interface ResolveConsentInitOptions {
	manifest: ConsentManifest;
	inputs: ResolveInitFromManifestInputs;
	loadGvl?: (language: string) => Promise<GlobalVendorList | null>;
	loadAdTechProviders?: (
		reference: ConsentManifestAdditionalConsent
	) => Promise<AdTechProvider[] | undefined>;
	clientContract?: string | null;
	report?: ConsentInitReport;
}

const negotiateInit = function negotiateInit(
	output: InitOutput,
	clientContract: string | null | undefined
): InitOutput {
	const negotiated = { ...output };
	if (
		clientContract !== null &&
		clientContract !== undefined &&
		parsePolicyContractHeader(clientContract) !== POLICY_CONTRACT_VERSION
	) {
		negotiated.policyResolution = writePolicyResolutionWire({
			policy: null,
			reason: 'unsupported-contract',
			status: 'failed',
		});
	}
	if (negotiated.policyResolution?.status !== 'matched') {
		delete negotiated.policySnapshotToken;
		delete negotiated.gvl;
		delete negotiated.gvlReference;
		delete negotiated.cmpId;
		delete negotiated.customVendors;
		delete negotiated.adTechProviders;
	}
	return negotiated;
};

const isIabMatch = function isIabMatch(
	manifest: ConsentManifest,
	payload: InitOutput
): boolean {
	return (
		manifest.iab?.enabled === true &&
		manifest.iab.gvl !== undefined &&
		payload.policyResolution?.status === 'matched' &&
		payload.policyResolution.policy.model === 'iab'
	);
};

export const resolveConsentInit = async function resolveConsentInit(
	options: ResolveConsentInitOptions
): Promise<InitOutput> {
	const { inputs, manifest } = options;
	const payload = negotiateInit(
		resolveManifestInit({ inputs, manifest }),
		options.clientContract
	);
	const { loadAdTechProviders } = options;
	const providers = loadManifestAdTechProviders(
		manifest,
		payload,
		async (reference) => {
			try {
				return await loadAdTechProviders?.(reference);
			} catch {
				return undefined;
			}
		}
	);
	if (options.loadGvl && isIabMatch(manifest, payload)) {
		payload.gvl = await options.loadGvl(
			payload.translations.language.split('-')[0] || 'en'
		);
	}
	const adTechProviders = await providers;
	if (adTechProviders) {
		payload.adTechProviders = adTechProviders;
	}
	const { report } = options;
	if (report && !report.abandoned?.()) {
		reportConsentSession({
			adapter: report.adapter,
			backendURL: report.backendURL,
			experiment: report.experiment,
			fetch: report.fetch,
			headers: report.headers,
			init: payload,
			inputs,
			journey: report.journey,
			manifest,
			method: report.method,
			source: report.source,
			url: report.url,
			waitUntil: report.waitUntil,
		});
	}
	return payload;
};

export const readWaitUntil = function readWaitUntil(
	holder: unknown
): ((task: Promise<unknown>) => void) | undefined {
	const waitUntil = (holder as { waitUntil?: unknown } | null | undefined)
		?.waitUntil;
	return typeof waitUntil === 'function'
		? (task) => {
				(waitUntil as (task: Promise<unknown>) => void).call(holder, task);
			}
		: undefined;
};

const settle = async function settle(task: Promise<unknown>): Promise<void> {
	try {
		await task;
	} catch {
	}
};

const keepAlive = function keepAlive(
	waitUntil: ((task: Promise<void>) => void) | undefined,
	task: Promise<unknown>
): void {
	if (!waitUntil) {
		return;
	}
	try {
		waitUntil(settle(task));
	} catch {
	}
};

const trimPathSlashes = function trimPathSlashes(value: string): string {
	let start = 0;
	let end = value.length;
	while (end > 0 && value[end - 1] === '/') {
		end -= 1;
	}
	while (start < end && value[start] === '/') {
		start += 1;
	}
	return value.slice(start, end);
};

const lastSegment = function lastSegment(pathname: string): string {
	const trimmed = trimPathSlashes(pathname);
	return trimmed.slice(trimmed.lastIndexOf('/') + 1);
};

const readLanguageQuery = function readLanguageQuery(
	url: URL
): string | undefined {
	const raw = url.searchParams.get('language');
	if (!raw) {
		return undefined;
	}
	const language = raw.trim().toLowerCase();
	return LANGUAGE_TAG.test(language) ? `language=${language}` : undefined;
};

const readTimeoutMs = function readTimeoutMs(
	value: string | null
): number | undefined {
	const trimmed = value?.trim();
	if (!trimmed || !/^\d+$/u.test(trimmed)) {
		return undefined;
	}
	return Math.min(Number.parseInt(trimmed, 10), MAX_ROUTE_TIMEOUT_MS);
};

const createBudget = function createBudget(budgetMs: number | undefined) {
	const startedAt = Date.now();
	const remaining = (): number | undefined =>
		budgetMs === undefined ? undefined : budgetMs - (Date.now() - startedAt);
	return {
		bound: <Value>(task: Promise<Value>): Promise<Value> =>
			withResolutionBudget(task, remaining()),
		budgetMs,
		expired: (): boolean => {
			const left = remaining();
			return left !== undefined && left <= 0;
		},
		remaining,
	};
};

type Budget = ReturnType<typeof createBudget>;

const isBudgetTimeout = function isBudgetTimeout(error: unknown): boolean {
	return (
		error instanceof ManifestUnavailableError && error.reason === 'timeout'
	);
};

const canFallBackToInit = function canFallBackToInit(cause: unknown): boolean {
	if (!(cause instanceof ManifestUnavailableError)) {
		return true;
	}
	if (cause.reason === 'timeout') {
		return false;
	}
	return (cause.cause as { status?: unknown } | undefined)?.status === 404;
};

interface ResolvedTarget {
	url: string;
	fetch: ManifestFetch | undefined;
	inProcess?: true;
}

const toPathFetch = function toPathFetch(
	localFetch: ManifestFetch
): ManifestFetch {
	return (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input);
		return localFetch(`${url.pathname}${url.search}`, init);
	};
};

const readRequestForwarding = function readRequestForwarding(
	request: Request,
	trustForwardedHeaders: boolean
): ConsentProxyForwarding {
	const { host, protocol } = new URL(request.url);
	const proto = protocol.slice(0, -1);
	if (!trustForwardedHeaders) {
		return { host, proto };
	}
	const clientIp = getIpAddress(request.headers, { masking: false });
	const chain = (request.headers.get('x-forwarded-for') ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	if (clientIp && !chain.includes(clientIp)) {
		chain.push(clientIp);
	}
	return {
		for: chain.length > 0 ? chain.join(', ') : undefined,
		host: request.headers.get('x-forwarded-host') ?? host,
		proto: request.headers.get('x-forwarded-proto') ?? proto,
	};
};

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

const queryOverrides = function queryOverrides(
	url: URL
): Partial<ResolveInitFromManifestInputs> {
	const { country, gpc, region } = extractConsentRequestInputs(
		applyInitParamsToHeaders(url, new Headers())
	);
	return {
		...(country && { country }),
		...(gpc !== undefined && { gpc }),
		...(region && { region }),
	};
};

export const createConsentRouteHandler = function createConsentRouteHandler(
	options: ConsentRouteHandlerOptions
): ConsentRouteHandler {
	const { adapter } = options;
	const proxy = resolveConsentProxyOptions(options.proxy);
	const extraForwardHeaders =
		typeof options.proxy === 'object'
			? (options.proxy.forwardHeaders ?? []).map((name) => name.toLowerCase())
			: [];
	const trustForwardedHeaders = options.trustForwardedHeaders === true;
	const configuredFetch = function configuredFetch(): typeof globalThis.fetch {
		return (options.fetch ??
			globalThis.fetch.bind(globalThis)) as typeof globalThis.fetch;
	};

	const resolveTarget = function resolveTarget(
		url: string,
		request: Request,
		context: ConsentRouteRequestContext
	): ResolvedTarget | null {
		if (context.localFetch && url.startsWith('/') && !url.startsWith('//')) {
			const resolved = resolveRequestBackendURL(url, {
				requestURL: IN_PROCESS_ORIGIN,
			});
			return resolved
				? {
						fetch: toPathFetch(context.localFetch),
						inProcess: true,
						url: resolved,
					}
				: null;
		}
		const resolved = resolveRequestBackendURL(url, {
			headers: request.headers,
			requestURL: request.url,
			trustForwardedHeaders,
		});
		return resolved ? { fetch: options.fetch, url: resolved } : null;
	};

	const resolveBackend = function resolveBackend(
		request: Request,
		context: ConsentRouteRequestContext,
		backendURL: string
	): ResolvedTarget {
		const backend = resolveTarget(backendURL, request, context);
		if (!backend) {
			throw new Error(`${adapter}: invalid backendURL.`);
		}
		return backend;
	};

	const resolveManifestSource = function resolveManifestSource(
		request: Request,
		context: ConsentRouteRequestContext
	): ResolvedTarget {
		if (options.manifestURL) {
			const source = resolveTarget(options.manifestURL, request, context);
			if (!source) {
				throw new Error(`${adapter}: invalid manifestURL.`);
			}
			return source;
		}
		if (!options.backendURL) {
			throw new Error(`${adapter}: pass backendURL or manifestURL.`);
		}
		const backend = resolveBackend(request, context, options.backendURL);
		return { ...backend, url: `${backend.url}/manifest` };
	};

	const manifestCredentials = function manifestCredentials(
		request: Request,
		sourceURL: string
	): Record<string, string> | undefined {
		if (!proxy) {
			return undefined;
		}
		const headers: Record<string, string> = {};
		const cookie = request.headers.get('cookie');
		const scoped =
			cookie && proxy.cookieNames
				? filterCookieHeader(cookie, proxy.cookieNames)
				: undefined;
		if (scoped) {
			headers.cookie = scoped;
		}
		for (const name of extraForwardHeaders) {
			if (name === 'cookie' || CONSENT_PROXY_FORWARDING_HEADERS.has(name)) {
				continue;
			}
			const value = request.headers.get(name);
			if (value) {
				headers[name] = value;
			}
		}
		return stripIdentityForCleartext(
			Object.keys(headers).length > 0 ? headers : undefined,
			sourceURL
		);
	};

	const readManifest = async function readManifest(
		request: Request,
		context: ConsentRouteRequestContext,
		source: ResolvedTarget,
		budget: Budget | undefined,
		query: string | undefined
	): Promise<{
		cached: CachedManifestResponse;
		credentials: Record<string, string> | undefined;
	}> {
		const credentials = manifestCredentials(request, source.url);
		const cached = await fetchCachedManifest({
			cache: options.cache,
			fetch: source.fetch,
			headers: credentials,
			init: options.manifestFetchInit,
			onBackgroundRevalidate: context.waitUntil,
			query,
			sourceURL: source.url,
			timeoutMs: budget?.remaining(),
		});
		return { cached, credentials };
	};

	const serveManifest = async function serveManifest(
		request: Request,
		url: URL,
		context: ConsentRouteRequestContext
	): Promise<Response> {
		if (options.manifest) {
			return Response.json(options.manifest);
		}
		const { cached, credentials } = await readManifest(
			request,
			context,
			resolveManifestSource(request, context),
			undefined,
			readLanguageQuery(url)
		);
		const headers = new Headers({ 'content-type': 'application/json' });
		for (const name of MANIFEST_PASSTHROUGH_HEADERS) {
			const value = cached.headers[name];
			if (value) {
				headers.set(name, value);
			}
		}
		if (credentials) {
			headers.set('cache-control', 'private, no-store');
			headers.delete('etag');
			headers.delete('last-modified');
			return new Response(JSON.stringify(cached.manifest), { headers });
		}
		headers.set('age', String(getManifestAge(cached)));
		const { etag } = cached.headers;
		if (etag && request.headers.get('if-none-match') === etag) {
			return new Response(null, { headers, status: 304 });
		}
		return new Response(JSON.stringify(cached.manifest), { headers });
	};

	const createGvlLoader = function createGvlLoader(
		manifest: ConsentManifest,
		budget: Budget,
		context: ConsentRouteRequestContext
	): (language: string) => Promise<GlobalVendorList | null> {
		const reference = manifest.iab?.gvl;
		return async function loadGvl(language) {
			if (!reference) {
				return null;
			}
			const fill = options.fetchGvl
				? options.fetchGvl({ fetch: configuredFetch(), language, reference })
				: fetchCachedGvl({
						fetch: options.fetch,
						headers: c15tProtocolHeaders,
						label: adapter,
						language,
						url: reference.url,
					});
			if (budget.budgetMs === undefined) {
				return await fill;
			}
			try {
				return await budget.bound(fill);
			} catch (error) {
				if (isBudgetTimeout(error)) {
					keepAlive(context.waitUntil, fill);
				}
				throw error;
			}
		};
	};

	const inProcessProviderCache: AdTechProviderCache = new Map();

	const createAdTechProviderLoader = function createAdTechProviderLoader(
		request: Request,
		budget: Budget,
		context: ConsentRouteRequestContext
	): NonNullable<ResolveConsentInitOptions['loadAdTechProviders']> {
		return async function loadAdTechProviders(reference) {
			const target = resolveTarget(reference.url, request, context);
			if (!target) {
				return undefined;
			}
			const fill = fetchCachedAdTechProviders({
				...(target.inProcess && { cache: inProcessProviderCache }),
				fetch: (target.fetch ?? configuredFetch()) as typeof globalThis.fetch,
				headers: c15tProtocolHeaders,
				reference: { ...reference, url: target.url },
			});
			if (budget.budgetMs === undefined) {
				return await fill;
			}
			try {
				return await budget.bound(fill);
			} catch (error) {
				if (isBudgetTimeout(error)) {
					keepAlive(context.waitUntil, fill);
				}
				return undefined;
			}
		};
	};

	const initHeaders = {
		'cache-control': INIT_CACHE_CONTROL,
		[POLICY_CONTRACT_HEADER]: String(POLICY_CONTRACT_VERSION),
	};

	const fallBackToBackendInit = async function fallBackToBackendInit(
		request: Request,
		context: ConsentRouteRequestContext,
		budget: Budget,
		cause: unknown
	): Promise<Response> {
		if (!options.backendURL || options.manifest || !canFallBackToInit(cause)) {
			throw cause;
		}
		if (budget.expired()) {
			throw new ManifestUnavailableError(
				'timeout',
				`c15t: consent resolution did not finish within ${budget.budgetMs} ms.`,
				{ cause }
			);
		}
		const backend = resolveBackend(request, context, options.backendURL);
		const forward: Record<string, string> = { ...c15tProtocolHeaders };
		for (const name of CONSENT_REQUEST_HEADER_NAMES) {
			const value = request.headers.get(name);
			if (value) {
				forward[name] = value;
			}
		}
		const journey = readJourneyParams(request.url);
		if (journey) {
			const origin = request.headers.get('origin');
			forward.origin =
				origin && origin !== 'null' ? origin : new URL(request.url).origin;
		}
		const init: RequestInit = { headers: forward };
		const left = budget.remaining();
		if (left !== undefined) {
			init.signal = AbortSignal.timeout(Math.max(0, left));
		}
		const fetchImpl = backend.fetch ?? configuredFetch();
		const { payload, response } = await budget.bound(
			(async () => {
				const upstream = await fetchImpl(
					journey
						? appendJourneyParams(`${backend.url}/init`, journey)
						: `${backend.url}/init`,
					init
				);
				if (!upstream.ok) {
					throw cause;
				}
				return {
					payload: (await upstream.json()) as InitOutput,
					response: upstream,
				};
			})()
		);
		const mapped = mapInitOutputToInitResponse(payload, forward, {
			producerContract: readProducerPolicyContract(response.headers),
		});
		const output: InitOutput = {
			adTechProviders: mapped.adTechProviders,
			branding: payload.branding,
			cmpId: mapped.cmpId,
			customVendors: mapped.customVendors,
			gvl: mapped.gvl,
			gvlReference: mapped.gvlReference,
			hosting: mapped.hosting,
			location: payload.location,
			policyResolution: writePolicyResolutionWire(
				readPolicyResolutionWire(mapped.policyResolution)
			),
			policySnapshotToken: mapped.policySnapshotToken,
			resolvedPrivacySignals: mapped.resolvedPrivacySignals,
			subjectId: mapped.subjectId,
			translations: payload.translations,
			vendorListVersion: mapped.vendorListVersion,
			vendors: mapped.vendors,
		} as InitOutput;
		return Response.json(
			negotiateInit(output, request.headers.get(POLICY_CONTRACT_HEADER)),
			{ headers: initHeaders }
		);
	};

	const serveInit = async function serveInit(
		incoming: Request,
		url: URL,
		context: ConsentRouteRequestContext
	): Promise<Response> {
		const request = INIT_PARAM_HEADERS.some(([param]) =>
			url.searchParams.has(param)
		)
			? new Request(incoming, {
					headers: applyInitParamsToHeaders(url, incoming.headers),
				})
			: incoming;
		const budget = createBudget(
			readTimeoutMs(request.headers.get(CONSENT_ROUTE_TIMEOUT_HEADER))
		);
		let manifest: ConsentManifest;
		if (options.manifest) {
			({ manifest } = options);
		} else {
			const source = resolveManifestSource(request, context);
			try {
				({
					cached: { manifest },
				} = await readManifest(request, context, source, budget, undefined));
			} catch (cause) {
				return await fallBackToBackendInit(request, context, budget, cause);
			}
		}
		const loadGvl = createGvlLoader(manifest, budget, context);
		const listResponse = await serveGvlReference(request, loadGvl);
		if (listResponse) {
			return listResponse;
		}
		const inputs = context.inputs
			? {
					...context.inputs,
					...queryOverrides(url),
					language: context.inputs.language ?? 'en',
				}
			: getResolverInputsFromHeaders(request.headers);
		const payload = await resolveConsentInit({
			clientContract: request.headers.get(POLICY_CONTRACT_HEADER),
			inputs,
			loadAdTechProviders: createAdTechProviderLoader(request, budget, context),
			loadGvl,
			manifest,
			report:
				options.reportSessions === false
					? undefined
					: {
							abandoned: () => request.signal.aborted,
							adapter,
							backendURL: options.backendURL,
							fetch: options.fetch as typeof globalThis.fetch | undefined,
							headers: request.headers,
							method: request.method,
							source: 'route',
							url: request.url,
							waitUntil: context.waitUntil,
						},
		});
		return Response.json(deferInitGvlToRoute(payload, url.pathname), {
			headers: initHeaders,
		});
	};

	const serveProxy = function serveProxy(
		request: Request,
		context: ConsentRouteRequestContext,
		path: string
	): Promise<Response> {
		if (!proxy) {
			return Promise.resolve(notFound());
		}
		if (!options.backendURL) {
			throw new Error(`${adapter}: pass backendURL to use proxy.`);
		}
		const backend = resolveBackend(request, context, options.backendURL);
		return forwardConsentRequest({
			adapter,
			backendURL: backend.url,
			fetch: backend.fetch as typeof globalThis.fetch | undefined,
			forwarding: context.forwarding
				? context.forwarding()
				: readRequestForwarding(request, trustForwardedHeaders),
			options: proxy,
			path,
			request,
		});
	};

	const dispatch = function dispatch(
		request: Request,
		context: ConsentRouteRequestContext
	): Promise<Response> {
		const url = new URL(request.url);
		const path =
			context.path === undefined
				? lastSegment(url.pathname)
				: trimPathSlashes(context.path);
		let { route } = context;
		if (route === undefined) {
			const method = request.method.toUpperCase();
			const readable = method === 'GET' || method === 'HEAD';
			if (readable && path === 'manifest') {
				route = 'manifest';
			} else if (
				readable &&
				(context.path === undefined || path === '' || path === 'init')
			) {
				route = 'init';
			} else {
				route = 'proxy';
			}
		}
		switch (route) {
			case 'manifest':
				return serveManifest(request, url, context);
			case 'init':
				return serveInit(request, url, context);
			default:
				return serveProxy(request, context, path);
		}
	};

	return async (request, context = {}) => {
		const work = dispatch(request, context);
		const { waitUntil } = context;
		if (!waitUntil) {
			return await work;
		}
		const { signal } = request;
		const onAbort = () => keepAlive(waitUntil, work);
		signal.addEventListener('abort', onAbort, { once: true });
		try {
			return await work;
		} finally {
			signal.removeEventListener('abort', onAbort);
		}
	};
};
