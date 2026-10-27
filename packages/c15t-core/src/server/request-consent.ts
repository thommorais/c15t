import {
	appendJourneyParams,
	CONSENT_EXPERIMENT_HEADER,
	CONSENT_REQUEST_HEADER_NAMES,
	consentInputsToOverrides,
	extractConsentRequestInputs,
	formatExperimentHeader,
	getIpAddress,
	isSpeculativeRequest,
	journeyDomainFrom,
	POLICY_CONTRACT_VERSION,
} from '@c15t/schema/types';
import type {
	ConsentManifest,
	ConsentRequestHeaderInputs,
	InitOutput,
	ResolveInitFromManifestInputs,
	SessionJourney,
} from '@c15t/schema/types';

import type { StorageConfig } from '../libs/cookie/types';
import { experimentArmRef } from '../libs/experiment';
import type { ExperimentState, ServerExperiment } from '../libs/experiment';
import { failedResponseError } from '../libs/failed-response';
import { createJourneyId } from '../libs/journey';
import type { ConsentJourneyOption, JourneyState } from '../libs/journey';
import {
	DEFAULT_RESOLVE_TIMEOUT_MS,
	fetchCachedManifest,
	ManifestUnavailableError,
	withResolutionBudget,
} from '../libs/manifest-cache-runtime';
import type {
	ManifestCache,
	ManifestFetch,
} from '../libs/manifest-cache-runtime';
import { resolveSessionReportBackendURL } from '../libs/session-report';
import { readStoredRecordsFromCookieHeader } from '../modules/persistence/hydrate';
import { resolveStorageKeys } from '../modules/persistence/record-storage';
import { fetchCachedAdTechProviders } from '../transports/ad-tech-provider-cache';
import { deferInitGvl, deferInitGvlToRoute } from '../transports/gvl-reference';
import {
	mapInitOutputToInitResponse,
	mergeInitResponseIntoKernelConfig,
} from '../transports/init-output';
import { createOfflineTransport } from '../transports/offline';
import type { OfflineTransportOptions } from '../transports/offline';
import {
	c15tProtocolHeaders,
	readProducerPolicyContract,
} from '../transports/version-header';
import type { KernelConfig } from '../types';
import {
	CONSENT_PROXY_FORWARDING_HEADERS,
	filterCookieHeader,
	isCleartextRemoteURL,
	stripIdentityForCleartext,
} from './consent-proxy';
import {
	CONSENT_ROUTE_TIMEOUT_HEADER,
	resolveConsentInit,
} from './consent-route';
import type { ConsentRouteFetchGvl } from './consent-route';
import { fetchCachedGvl } from './gvl-cache';
import {
	resolveRequestBackendURL,
	resolveRequestOrigin,
} from './request-origin';
import type { RequestHeaderSource } from './request-origin';

export const DEFAULT_CONSENT_ROUTE_PREFIX = '/api/c15t';

const RENDER_REQUEST_HEADER = 'x-c15t-render-request';

export type RequestConsentState = Omit<KernelConfig, 'transport'> &
	ExperimentState &
	JourneyState;

export interface ConsentRequestFacts {
	url?: string | URL;
	headers?: RequestHeaderSource;
	cookie?: string | null;
	inputs?: ConsentRequestHeaderInputs;
}

export type RequestConsentMode = 'hosted' | 'manifest' | 'offline';

export interface ResolveRequestConsentOptions {
	adapter: string;
	request: ConsentRequestFacts;
	overrides?: Pick<
		ConsentRequestHeaderInputs,
		'country' | 'language' | 'region'
	>;
	storage?: StorageConfig;
	now?: number;
	shared?: boolean;
	seed?: Partial<RequestConsentState>;
	mode?: RequestConsentMode;
	backendURL?: string;
	manifestURL?: string;
	manifest?: ConsentManifest;
	initURL?: string;
	offline?: OfflineTransportOptions;
	ownRoutes?: readonly string[];
	localFetch?: ManifestFetch;
	fetch?: typeof globalThis.fetch;
	manifestFetchInit?: Omit<RequestInit, 'headers' | 'method'>;
	initHeaders?: Record<string, string>;
	forwardHeaders?: readonly string[];
	cookieNames?: readonly string[];
	trustForwardedHeaders?: boolean;
	timeoutMs?: number | false;
	waitUntil?: (task: Promise<void>) => void;
	reportSessions?: boolean;
	journey?: ConsentJourneyOption;
	experiment?: ServerExperiment;
	gvlRoute?: string;
	fetchGvl?: ConsentRouteFetchGvl;
	cache?: ManifestCache;
	onError?: (error: unknown, url: string | undefined) => void;
}

