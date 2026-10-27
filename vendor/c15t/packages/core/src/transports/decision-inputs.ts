import type { InitOutput } from '@c15t/schema/types';

import type { KernelOverrides, SavePayload } from '../types';

export interface RememberedDecisionInputs {
	policyId?: string | null;
	fingerprint?: string;
	country: string | null;
	region: string | null;
	language: string;
	gpc?: boolean;
}

const primaryLanguage = function primaryLanguage(value: string): string {
	return value.toLowerCase().split('-')[0] ?? value.toLowerCase();
};

export const decisionInputsMatchOverrides =
	function decisionInputsMatchOverrides(
		inputs: RememberedDecisionInputs,
		overrides: KernelOverrides | undefined
	): boolean {
		if (!overrides) {
			return true;
		}
		if (
			overrides.country !== undefined &&
			overrides.country !== inputs.country
		) {
			return false;
		}
		if (overrides.region !== undefined && overrides.region !== inputs.region) {
			return false;
		}
		if (overrides.gpc !== undefined && overrides.gpc !== inputs.gpc) {
			return false;
		}
		return (
			overrides.language === undefined ||
			primaryLanguage(overrides.language) === primaryLanguage(inputs.language)
		);
	};

export type DecisionAssertion = Pick<
	RememberedDecisionInputs,
	'country' | 'fingerprint' | 'gpc' | 'language' | 'policyId' | 'region'
>;

export const rememberDecisionInputs = function rememberDecisionInputs(
	payload: InitOutput,
	gpc: boolean | undefined
): RememberedDecisionInputs {
	let policyId: string | null | undefined;
	if (payload.policyResolution?.status === 'matched') {
		({ policyId } = payload.policyResolution);
	} else if (payload.policyResolution?.status === 'no-match') {
		policyId = null;
	}
	return {
		country: payload.location.countryCode,
		fingerprint:
			payload.policyResolution?.status === 'matched'
				? payload.policyResolution.fingerprints.policy
				: undefined,
		gpc,
		language: payload.translations.language,
		policyId,
		region: payload.location.regionCode,
	};
};

export const buildDecisionAssertion = function buildDecisionAssertion(
	payload: SavePayload,
	inputs: RememberedDecisionInputs | undefined
): DecisionAssertion | undefined {
	const decision: RememberedDecisionInputs | undefined =
		payload.decisionInputs ?? inputs;
	if (
		payload.policySnapshotToken ||
		!decision ||
		decision.policyId === undefined ||
		(decision.policyId !== null &&
			(!decision.policyId || !decision.fingerprint))
	) {
		return undefined;
	}
	return {
		country: decision.country,
		fingerprint: decision.fingerprint,
		gpc: decision.gpc,
		language: decision.language,
		policyId: decision.policyId,
		region: decision.region,
	};
};

export const gpcFromHeaders = function gpcFromHeaders(
	headers: Record<string, string> | undefined
): boolean | undefined {
	const value = headers?.['x-c15t-gpc'] ?? headers?.['sec-gpc'];
	if (value === '1') {
		return true;
	}
	if (value === '0') {
		return false;
	}
	return undefined;
};
