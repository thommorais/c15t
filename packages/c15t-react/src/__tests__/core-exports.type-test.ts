import type {
	AllConsentNames,
	ClearOnRevocationConfig,
	ConsentProviderOptions,
	PolicyRule,
} from '../index';
import { offline, policyRulePresets } from '../index';

const consentCategories: AllConsentNames[] = ['measurement', 'marketing'];
const clearOnRevocation: ClearOnRevocationConfig = {
	measurement: { cookies: ['_ga'] },
};
const policyRules: PolicyRule[] = [
	policyRulePresets.europeOptIn(),
	policyRulePresets.worldNone(),
];

({
	clearOnRevocation,
	consentCategories,
	mode: offline({ policyRules }),
}) satisfies ConsentProviderOptions;

// @ts-expect-error Only c15t's categories are category names.
const unknownCategory: AllConsentNames = 'advertising';
void unknownCategory;
