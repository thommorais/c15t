import { POLICY_CONTRACT_HEADER } from './policy-resolution-wire';
import { appendSearchParams } from './search-params';
import {
	CONSENT_EXPERIMENT_HEADER,
	formatExperimentHeader,
} from './session-report';
import type { SessionExperiment } from './session-report';

export const INIT_VERSION_PARAM = 'v';

export const INIT_POLICY_CONTRACT_PARAM = 'contract';

export const INIT_COUNTRY_PARAM = 'country';

export const INIT_REGION_PARAM = 'region';

export const INIT_GPC_PARAM = 'gpc';

export const INIT_EXPERIMENT_PARAM = 'experiment';

export const INIT_PARAM_HEADERS: readonly (readonly [string, string])[] = [
	[INIT_VERSION_PARAM, 'x-c15t-version'],
	[INIT_POLICY_CONTRACT_PARAM, POLICY_CONTRACT_HEADER],
	[INIT_COUNTRY_PARAM, 'x-c15t-country'],
	[INIT_REGION_PARAM, 'x-c15t-region'],
	[INIT_GPC_PARAM, 'x-c15t-gpc'],
	[INIT_EXPERIMENT_PARAM, CONSENT_EXPERIMENT_HEADER],
];

export interface InitRequestParams {
	version?: string;
	policyContract?: number;
	country?: string;
	region?: string;
	gpc?: boolean;
	experiment?: SessionExperiment;
}

export const appendInitParams = function appendInitParams(
	url: string,
	params: InitRequestParams
): string {
	const search = new URLSearchParams();
	if (params.version) {
		search.set(INIT_VERSION_PARAM, params.version);
	}
	if (params.policyContract !== undefined) {
		search.set(INIT_POLICY_CONTRACT_PARAM, String(params.policyContract));
	}
	if (params.country) {
		search.set(INIT_COUNTRY_PARAM, params.country);
	}
	if (params.region) {
		search.set(INIT_REGION_PARAM, params.region);
	}
	if (params.gpc !== undefined) {
		search.set(INIT_GPC_PARAM, params.gpc ? '1' : '0');
	}
	if (params.experiment) {
		search.set(
			INIT_EXPERIMENT_PARAM,
			formatExperimentHeader(params.experiment)
		);
	}
	return appendSearchParams(url, search);
};

const toSearchParams = function toSearchParams(
	source: string | URL
): URLSearchParams {
	if (source instanceof URL) {
		return source.searchParams;
	}
	const fragment = source.indexOf('#');
	const base = fragment === -1 ? source : source.slice(0, fragment);
	const query = base.indexOf('?');
	if (query === -1) {
		return new URLSearchParams();
	}
	return new URLSearchParams(base.slice(query + 1));
};

export const applyInitParamsToHeaders = function applyInitParamsToHeaders(
	url: string | URL,
	headers: Headers
): Headers {
	const params = toSearchParams(url);
	const merged = new Headers(headers);
	for (const [param, header] of INIT_PARAM_HEADERS) {
		const value = params.get(param);
		if (!value) {
			continue;
		}
		if (param === INIT_GPC_PARAM && value !== '1' && value !== '0') {
			continue;
		}
		merged.set(header, value);
	}
	return merged;
};