export interface RequestConsentRead {
	state: RequestConsentState;
	inputs: ConsentRequestHeaderInputs;
}

class RequestConsentError extends Error {
	readonly url: string | undefined;

	constructor(message: string, url: string | undefined, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = 'RequestConsentError';
		this.url = url;
	}
}

const readHeader = function readHeader(
	headers: RequestHeaderSource | undefined,
	name: string
): string | undefined {
	if (!headers) {
		return undefined;
	}
	if (typeof (headers as Headers).get === 'function') {
		return (headers as Headers).get(name) ?? undefined;
	}
	const lower = name.toLowerCase();
	const value = Object.entries(
		headers as Record<string, string | string[] | undefined>
	).find(([key]) => key.toLowerCase() === lower)?.[1];
	return Array.isArray(value) ? value[0] : value;
};

const toHeaders = function toHeaders(
	headers: RequestHeaderSource | undefined
): Headers {
	if (headers instanceof Headers) {
		return headers;
	}
	const result = new Headers();
	for (const [name, value] of Object.entries(headers ?? {})) {
		const first = Array.isArray(value) ? value[0] : value;
		if (first !== undefined) {
			result.set(name, first);
		}
	}
	return result;
};

const configuredOverrides = function configuredOverrides(
	overrides: ResolveRequestConsentOptions['overrides']
): ConsentRequestHeaderInputs {
	const inputs: ConsentRequestHeaderInputs = {};
	if (overrides?.country) {
		inputs.country = overrides.country;
	}
	if (overrides?.region) {
		inputs.region = overrides.region;
	}
	if (overrides?.language) {
		inputs.language = overrides.language;
	}
	return inputs;
};

const readInputs = function readInputs(
	options: ResolveRequestConsentOptions
): ConsentRequestHeaderInputs {
	const configured = configuredOverrides(options.overrides);
	if (options.shared) {
		return configured;
	}
	const { request } = options;
	if (request.inputs) {
		return { ...request.inputs, ...configured };
	}
	return extractConsentRequestInputs(
		(request.headers ?? {}) as Headers,
		configured
	);
};

export const readRequestConsent = function readRequestConsent(
	options: ResolveRequestConsentOptions
): RequestConsentRead {
	const inputs = readInputs(options);
	const state: RequestConsentState = { ...options.seed };
	if (!options.shared) {
		const now = options.now ?? Date.now();
		const cookie =
			options.request.cookie ?? readHeader(options.request.headers, 'cookie');
		state.initialRecords = readStoredRecordsFromCookieHeader(
			cookie ?? undefined,
			options.storage,
			now
		);
		state.initialPrivacySignals = { gpc: inputs.gpc };
		state.now = now;
	}
	const overrides = consentInputsToOverrides({ ...inputs, gpc: undefined });
	if (Object.keys(overrides).length > 0) {
		state.initialOverrides = {
			...state.initialOverrides,
			...overrides,
		};
	}
	return { inputs, state };
};

export const resolveRenderBudgetMs = function resolveRenderBudgetMs(
	value: number | false | undefined
): number | undefined {
	if (value === false || value === Number.POSITIVE_INFINITY) {
		return undefined;
	}
	if (value === undefined || !Number.isFinite(value) || value < 0) {
		return DEFAULT_RESOLVE_TIMEOUT_MS;
	}
	return value;
};

const resolveMode = function resolveMode(
	options: ResolveRequestConsentOptions
): RequestConsentMode | undefined {
	if (options.mode) {
		return options.mode;
	}
	if (options.offline) {
		return 'offline';
	}
	if (options.manifest || options.manifestURL) {
		return 'manifest';
	}
	if (options.initURL || options.backendURL) {
		return 'hosted';
	}
	return undefined;
};

