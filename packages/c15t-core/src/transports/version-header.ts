import {
	POLICY_CONTRACT_HEADER,
	POLICY_CONTRACT_VERSION,
} from '@c15t/schema/types';
import type { InitRequestParams } from '@c15t/schema/types';

import { version } from '../version';

export const C15T_VERSION_HEADER = 'x-c15t-version';

export const C15T_POLICY_CONTRACT_HEADER = POLICY_CONTRACT_HEADER;

export const c15tVersionHeaders: Readonly<Record<string, string>> = {
	[C15T_VERSION_HEADER]: version,
};

export const c15tProtocolHeaders: Readonly<Record<string, string>> = {
	...c15tVersionHeaders,
	[C15T_POLICY_CONTRACT_HEADER]: String(POLICY_CONTRACT_VERSION),
};

export const c15tProtocolParams: Readonly<
	Pick<InitRequestParams, 'version' | 'policyContract'>
> = {
	policyContract: POLICY_CONTRACT_VERSION,
	version,
};

export const readProducerPolicyContract = function readProducerPolicyContract(
	headers: Pick<Headers, 'get'> | undefined
): number | null | undefined {
	const value = headers?.get(C15T_POLICY_CONTRACT_HEADER);
	if (value === null || value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return /^\d+$/u.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
};
