import type { PolicyResolution } from '@c15t/schema/types';

import type { PromptRequirement } from './consent-record/types';
import type { KernelActiveUI } from './types';

export const deriveActiveUI = function deriveActiveUI(input: {
	promptRequirement: PromptRequirement;
	policyPending: boolean;
	resolution: PolicyResolution;
	experimentPending?: boolean;
}): KernelActiveUI {
	return input.policyPending ||
		input.experimentPending ||
		input.resolution.status === 'failed' ||
		input.promptRequirement.kind === 'none'
		? 'none'
		: 'banner';
};