const startServerJourney = function startServerJourney(
	options: ResolveRequestConsentOptions,
	mode: RequestConsentMode | undefined,
	base: RequestConsentState,
	read: () => { domain: string | undefined; speculative: boolean }
): SessionJourney | null | undefined {
	if (options.shared || !mode || mode === 'offline') {
		return undefined;
	}
	const enabled = options.journey !== false;
	const unreported =
		mode === 'manifest' &&
		!resolveSessionReportBackendURL({ backendURL: options.backendURL });
	if (!enabled || options.reportSessions === false || unreported) {
		return null;
	}
	const { domain, speculative } = read();
	const id = speculative ? undefined : createJourneyId();
	if (!id) {
		return null;
	}
	const journey: SessionJourney = {
		id,
		scope: 'page',
		storedChoice: Boolean(
			base.initialRecords?.choice || base.initialRecords?.noticeDismissal
		),
	};
	if (domain) {
		journey.domain = domain;
	}
	return journey;
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
	const settled = settle(task);
	try {
		waitUntil?.(settled);
	} catch {
	}
};

const isPath = (url: string): boolean =>
	url.startsWith('/') && !url.startsWith('//');

const trimSlash = (url: string): string =>
	url.endsWith('/') ? url.slice(0, -1) : url;

const isBelow = function isBelow(pathname: string, prefix: string): boolean {
	const normalized = trimSlash(prefix);
	return (
		normalized !== '' &&
		(pathname === normalized || pathname.startsWith(`${normalized}/`))
	);
};

const IN_PROCESS_ORIGIN = 'http://localhost';

const toPathFetch = function toPathFetch(
	localFetch: ManifestFetch
): ManifestFetch {
	return (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input);
		return localFetch(`${url.pathname}${url.search}`, init);
	};
};

interface Target {
	url: string;
	fetch: ManifestFetch;
	inProcess: boolean;
	sameOrigin: boolean;
}

