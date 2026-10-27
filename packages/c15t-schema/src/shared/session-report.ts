import type { InitOutput } from '../api/init';
import type {
	ConsentSessionReport,
	ConsentSessionSource,
} from '../api/session';
import type { ConsentManifest } from './consent-manifest';
import { appendSearchParams } from './search-params';

export const CONSENT_SESSION_CLIENT_IP_HEADER = 'x-c15t-client-ip';

export const CONSENT_EXPERIMENT_HEADER = 'x-c15t-experiment';

const EXPERIMENT_TEXT_MAX = 128;

export interface SessionExperiment {
	id: string;
	arm: string;
}

export const formatExperimentHeader = function formatExperimentHeader(
	experiment: SessionExperiment
): string {
	return `${encodeURIComponent(experiment.id)}=${encodeURIComponent(experiment.arm)}`;
};

export const parseExperimentHeader = function parseExperimentHeader(
	value: string | null | undefined
): SessionExperiment | null {
	if (!value) {
		return null;
	}
	const separator = value.indexOf('=');
	if (separator <= 0 || separator === value.length - 1) {
		return null;
	}
	try {
		const id = decodeURIComponent(value.slice(0, separator));
		const arm = decodeURIComponent(value.slice(separator + 1));
		return id.length <= EXPERIMENT_TEXT_MAX && arm.length <= EXPERIMENT_TEXT_MAX
			? { arm, id }
			: null;
	} catch {
		return null;
	}
};

export const CONSENT_JOURNEY_PARAM = 'journey';

export const CONSENT_JOURNEY_SCOPE_PARAM = 'journeyScope';

export const CONSENT_JOURNEY_STORED_PARAM = 'stored';

export const LEGACY_CONSENT_JOURNEY_PARAMS = {
	id: 'c15tJourney',
	scope: 'c15tJourneyScope',
	stored: 'c15tStored',
} as const;

export type ConsentJourneyScope = 'page' | 'tab';

export interface ConsentJourneyParams {
	id: string;
	scope: ConsentJourneyScope;
	storedChoice?: boolean;
}

export type ConsentJourneyPrompt = 'due' | 'stored' | 'not-required';

const JOURNEY_ID =
	/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

export const parseJourneyId = function parseJourneyId(
	value: string | null | undefined
): string | null {
	return typeof value === 'string' && JOURNEY_ID.test(value)
		? value.toLowerCase()
		: null;
};

export const parseJourneyScope = function parseJourneyScope(
	value: string | null | undefined
): ConsentJourneyScope | null {
	return value === 'page' || value === 'tab' ? value : null;
};

const toSearchParams = function toSearchParams(
	source: string | URL | URLSearchParams
): URLSearchParams | null {
	if (source instanceof URLSearchParams) {
		return source;
	}
	if (source instanceof URL) {
		return source.searchParams;
	}
	const query = source.indexOf('?');
	if (query === -1) {
		return null;
	}
	const hash = source.indexOf('#', query);
	return new URLSearchParams(
		source.slice(query + 1, hash === -1 ? undefined : hash)
	);
};

const JOURNEY_PARAM_NAMES = [
	{
		id: CONSENT_JOURNEY_PARAM,
		scope: CONSENT_JOURNEY_SCOPE_PARAM,
		stored: CONSENT_JOURNEY_STORED_PARAM,
	},
	LEGACY_CONSENT_JOURNEY_PARAMS,
] as const;

const readJourneyNamed = function readJourneyNamed(
	params: URLSearchParams,
	names: (typeof JOURNEY_PARAM_NAMES)[number]
): ConsentJourneyParams | null {
	const id = parseJourneyId(params.get(names.id));
	const scope = parseJourneyScope(params.get(names.scope));
	if (!(id && scope)) {
		return null;
	}
	const stored = params.get(names.stored);
	return stored === '1' || stored === '0'
		? { id, scope, storedChoice: stored === '1' }
		: { id, scope };
};

export const readJourneyParams = function readJourneyParams(
	source: string | URL | URLSearchParams | null | undefined
): ConsentJourneyParams | null {
	const params = source ? toSearchParams(source) : null;
	if (!params) {
		return null;
	}
	for (const names of JOURNEY_PARAM_NAMES) {
		const journey = readJourneyNamed(params, names);
		if (journey) {
			return journey;
		}
	}
	return null;
};

