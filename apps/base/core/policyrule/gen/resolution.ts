import { writeFileSync } from 'node:fs';

import {
	parsePolicyContractHeader,
	policyRulePresets,
	recommendedPolicyRules,
	resolvePolicyRules,
	SAFE_FALLBACK_POLICY_FINGERPRINTS,
	safeFallbackPolicyRule,
	writePolicyResolutionWire,
} from '@c15t/schema/types';

const rule = (id: string, match: object) => ({ id, match, model: 'opt-in', prompt: 'choice' });

const packs: Record<string, { rules?: unknown[]; iabEnabled?: boolean }> = {
	unconfigured: {},
	empty: { rules: [] },
	invalid: { rules: [rule('broken', {})] },
	recommended: { rules: recommendedPolicyRules() },
	recommendedIab: { rules: recommendedPolicyRules({ iab: true }), iabEnabled: true },
	iabWithoutSupport: { rules: recommendedPolicyRules({ iab: true }), iabEnabled: false },
	presets: { rules: Object.values(policyRulePresets).map((preset) => preset()) },
	regions: {
		rules: [
			rule('ca', { regions: [{ country: 'us', region: 'ca' }] }),
			rule('us', { countries: [' us '] }),
			rule('de_regions', { regions: [{ country: 'DE', region: 'BY' }] }),
			rule('fr_missing', { regionFallbacks: ['FR'] }),
			rule('fr_regions', { regions: [{ country: 'FR', region: 'IDF' }] }),
		],
	},
	regionsWithFallback: {
		rules: [
			rule('de_regions', { regions: [{ country: 'DE', region: 'BY' }] }),
			rule('strict', { fallback: true }),
		],
	},
	defaultOnly: { rules: [rule('everywhere', { isDefault: true })] },
	fallbackAndDefault: {
		rules: [rule('strict', { fallback: true }), rule('everywhere', { isDefault: true }), rule('de', { countries: ['DE'] })],
	},
};

const locations: [string | null, string | null][] = [
	[null, null],
	['', ''],
	['  ', null],
	['DE', null],
	['de', null],
	['DE', 'BY'],
	['DE', 'DE-BY'],
	['DE', 'HH'],
	['US', null],
	['US', 'CA'],
	['us', 'us-ca'],
	['US', 'NY'],
	['FR', null],
	['FR', 'IDF'],
	['FR', 'XX'],
	['CA', 'QC'],
	['GB', null],
	['BR', null],
	['JP', 'XX'],
	[null, 'CA'],
];

const resolutions = Object.entries(packs).flatMap(([pack, { rules, iabEnabled }]) =>
	locations.map(([country, region]) => ({
		pack,
		country,
		region,
		wire: writePolicyResolutionWire(
			resolvePolicyRules({ countryCode: country, regionCode: region, rules, iabEnabled })
		),
	}))
);

const headers = [null, '', '1', ' 1 ', '01', '2', '1.0', '-1', 'abc', '999999'].map((value) => ({
	value,
	parsed: parsePolicyContractHeader(value) ?? null,
}));

const out = process.argv[2] ?? 'testdata/resolution.json';
writeFileSync(
	out,
	`${JSON.stringify(
		{
			packs,
			resolutions,
			fallback: { rule: safeFallbackPolicyRule(), fingerprints: SAFE_FALLBACK_POLICY_FINGERPRINTS },
			headers,
		},
		null,
		'\t'
	)}\n`
);