export const resolveRequestConsent = async function resolveRequestConsent(
	options: ResolveRequestConsentOptions
): Promise<RequestConsentState> {
	const { inputs, state: base } = readRequestConsent(options);
	const mode = resolveMode(options);
	const trust = options.trustForwardedHeaders === true;
	let visitorHeaders: Headers | undefined;
	const readVisitorHeaders = (): Headers => {
		visitorHeaders ??= toHeaders(options.request.headers);
		return visitorHeaders;
	};
	const requestOrigin = (): string | null =>
		resolveRequestOrigin({
			headers: options.request.headers,
			requestURL: options.request.url,
			trustForwardedHeaders: trust,
		});
	const journey = startServerJourney(options, mode, base, () => ({
		domain: journeyDomainFrom(requestOrigin()),
		speculative: isSpeculativeRequest(readVisitorHeaders()),
	}));
	const carry = function carry(
		state: RequestConsentState
	): RequestConsentState {
		const carried: RequestConsentState =
			options.experiment && !options.shared
				? { ...state, experiment: options.experiment }
				: state;
		if (journey === undefined) {
			return carried;
		}
		return { ...carried, journey: journey && { id: journey.id } };
	};
	if (!mode || (options.shared && mode !== 'offline')) {
		return carry(base);
	}

	const budgetMs = resolveRenderBudgetMs(options.timeoutMs);
	const startedAt = Date.now();
	const remaining = (): number | undefined =>
		budgetMs === undefined
			? undefined
			: Math.max(0, budgetMs - (Date.now() - startedAt));
	let abandoned = false;
	const ownRoutes = options.ownRoutes ?? [DEFAULT_CONSENT_ROUTE_PREFIX];
	const configuredFetch = (): typeof globalThis.fetch =>
		options.fetch ?? globalThis.fetch.bind(globalThis);
	const arm =
		options.experiment && !options.shared && !base.initialRecords?.choice
			? experimentArmRef(options.experiment)
			: undefined;
	const isOwnRoute = function isOwnRoute(absolute: string): boolean {
		const origin = requestOrigin();
		let target: URL;
		try {
			target = new URL(absolute);
		} catch {
			return false;
		}
		return ownRoutes.some((route) => {
			if (isPath(route)) {
				return target.origin === origin && isBelow(target.pathname, route);
			}
			try {
				const own = new URL(route);
				return (
					target.origin === own.origin && isBelow(target.pathname, own.pathname)
				);
			} catch {
				return false;
			}
		});
	};

	const resolveTarget = function resolveTarget(url: string): Target {
		if (options.localFetch && isPath(url)) {
			return {
				fetch: options.localFetch,
				inProcess: true,
				sameOrigin: false,
				url,
			};
		}
		const absolute = resolveRequestBackendURL(url, {
			headers: options.request.headers,
			requestURL: options.request.url,
			trustForwardedHeaders: trust,
		});
		if (absolute && options.localFetch) {
			const parsed = new URL(absolute);
			if (parsed.origin === requestOrigin()) {
				return {
					fetch: options.localFetch,
					inProcess: true,
					sameOrigin: false,
					url: `${parsed.pathname}${parsed.search}`,
				};
			}
		}
		if (!absolute) {
			throw new RequestConsentError(
				`${options.adapter}: ${url} could not be resolved for this request; pass an absolute URL or make sure the request URL or host header reaches the server.`,
				url
			);
		}
		if (isOwnRoute(absolute)) {
			throw new RequestConsentError(
				`${options.adapter}: ${absolute} is this app's own consent route; a server render does not fetch itself. Point the server at the upstream backend or manifest instead.`,
				absolute
			);
		}
		const sameOrigin = new URL(absolute).origin === requestOrigin();
		if (
			sameOrigin &&
			readHeader(options.request.headers, RENDER_REQUEST_HEADER) !== undefined
		) {
			throw new RequestConsentError(
				`${options.adapter}: this request came from a server render on this origin, so the render it started does not fetch ${absolute} again. A page answered that render's request; check that the backend URL reaches the backend.`,
				absolute
			);
		}
		return {
			fetch: configuredFetch() as ManifestFetch,
			inProcess: false,
			sameOrigin,
			url: absolute,
		};
	};

	const namedHeaders = function namedHeaders(): Record<string, string> {
		const named: Record<string, string> = {};
		for (const name of options.forwardHeaders ?? []) {
			const lower = name.toLowerCase();
			if (lower === 'cookie' || CONSENT_PROXY_FORWARDING_HEADERS.has(lower)) {
				continue;
			}
			const value = readHeader(options.request.headers, lower);
			if (value) {
				named[lower] = value;
			}
		}
		return named;
	};

	const inputHeaders = function inputHeaders(): Record<string, string> {
		const headers: Record<string, string> = {};
		if (inputs.country) {
			headers['x-c15t-country'] = inputs.country;
		}
		if (inputs.region) {
			headers['x-c15t-region'] = inputs.region;
		}
		if (inputs.language) {
			headers['accept-language'] = inputs.language;
		}
		if (inputs.gpc !== undefined) {
			headers['sec-gpc'] = inputs.gpc ? '1' : '0';
		}
		return headers;
	};

	const resolverInputs = (): ResolveInitFromManifestInputs => ({
		country: inputs.country ?? null,
		gpc: inputs.gpc,
		language: inputs.language ?? 'en',
		region: inputs.region ?? null,
	});

	const manifestCredentials = function manifestCredentials(
		source: Target
	): Record<string, string> | undefined {
		const collected = namedHeaders();
		const cookie = readHeader(options.request.headers, 'cookie');
		const scoped =
			cookie && options.cookieNames
				? filterCookieHeader(cookie, options.cookieNames)
				: undefined;
		if (scoped) {
			collected.cookie = scoped;
		}
		const credentials = source.inProcess
			? collected
			: stripIdentityForCleartext(collected, source.url);
		return credentials && Object.keys(credentials).length > 0
			? credentials
			: undefined;
	};

	const loadManifest = async function loadManifest(): Promise<{
		manifest: ConsentManifest;
		credentials: Record<string, string> | undefined;
	}> {
		if (options.manifest) {
			return { credentials: undefined, manifest: options.manifest };
		}
		const sourceURL =
			options.manifestURL ??
			(options.backendURL
				? `${trimSlash(options.backendURL)}/manifest`
				: undefined);
		if (!sourceURL) {
			throw new RequestConsentError(
				`${options.adapter}: pass backendURL or manifestURL.`,
				undefined
			);
		}
		const source = resolveTarget(sourceURL);
		const credentials = manifestCredentials(source);
		try {
			const { manifest } = await fetchCachedManifest({
				cache: options.cache,
				fetch: source.inProcess ? toPathFetch(source.fetch) : source.fetch,
				headers: credentials,
				init: options.manifestFetchInit,
				onBackgroundRevalidate: options.waitUntil,
				sourceURL: source.inProcess
					? `${IN_PROCESS_ORIGIN}${source.url}`
					: source.url,
				timeoutMs: remaining(),
			});
			return { credentials, manifest };
		} catch (error) {
			throw new RequestConsentError(
				`${options.adapter}: the manifest at ${source.url} could not be read.`,
				source.url,
				error
			);
		}
	};

	const loadGvlFor = function loadGvlFor(manifest: ConsentManifest) {
		const reference = manifest.iab?.gvl;
		if (!reference) {
			return undefined;
		}
		return (language: string) =>
			options.fetchGvl
				? options.fetchGvl({ fetch: configuredFetch(), language, reference })
				: fetchCachedGvl({
						fetch: options.fetch as ManifestFetch | undefined,
						headers: c15tProtocolHeaders,
						label: options.adapter,
						language,
						url: reference.url,
					});
	};

	const deferList = function deferList(
		payload: InitOutput,
		listURL: string
	): InitOutput {
		return options.gvlRoute
			? deferInitGvlToRoute(payload, options.gvlRoute)
			: (deferInitGvl(payload, listURL) as InitOutput);
	};

	const resolveFromManifest =
		async function resolveFromManifest(): Promise<RequestConsentState> {
			const { credentials, manifest } = await loadManifest();
			const reference = manifest.iab?.gvl;
			const payload = await resolveConsentInit({
				inputs: resolverInputs(),
				loadAdTechProviders: (providerReference) => {
					const target = resolveTarget(providerReference.url);
					return fetchCachedAdTechProviders({
						fetch: target.fetch as typeof globalThis.fetch,
						headers: c15tProtocolHeaders,
						reference: { ...providerReference, url: target.url },
					});
				},
				loadGvl: loadGvlFor(manifest),
				manifest,
				report:
					options.reportSessions === false
						? undefined
						: {
								abandoned: () => abandoned,
								adapter: options.adapter,
								backendURL: options.backendURL,
								experiment: arm,
								fetch: options.fetch,
								headers: readVisitorHeaders(),
								journey: journey ?? undefined,
								source: 'render',
								waitUntil: options.waitUntil,
							},
			});
			const deferred =
				reference && !options.fetch && !options.fetchGvl && !credentials
					? deferList(payload, reference.url)
					: payload;
			return mergeInitResponseIntoKernelConfig(
				base,
				mapInitOutputToInitResponse(
					deferred,
					inputs.gpc === undefined ? {} : { 'sec-gpc': inputs.gpc ? '1' : '0' },
					{ producerContract: POLICY_CONTRACT_VERSION }
				)
			);
		};

	const identityHeaders = function identityHeaders(
		target: Target
	): Record<string, string> {
		if (!(target.inProcess || !isCleartextRemoteURL(target.url))) {
			return {};
		}
		const headers = namedHeaders();
		const cookie = target.inProcess
			? undefined
			: (options.request.cookie ??
				readHeader(options.request.headers, 'cookie'));
		const consentCookie = cookie
			? filterCookieHeader(cookie, [
					resolveStorageKeys(options.storage).consent,
				])
			: undefined;
		if (consentCookie) {
			headers.cookie = consentCookie;
		}
		const clientIp = trust
			? getIpAddress(readVisitorHeaders(), { masking: false })
			: null;
		if (clientIp) {
			headers['x-forwarded-for'] = clientIp;
		}
		return headers;
	};

	const nameThePage = function nameThePage(
		headers: Record<string, string>,
		target: Target
	): void {
		if (!journey || target.inProcess || headers.origin !== undefined) {
			return;
		}
		const origin = requestOrigin();
		if (origin) {
			headers.origin = origin;
		}
	};

	const resolveFromHosted =
		async function resolveFromHosted(): Promise<RequestConsentState> {
			const initURL =
				options.initURL ??
				(options.backendURL ? `${trimSlash(options.backendURL)}/init` : '');
			const target = resolveTarget(initURL);
			const headers: Record<string, string> = { accept: 'application/json' };
			const userAgent = readHeader(options.request.headers, 'user-agent');
			if (userAgent) {
				headers['user-agent'] = userAgent;
			}
			const identity = identityHeaders(target);
			const identifying =
				identity.cookie !== undefined ||
				Object.keys(identity).some(
					(name) => name !== 'cookie' && name !== 'x-forwarded-for'
				);
			Object.assign(headers, identity);
			Object.assign(headers, inputHeaders());
			for (const [name, value] of Object.entries(options.initHeaders ?? {})) {
				const lower = name.toLowerCase();
				if (
					(CONSENT_REQUEST_HEADER_NAMES as readonly string[]).includes(lower)
				) {
					headers[lower] = value;
				}
			}
			if (arm) {
				headers[CONSENT_EXPERIMENT_HEADER] = formatExperimentHeader(arm);
			}
			nameThePage(headers, target);
			Object.assign(headers, c15tProtocolHeaders);
			if (target.sameOrigin) {
				headers[RENDER_REQUEST_HEADER] = '1';
			}
			const left = remaining();
			if (target.inProcess && left !== undefined) {
				headers[CONSENT_ROUTE_TIMEOUT_HEADER] = String(Math.floor(left));
			}
			const init: RequestInit = { cache: 'no-store', headers, method: 'GET' };
			if (left !== undefined) {
				init.signal = AbortSignal.timeout(left);
			}
			let response: Response;
			let payload: InitOutput;
			try {
				response = await target.fetch(
					journey ? appendJourneyParams(target.url, journey) : target.url,
					init
				);
				if (!response.ok) {
					throw await failedResponseError('/init', response);
				}
				payload = (await response.json()) as InitOutput;
			} catch (error) {
				throw new RequestConsentError(
					`${options.adapter}: the request to ${target.url} failed (${error instanceof Error ? error.message : String(error)}).`,
					target.url,
					error
				);
			}
			const deferred =
				options.fetch || identifying
					? payload
					: (deferInitGvl(payload, target.url, 'init', headers) as InitOutput);
			return mergeInitResponseIntoKernelConfig(
				base,
				mapInitOutputToInitResponse(deferred, headers, {
					producerContract: readProducerPolicyContract(response.headers),
				})
			);
		};

	const resolveOffline =
		async function resolveOffline(): Promise<RequestConsentState> {
			const transport = createOfflineTransport(options.offline ?? {});
			const response = await transport.init?.({
				overrides: base.initialOverrides ?? {},
				user: base.initialUser ?? null,
			});
			return mergeInitResponseIntoKernelConfig(base, response ?? undefined);
		};

	const run = (): Promise<RequestConsentState> => {
		switch (mode) {
			case 'manifest':
				return resolveFromManifest();
			case 'offline':
				return resolveOffline();
			default:
				return resolveFromHosted();
		}
	};

	let task: Promise<RequestConsentState> | undefined;
	try {
		task = run();
		return carry(await withResolutionBudget(task, remaining()));
	} catch (error) {
		const expired =
			(error instanceof ManifestUnavailableError &&
				error.reason === 'timeout') ||
			remaining() === 0;
		if (expired) {
			abandoned = true;
			if (task) {
				keepAlive(options.waitUntil, task);
			}
		}
		options.onError?.(
			error,
			error instanceof RequestConsentError ? error.url : undefined
		);
		return carry(base);
	}
};