export const appendJourneyParams = function appendJourneyParams(
	url: string,
	journey: ConsentJourneyParams
): string {
	const params = new URLSearchParams({
		[CONSENT_JOURNEY_PARAM]: journey.id,
		[CONSENT_JOURNEY_SCOPE_PARAM]: journey.scope,
	});
	if (journey.storedChoice !== undefined) {
		params.set(CONSENT_JOURNEY_STORED_PARAM, journey.storedChoice ? '1' : '0');
	}
	return appendSearchParams(url, params);
};

export const deriveJourneyPrompt = function deriveJourneyPrompt(
	init: Pick<InitOutput, 'policyResolution'>,
	storedChoice: boolean
): ConsentJourneyPrompt {
	const resolution = init.policyResolution;
	if (
		!resolution ||
		resolution.status === 'failed' ||
		(resolution.status === 'matched' && resolution.policy.prompt === 'none')
	) {
		return 'not-required';
	}
	return storedChoice ? 'stored' : 'due';
};

export interface SessionJourney {
	id: string;
	scope: ConsentJourneyScope;
	storedChoice: boolean;
	domain?: string;
}

export const journeyDomainFrom = function journeyDomainFrom(
	value: string | URL | null | undefined
): string | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const url = value instanceof URL ? value : new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:'
			? url.hostname || undefined
			: undefined;
	} catch {
		return undefined;
	}
};

export const readSessionJourney = function readSessionJourney(
	url: string | URL | null | undefined,
	site?: string | URL | null
): SessionJourney | null {
	const params = readJourneyParams(url);
	if (!params || params.storedChoice === undefined) {
		return null;
	}
	const journey: SessionJourney = {
		id: params.id,
		scope: params.scope,
		storedChoice: params.storedChoice,
	};
	const domain = journeyDomainFrom(site);
	if (domain) {
		journey.domain = domain;
	}
	return journey;
};

export interface SessionReportInputs {
	country?: string | null;
	region?: string | null;
	gpc?: boolean;
}

export interface BuildConsentSessionReportOptions {
	init: InitOutput;
	manifest: Pick<ConsentManifest, 'revision' | 'tenantId'>;
	inputs?: SessionReportInputs;
	source: ConsentSessionSource;
	adapter?: string;
	experiment?: SessionExperiment | null;
	journey?: SessionJourney | null;
}

export const buildConsentSessionReport = function buildConsentSessionReport(
	options: BuildConsentSessionReportOptions
): ConsentSessionReport {
	const resolution = options.init.policyResolution;
	const report: ConsentSessionReport = {
		country: options.inputs?.country ?? null,
		gpc: options.inputs?.gpc === true,
		language: options.init.translations.language,
		policy:
			resolution?.status === 'matched'
				? {
						fingerprint: resolution.fingerprints.policy,
						id: resolution.policyId,
						matchedBy: resolution.matchedBy,
						model: resolution.policy.model,
					}
				: null,
		region: options.inputs?.region ?? null,
		resolution: resolution?.status ?? 'failed',
		revision: options.manifest.revision,
		source: options.source,
	};
	if (options.adapter) {
		report.adapter = options.adapter;
	}
	if (options.experiment) {
		report.experiment = {
			arm: options.experiment.arm,
			id: options.experiment.id,
		};
	}
	if (options.journey) {
		const { domain, id, scope, storedChoice } = options.journey;
		report.journey = {
			id,
			prompt: deriveJourneyPrompt(options.init, storedChoice),
			scope,
			storedChoice,
		};
		if (domain) {
			report.journey.domain = domain;
		}
	}
	if (options.manifest.tenantId !== undefined) {
		report.tenantId = options.manifest.tenantId;
	}
	return report;
};

export const isSpeculativeRequest = function isSpeculativeRequest(
	headers: Headers
): boolean {
	const purpose = (
		headers.get('sec-purpose') ??
		headers.get('purpose') ??
		headers.get('x-purpose') ??
		headers.get('x-moz') ??
		''
	).toLowerCase();
	if (purpose.includes('prefetch') || purpose.includes('prerender')) {
		return true;
	}
	return headers.get('next-router-prefetch') === '1';
};
