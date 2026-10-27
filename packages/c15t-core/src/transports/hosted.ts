import {
	CONSENT_REQUEST_HEADER_NAMES,
	extractConsentRequestInputs,
} from '@c15t/schema/types';
import type { InitOutput } from '@c15t/schema/types';

import { failedResponseError } from '../libs/failed-response';
import { consumePrefetchedInitialData } from '../libs/prefetch/prefetch';
import { DEFAULT_INIT_CREDENTIALS } from '../libs/request-context-headers';
import type { SSRInitialData } from '../options/ssr';
import type { KernelOverrides, InitContext } from '../types';
import {
	decisionInputsMatchOverrides,
	gpcFromHeaders,
	rememberDecisionInputs,
} from './decision-inputs';
import type { RememberedDecisionInputs } from './decision-inputs';
import { createHostedInitRequest } from './hosted-init-request';
import {
	createHostedRecordTransport,
	resolveFetch,
	trimSlash,
} from './hosted-records';
import type { HostedRecordTransport } from './hosted-records';
import { mapInitOutputToInitResponse } from './init-output';
import type { TransportInitResponse } from './init-output';
import { readProducerPolicyContract } from './version-header';

export interface HostedTransportOptions {
	backendURL: string;

	initURL?: string;

	assertDecisionInputs?: boolean;

	fetch?: typeof globalThis.fetch;

	initialData?: Promise<SSRInitialData | undefined>;

	pagePrefetch?: boolean;

	decisionInputs?: RememberedDecisionInputs;

	headers?: Record<string, string>;

	credentials?: RequestCredentials;

	domain?: string;

	now?: () => number;
}

export interface HostedKernelTransport extends HostedRecordTransport {
	init: (ctx: InitContext) => Promise<TransportInitResponse>;
}

const INIT_HEADER_ALLOWLIST = new Set<string>(CONSENT_REQUEST_HEADER_NAMES);

const usablePrefetch = function usablePrefetch(
	prefetched: SSRInitialData | undefined,
	{ experiment, journey }: Pick<InitContext, 'experiment' | 'journey'>
): prefetched is SSRInitialData & { init: InitOutput } {
	if (!prefetched?.init) {
		return false;
	}
	const sentArm = prefetched.metadata?.experiment;
	if (
		sentArm !== undefined &&
		(sentArm?.id !== experiment?.id || sentArm?.arm !== experiment?.arm)
	) {
		return false;
	}
	const sent = prefetched.metadata?.journey;
	if (sent === undefined) {
		return true;
	}
	if (!journey) {
		return !sent;
	}
	return Boolean(
		sent && sent.id === journey.id && sent.storedChoice === journey.storedChoice
	);
};

const buildAllowedInitHeaders = function buildAllowedInitHeaders(
	headers: Record<string, string> | undefined
): Record<string, string> {
	const allowed: Record<string, string> = {};
	if (!headers) {
		return allowed;
	}
	for (const [name, value] of Object.entries(headers)) {
		const normalizedName = name.toLowerCase();
		if (INIT_HEADER_ALLOWLIST.has(normalizedName)) {
			allowed[normalizedName] = value;
		}
	}
	return allowed;
};

