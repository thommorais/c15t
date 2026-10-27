import { writeFileSync } from 'node:fs';

import { policyRulePresets, recommendedPolicyRules } from '@c15t/schema/types';

const presets = Object.fromEntries(
	Object.entries(policyRulePresets).map(([name, preset]) => [name, preset()])
);

const out = process.argv[2] ?? 'presets.json';
writeFileSync(
	out,
	`${JSON.stringify(
		{
			presets,
			recommended: {
				default: recommendedPolicyRules(),
				iab: recommendedPolicyRules({ iab: true }),
			},
		},
		null,
		'\t'
	)}\n`
);
