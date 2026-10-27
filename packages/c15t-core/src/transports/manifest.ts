import {
	POLICY_CONTRACT_VERSION,
	resolveInitFromManifest,
} from '@c15t/schema/types';
import type {
	ConsentManifest,
	ConsentManifestGVLReference,
	ConsentSessionSource,
	GlobalVendorList,
	InitOutput,
	ResolveInitFromManifestInputs,
} from '@c15t/schema/types';
import { baseTranslations } from '@c15t/translations/all';
import type { BaseTranslations } from '@c15t/translations/all';

import { failedResponseError } from '../libs/failed-response';
import { isValidSubjectId } from '../libs/generate-subject-id';
import { createUnreportedJourneys } from '../libs/journey';
import {
	reportConsentSession,
	resolveSessionReportBackendURL,
} from '../libs/session-report';
import type { SessionReportHeaders } from '../libs/session-report';
import type {
	InitContext,
	KernelOverrides,
	KernelTransport,
	KernelUser,
	SaveResult,
} from '../types';
import {
	fetchCachedAdTechProviders,
	loadManifestAdTechProviders,
} from './ad-tech-provider-cache';
import {
	buildDecisionAssertion,
	rememberDecisionInputs,
} from './decision-inputs';
import type { RememberedDecisionInputs } from './decision-inputs';
import { fetchCachedGvl } from './gvl-cache';
import { deferInitGvl, deferInitGvlToRoute } from './gvl-reference';
import { mapInitOutputToInitResponse } from './init-output';
import type { TransportInitResponse } from './init-output';
import { saveFailure } from './save-rejection';
import { buildSubjectPostBody, subjectsURL } from './subject-body';
import type { SubjectSavePayload } from './subject-body';
import {
	mapSubjectRecordToHydrationRecords,
	reviveSubjectRecord,
} from './subject-record';
import type { TransportHydrationRecords } from './subject-record';
import { c15tProtocolHeaders } from './version-header';

const getDefined = <Value>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

export interface ManifestTransportOptions {
	deferGvl?: boolean;
	gvlRoute?: string;
	baseTranslations?: BaseTranslations;

	manifestURL?: string;

	snapshot?: ConsentManifest;

	backendURL?: string;

	fetch?: typeof globalThis.fetch;

	fetchGvl?: (input: {
		reference: ConsentManifestGVLReference;
		language: string;
		fetch: typeof globalThis.fetch;
	}) => Promise<GlobalVendorList | null>;

	inputs?: ResolveInitFromManifestInputs;

	initialInit?: InitOutput;

	headers?: Record<string, string>;

	credentials?: RequestCredentials;

	domain?: string;

	now?: () => number;

	report?: ManifestTransportReportOptions;
}

export interface ManifestTransportReportOptions {
	source: ConsentSessionSource;
	backendURL?: string;
	adapter?: string;
	headers?: SessionReportHeaders;
	method?: string;
	waitUntil?: (task: Promise<void>) => void;
}

export interface ManifestKernelTransport extends KernelTransport {
	init: (ctx: InitContext) => Promise<TransportInitResponse>;
	save: (payload: SubjectSavePayload) => Promise<SaveResult>;
	identify: (user: KernelUser, subjectId: string | null) => Promise<void>;
	loadSubjectRecord: (
		subjectId: string
	) => Promise<TransportHydrationRecords | null>;
}

const trimSlash = function trimSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
};