export const createHostedTransport = function createHostedTransport(
	options: HostedTransportOptions
): HostedKernelTransport {
	const base = trimSlash(options.backendURL);
	const initURL = options.initURL ?? `${base}/init`;
	const fetchImpl = resolveFetch(options.fetch);
	const initHeaders = buildAllowedInitHeaders(options.headers);
	const credentials = options.credentials ?? 'include';
	const initCredentials = options.credentials ?? DEFAULT_INIT_CREDENTIALS;
	let lastDecisionInputs = options.assertDecisionInputs
		? options.decisionInputs
		: undefined;

	let initGeneration = 0;
	let lastInitOverrides: KernelOverrides | undefined;

	const sameOverrides = function sameOverrides(
		left: KernelOverrides,
		right: KernelOverrides
	): boolean {
		return (
			left.country === right.country &&
			left.region === right.region &&
			left.language === right.language &&
			left.gpc === right.gpc
		);
	};

	let pendingInit: Promise<TransportInitResponse> | undefined;
	let { initialData } = options;
	const pagePrefetch = options.pagePrefetch ?? options.fetch === undefined;

	const prepareInit = (ctx: InitContext) => {
		if (options.assertDecisionInputs && lastDecisionInputs) {
			const stale = lastInitOverrides
				? !sameOverrides(lastInitOverrides, ctx.overrides)
				: !decisionInputsMatchOverrides(lastDecisionInputs, ctx.overrides);
			if (stale) {
				lastDecisionInputs = undefined;
			}
		}
		lastInitOverrides = { ...ctx.overrides };
	};

	const runInit = async (ctx: InitContext): Promise<TransportInitResponse> => {
		initGeneration += 1;
		const generation = initGeneration;
		prepareInit(ctx);
		const request = createHostedInitRequest({
			backendURL: base,
			credentials: initCredentials,
			experiment: ctx.experiment,
			headers: initHeaders,
			initURL,
			journey: ctx.journey,
			overrides: ctx.overrides,
		});
		const { requestHeaders } = request;
		const supplied =
			initialData ??
			(options.initURL || !pagePrefetch
				? undefined
				: consumePrefetchedInitialData({
						backendURL: base,
						credentials: initCredentials,
						overrides: {
							...extractConsentRequestInputs(new Headers(requestHeaders)),
							...ctx.overrides,
						},
					}));
		initialData = undefined;
		const prefetched: SSRInitialData | undefined =
			supplied && (await supplied.catch(() => undefined));
		if (usablePrefetch(prefetched, ctx)) {
			const headers = { ...requestHeaders };
			const gpc = prefetched.metadata?.requestContext?.gpc;
			if (gpc !== undefined) {
				headers['sec-gpc'] = gpc ? '1' : '0';
			}
			if (options.assertDecisionInputs && generation === initGeneration) {
				lastDecisionInputs = rememberDecisionInputs(
					prefetched.init,
					gpcFromHeaders(headers)
				);
			}
			const producerHeaders = new Headers();
			if (typeof prefetched.producerPolicyContract === 'string') {
				producerHeaders.set(
					'x-c15t-policy-contract',
					prefetched.producerPolicyContract
				);
			}
			return mapInitOutputToInitResponse(prefetched.init, headers, {
				producerContract: readProducerPolicyContract(producerHeaders),
			});
		}
		const response = await fetchImpl(request.url, request.init);

		if (!response.ok) {
			throw await failedResponseError('c15t hosted transport: /init', response);
		}

		const payload = (await response.json()) as InitOutput;
		if (options.assertDecisionInputs && generation === initGeneration) {
			lastDecisionInputs = rememberDecisionInputs(
				payload,
				gpcFromHeaders(requestHeaders) ??
					payload.resolvedPrivacySignals?.gpc ??
					(payload as InitOutput & { resolvedOverrides?: { gpc?: boolean } })
						.resolvedOverrides?.gpc
			);
		}
		return mapInitOutputToInitResponse(payload, requestHeaders, {
			producerContract: readProducerPolicyContract(response.headers),
		});
	};

	const records = createHostedRecordTransport(
		{
			backendURL: base,
			credentials,
			domain: options.domain,
			fetch: fetchImpl,
			now: options.now,
		},
		{
			inputs: () => lastDecisionInputs,
			pending: () => pendingInit,
			required: options.assertDecisionInputs === true,
		}
	);

	return {
		...records,
		async init(ctx: InitContext): Promise<TransportInitResponse> {
			const run = runInit(ctx);
			pendingInit = run;
			try {
				return await run;
			} finally {
				if (pendingInit === run) {
					pendingInit = undefined;
				}
			}
		},
	};
};
