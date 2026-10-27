import { writeFileSync } from 'node:fs';

import {
	createPolicyRuleFingerprints,
	inspectPolicyRules,
	normalizePolicyRule,
	policyRulePresets,
} from '@c15t/schema/types';

const base = {
	id: 'custom',
	match: { countries: ['DE'] },
	model: 'opt-in',
	prompt: 'choice',
};

const custom = [
	base,
	{ ...base, id: '  padded  ', copyRevision: '  r1  ' },
	{ ...base, copyRevision: '   ' },
	{ ...base, categories: ['measurement', 'marketing', 'measurement'], scopeMode: 'strict' },
	{ ...base, categories: ['*'] },
	{ ...base, categories: ['necessary'] },
	{ ...base, categories: [] },
	{ ...base, categories: [' measurement '], scopeMode: 'permissive', preselectedCategories: [' measurement '] },
	{ ...base, actions: ['accept', 'reject'] },
	{ ...base, actions: ['customize', 'reject', 'accept', 'accept'] },
	{ ...base, rights: ['opt-out'] },
	{ ...base, validity: { choiceDays: 30, noticeDays: 0.5 } },
	{ ...base, validity: { choiceDays: 180 } },
	{ ...base, privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } } },
	{ ...base, i18n: { language: 'de' } },
	{ ...base, i18n: { messageProfile: 'gdpr', language: '' } },
	{ ...base, i18n: { language: '', messageProfile: '' } },
	{ ...base, proof: { storeIp: true, storeLanguage: false } },
	{ ...base, model: 'opt-out', prompt: 'notice' },
	{ ...base, model: 'opt-out', prompt: 'none' },
	{ ...base, model: 'opt-out', prompt: 'choice', actions: ['accept', 'reject'] },
	{ ...base, model: 'none', prompt: 'none' },
	{ ...base, model: 'iab', prompt: 'choice' },
	{ ...base, match: { isDefault: true } },
	{ ...base, match: { fallback: true } },
	{ ...base, match: { regions: [{ country: 'US', region: 'CA' }] } },
	{ ...base, match: { regionFallbacks: ['US'] } },
	{
		...base,
		review: { status: 'reviewed', reviewedOn: '2026-01-01', reviewBy: 'x', sources: ['s'], assumptions: [] },
	},
];

const legacyInput = { model: 'opt-in', consent: { categories: [], expiryDays: 30 }, ui: { mode: 'banner', banner: { layout: ['accept', ['reject', 'customize']] } } };
const current = createPolicyRuleFingerprints(normalizePolicyRule(base as never)).policy;
custom.push(
	{ ...base, legacyMaterial: { input: legacyInput, policyFingerprint: current } },
	{ ...base, legacyMaterial: { input: { model: 'opt-in' }, policyFingerprint: 'stale' } }
);

const invalid = [
	{ ...base, id: '  ' },
	{ ...base, match: {} },
	{ ...base, match: { countries: ['DE', ' '] } },
	{ ...base, match: { regionFallbacks: [''] } },
	{ ...base, match: { regions: [{ country: 'US', region: ' ' }] } },
	{ ...base, model: 'opt-in', prompt: 'notice' },
	{ ...base, model: 'none', prompt: 'choice' },
	{ ...base, model: 'iab', prompt: 'none' },
	{ ...base, model: 'maybe' },
	{ ...base, prompt: 'shout' },
	{ ...base, categories: ['measurement'] },
	{ ...base, categories: ['measurement', 'snacks'], scopeMode: 'strict' },
	{ ...base, scopeMode: 'loose' },
	{ ...base, model: 'iab', preselectedCategories: [] },
	{ ...base, model: 'none', prompt: 'none', preselectedCategories: ['measurement'] },
	{ ...base, preselectedCategories: ['snacks'] },
	{ ...base, categories: ['measurement'], scopeMode: 'strict', preselectedCategories: ['marketing'] },
	{ ...base, model: 'opt-out', prompt: 'notice', actions: ['accept', 'reject'] },
	{ ...base, actions: ['accept'] },
	{ ...base, actions: ['accept', 'reject', 'dismiss'] },
	{ ...base, actions: [] },
	{ ...base, rights: ['vote'] },
	{ ...base, validity: { choiceDays: 0 } },
	{ ...base, validity: { noticeDays: -1 } },
	{ ...base, validity: { choiceDays: 1e300 } },
	{ ...base, privacySignals: { gpc: { denyCategories: ['necessary'] } } },
	{ ...base, privacySignals: { gpc: { denyCategories: ['snacks'] } } },
	{ ...base, privacySignals: { gpc: { denyCategories: ['marketing', 'marketing'] } } },
	{ ...base, categories: ['measurement'], scopeMode: 'strict', privacySignals: { gpc: { denyCategories: ['marketing'] } } },
	{ ...base, privacySignals: { gpc: {} } },
	{ ...base, review: { status: 'maybe' } },
	{ ...base, legacyMaterial: { input: { model: 'opt-in' }, policyFingerprint: '' } },
	{ ...base, legacyMaterial: { input: { model: 'later' }, policyFingerprint: 'f' } },
];

const packs = [
	{ rules: [] },
	{ rules: [base] },
	{ rules: [{ ...base, match: { isDefault: true } }, { ...base, id: 'b', match: { isDefault: true } }] },
	{ rules: [{ ...base, match: { fallback: true } }, { ...base, id: 'b', match: { fallback: true } }] },
	{ rules: [base, { ...base }] },
	{ rules: [{ ...base, id: ' a ' }, { ...base, id: 'a' }] },
	{ rules: [{ ...base, model: 'iab' }], options: { iabEnabled: false } },
	{ rules: [{ ...base, model: 'iab' }], options: {} },
	{ rules: [{ ...base, model: 'iab' }], options: { iabEnabled: true } },
	{ rules: [{ ...base, model: 'iab' }] },
	{ rules: [{ ...base, match: { isDefault: true, countries: ['FR'] } }] },
	{
		rules: [
			{ ...base, id: 'a', match: { countries: ['de'], regions: [{ country: 'us', region: 'ca' }] } },
			{ ...base, id: 'b', match: { countries: [' DE '], regions: [{ country: 'US', region: 'CA' }] } },
			{ ...base, id: 'c', match: { countries: ['DE'], fallback: true } },
			{ ...base, id: 'd', match: { isDefault: true } },
		],
	},
	{ rules: [{ ...base, id: '', match: { countries: ['DE'] } }, { ...base, id: ' ', match: { countries: ['DE'] } }] },
	{ rules: Object.values(policyRulePresets).map((preset) => preset()) },
];

const presets = Object.entries(policyRulePresets).map(([name, preset]) => ({ name, rule: preset() }));

const normalized = [...presets.map(({ name, rule }) => ({ name, rule })), ...custom.map((rule, i) => ({ name: `custom ${i}`, rule }))].map(
	({ name, rule }) => {
		const resolved = normalizePolicyRule(rule as never);
		return {
			name,
			rule,
			resolved,
			fingerprints: createPolicyRuleFingerprints(resolved, (rule as { legacyMaterial?: never }).legacyMaterial),
		};
	}
);

const inspected = invalid.map((rule) => ({ rule, ...inspectPolicyRules([rule]) }));

const packResults = packs.map(({ rules, options }) => ({
	rules,
	...(options && { options }),
	...inspectPolicyRules(rules, options),
}));

const out = process.argv[2] ?? 'testdata/rules.json';
writeFileSync(out, `${JSON.stringify({ normalized, inspected, packs: packResults }, null, '\t')}\n`);