const deriveBackendURL = function deriveBackendURL(
	options: ManifestTransportOptions
): string {
	if (options.backendURL) {
		return trimSlash(options.backendURL);
	}
	if (!options.manifestURL) {
		return '';
	}

	const withoutQuery =
		options.manifestURL.split(/[?#]/u)[0] ?? options.manifestURL;
	const trimmed = trimSlash(withoutQuery);
	return trimmed.endsWith('/manifest')
		? trimmed.slice(0, -'/manifest'.length)
		: trimmed;
};

const resolveEndpoint = function resolveEndpoint(
	url: string,
	base: string | undefined
): string {
	if (!base) {
		return url;
	}
	try {
		return new URL(url, base).href;
	} catch {
		return url;
	}
};

const resolveDomain = function resolveDomain(
	backendURL: string,
	explicit: string | undefined
): string {
	if (explicit) {
		return explicit;
	}
	if (typeof window !== 'undefined' && window.location?.hostname) {
		return window.location.hostname;
	}
	try {
		return new URL(backendURL).hostname;
	} catch {
		return 'localhost';
	}
};

const toHeadersFromInputs = function toHeadersFromInputs(
	inputs: ResolveInitFromManifestInputs
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (inputs.gpc === true) {
		headers['sec-gpc'] = '1';
	} else if (inputs.gpc === false) {
		headers['sec-gpc'] = '0';
	}
	return headers;
};

const mergeInputs = function mergeInputs(
	optionsInputs: ResolveInitFromManifestInputs | undefined,
	overrides: Readonly<KernelOverrides>
): ResolveInitFromManifestInputs {
	return {
		...optionsInputs,
		country: overrides.country ?? optionsInputs?.country ?? null,
		gpc: overrides.gpc ?? optionsInputs?.gpc,
		language: overrides.language ?? optionsInputs?.language ?? 'en',
		region: overrides.region ?? optionsInputs?.region ?? null,
	};
};

const shouldFetchGvl = function shouldFetchGvl(
	manifest: ConsentManifest,
	payload: InitOutput
): boolean {
	const model =
		payload.policyResolution?.status === 'matched'
			? payload.policyResolution.policy.model
			: undefined;
	return (
		manifest.iab?.enabled === true &&
		manifest.iab.gvl !== undefined &&
		model === 'iab'
	);
};

const toSaveResult = function toSaveResult(data: unknown): SaveResult {
	const subjectId =
		typeof data === 'object' &&
		data !== null &&
		typeof (data as { subjectId?: unknown }).subjectId === 'string'
			? (data as { subjectId: string }).subjectId
			: undefined;
	return subjectId === undefined ? { ok: true } : { ok: true, subjectId };
};

const defaultFetchGvl = function defaultFetchGvl(input: {
	reference: ConsentManifestGVLReference;
	language: string;
	fetch: typeof globalThis.fetch;
}): Promise<GlobalVendorList | null> {
	return fetchCachedGvl({
		fetch: input.fetch,
		headers: c15tProtocolHeaders,
		label: 'c15t manifest transport',
		language: input.language,
		url: input.reference.url,
	});
};

export const createManifestTransport = function createManifestTransport(
	options: ManifestTransportOptions
): ManifestKernelTransport {
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!fetchImpl) {
		throw new Error(
			'createManifestTransport: no fetch available. Pass `fetch` in options.'
		);
	}
	if (!options.snapshot && !options.manifestURL) {
		throw new Error(
			'createManifestTransport: either `snapshot` or `manifestURL` is required.'
		);
	}

	const backendURL = deriveBackendURL(options);
	const credentials = options.credentials ?? 'include';
	const domain = resolveDomain(backendURL, options.domain);
	const now = options.now ?? Date.now;
	const jsonHeaders = {
		accept: 'application/json',
		'content-type': 'application/json',
		...c15tProtocolHeaders,
	};
	const requireBackendURL = function requireBackendURL(what: string): string {
		if (!backendURL) {
			throw new Error(
				`createManifestTransport: \`backendURL\` is required to ${what} when using a \`snapshot\` without \`manifestURL\`.`
			);
		}
		return backendURL;
	};
	const subjectURL = (subjectId: string): string =>
		`${requireBackendURL('read a subject')}/subjects/${encodeURIComponent(subjectId)}`;
	let manifestPromise: Promise<ConsentManifest> | undefined;
	const unreported = createUnreportedJourneys();
	const noteJourney = function noteJourney(
		journey: InitContext['journey']
	): void {
		const reportsTo =
			options.report &&
			resolveSessionReportBackendURL({
				backendURL: options.report.backendURL ?? options.backendURL,
			});
		if (reportsTo) {
			unreported.reported(journey);
		} else {
			unreported.resolvedLocally(journey);
		}
	};
	let lastDecisionInputs: RememberedDecisionInputs | undefined =
		options.initialInit
			? rememberDecisionInputs(options.initialInit, options.inputs?.gpc)
			: undefined;

	const getManifest = function getManifest(): Promise<ConsentManifest> {
		if (options.snapshot) {
			return Promise.resolve(options.snapshot);
		}
		if (!manifestPromise) {
			manifestPromise = (async () => {
				try {
					const response = await fetchImpl(getDefined(options.manifestURL), {
						credentials,
						headers: {
							accept: 'application/json',
							...c15tProtocolHeaders,
							...options.headers,
						},
						method: 'GET',
					});

					if (!response.ok) {
						throw await failedResponseError(
							'c15t manifest transport: /manifest',
							response
						);
					}

					return (await response.json()) as ConsentManifest;
				} catch (error) {
					manifestPromise = undefined;
					throw error;
				}
			})();
		}
		return manifestPromise;
	};

	return {
		async identify(user, subjectId): Promise<void> {
			if (!subjectId) {
				return;
			}
			const response = await fetchImpl(subjectURL(subjectId), {
				body: JSON.stringify({
					externalId: user.externalId,
					identityProvider: user.identityProvider,
					identityToken: user.identityToken,
				}),
				credentials,
				headers: jsonHeaders,
				method: 'PATCH',
			});
			if (response.status === 404 && isValidSubjectId(subjectId)) {
				return;
			}
			if (!response.ok) {
				throw await failedResponseError(
					'c15t manifest transport: /subjects/:id',
					response
				);
			}
		},

		async init(ctx: InitContext): Promise<TransportInitResponse> {
			const manifest = await getManifest();
			const inputs = mergeInputs(options.inputs, ctx.overrides);
			const { journey } = ctx;
			let payload: InitOutput = resolveInitFromManifest(manifest, inputs, {
				baseTranslations: options.baseTranslations ?? baseTranslations,
			});

			const providers = loadManifestAdTechProviders(
				manifest,
				payload,
				(reference) =>
					fetchCachedAdTechProviders({
						fetch: fetchImpl,
						headers: c15tProtocolHeaders,
						reference: {
							...reference,
							url: resolveEndpoint(
								reference.url,
								options.manifestURL ?? backendURL
							),
						},
					})
			);
			if (shouldFetchGvl(manifest, payload) && manifest.iab?.gvl) {
				const language = payload.translations.language.split('-')[0] || 'en';
				payload.gvl = await (options.fetchGvl ?? defaultFetchGvl)({
					fetch: fetchImpl,
					language,
					reference: manifest.iab.gvl,
				});
			}
			const adTechProviders = await providers;
			if (adTechProviders) {
				payload.adTechProviders = adTechProviders;
			}

			if (
				payload.gvl &&
				manifest.iab?.gvl &&
				(options.gvlRoute ||
					(options.deferGvl && !options.fetch && !options.fetchGvl))
			) {
				payload = options.gvlRoute
					? deferInitGvlToRoute(payload, options.gvlRoute)
					: deferInitGvl(payload, manifest.iab.gvl.url);
			}
			lastDecisionInputs = rememberDecisionInputs(payload, inputs.gpc);
			noteJourney(journey);
			if (options.report) {
				reportConsentSession({
					adapter: options.report.adapter,
					backendURL: options.report.backendURL ?? options.backendURL,
					experiment: ctx.experiment,
					fetch: fetchImpl,
					headers: options.report.headers ?? options.headers,
					init: payload,
					inputs,
					journey,
					manifest,
					method: options.report.method,
					source: options.report.source,
					waitUntil: options.report.waitUntil,
				});
			}
			return mapInitOutputToInitResponse(payload, toHeadersFromInputs(inputs), {
				producerContract: POLICY_CONTRACT_VERSION,
			});
		},

		async loadSubjectRecord(
			subjectId
		): Promise<TransportHydrationRecords | null> {
			const response = await fetchImpl(subjectURL(subjectId), {
				credentials,
				headers: { accept: 'application/json', ...c15tProtocolHeaders },
				method: 'GET',
			});
			if (response.status === 404) {
				return null;
			}
			if (!response.ok) {
				throw await failedResponseError(
					'c15t manifest transport: /subjects/:id',
					response
				);
			}
			const record = reviveSubjectRecord(await response.json());
			if (!record) {
				throw new Error(
					'c15t manifest transport: /subjects/:id returned an unreadable record'
				);
			}
			return mapSubjectRecordToHydrationRecords(record, { now: now() });
		},

		async save(saved): Promise<SaveResult> {
			const payload = unreported.strip(saved);
			const response = await fetchImpl(
				subjectsURL(requireBackendURL('save'), payload.journey),
				{
					body: JSON.stringify({
						...buildSubjectPostBody(payload, { domain }),
						...buildDecisionAssertion(payload, lastDecisionInputs),
					}),
					credentials,
					headers: jsonHeaders,
					method: 'POST',
				}
			);

			if (!response.ok) {
				throw await saveFailure(response, 'c15t manifest transport');
			}

			return toSaveResult(await response.json());
		},
	};
};
