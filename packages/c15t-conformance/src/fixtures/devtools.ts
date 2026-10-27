import { custom } from '@c15t/core';
import type {
	ConsentPresentation,
	KernelConfig,
	KernelTransport,
} from '@c15t/core';
import type { Script } from '@c15t/core/modules/script-loader';
import {
	readPolicyResolutionWire,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@c15t/schema/types';

export const devToolsCategories = [
	'necessary',
	'measurement',
	'marketing',
] as const;
export const getDevToolsCategories = () => devToolsCategories;

export const devToolsPrefetch = {
	initialLocation: { countryCode: 'CA', regionCode: 'QC' },
	initialOverrides: { country: 'CA', language: 'en', region: 'QC' },
	initialPolicyResolution: readPolicyResolutionWire(
		writePolicyResolutionWire(
			resolvePolicyRules({
				rules: [
					{
						categories: ['measurement', 'marketing'],
						id: 'devtools-conformance',
						match: { isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
						scopeMode: 'permissive',
					},
				],
			})
		)
	),
	initialRecords: { subject: { subjectId: 'sub_2VZxR7YmNpKq3WfLs8TgHd' } },
	now: Date.UTC(2026, 0, 1, 12),
} satisfies KernelConfig;

const transport: KernelTransport = {
	init: () =>
		Promise.resolve({
			location: devToolsPrefetch.initialLocation,
			policyResolution: writePolicyResolutionWire(
				devToolsPrefetch.initialPolicyResolution
			),
		}),
	save: () => Promise.resolve({ ok: true }),
};

export const devToolsScripts: Script[] = [
	{ callbackOnly: true, category: 'necessary', id: 'essential-callback' },
	{
		anonymizeId: false,
		category: 'measurement',
		id: 'analytics-fixture',
		src: 'data:text/javascript,void%200',
	},
	{
		anonymizeId: false,
		category: 'marketing',
		id: 'retained-pixel',
		persistAfterConsentRevoked: true,
		textContent: 'void 0;',
	},
];

export const devToolsPresentation = {
	preferences: { uiProfile: 'balanced' },
	prompt: { uiProfile: 'balanced' },
} satisfies ConsentPresentation;

export const devToolsProviderOptions = {
	consentCategories: [...devToolsCategories],
	mode: custom(transport),
	persistence: false,
	prefetch: devToolsPrefetch,
	presentation: devToolsPresentation,
	reloadOnConsentRevoked: false,
	scripts: devToolsScripts,
};
