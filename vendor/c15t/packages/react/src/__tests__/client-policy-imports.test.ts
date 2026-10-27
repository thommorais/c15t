import { describe, expect, test } from 'vitest';

const rawSources = import.meta.glob(
	[
		'../**/*.{ts,tsx}',
		'!../**/__tests__/**',
		'!../**/*.test.*',
		'!../**/*.spec.*',
		'!../server/**',
		'!../transports/offline.ts',
	],
	{ eager: true, import: 'default', query: '?raw' }
) as Record<string, string>;

const RESOLVER_EXPORTS = [
	'createPolicyRuleFingerprints',
	'hashSha256Hex',
	'inspectPolicyRules',
	'matchPolicyRules',
	'normalizePolicyRule',
	'resolvePolicyRules',
	'validatePolicyRules',
];

const SCHEMA_VALUE_IMPORT =
	/^import\s+(?!type\b)\{(?<names>[^}]*)\}\s*from\s+'@c15t\/schema\/types';/gmu;

describe('client policy imports', () => {
	test('scans the provider', () => {
		expect(Object.keys(rawSources)).toContain('../provider.tsx');
	});

	test('no client module imports a pack resolver', () => {
		const offending = Object.entries(rawSources).flatMap(([file, text]) =>
			[...text.matchAll(SCHEMA_VALUE_IMPORT)].flatMap((match) =>
				(match.groups?.names ?? '')
					.split(',')
					.map((name) => name.trim().split(/\s+as\s+/u)[0] as string)
					.filter((name) => RESOLVER_EXPORTS.includes(name))
					.map((name) => `${file}: ${name}`)
			)
		);

		expect(offending).toEqual([]);
	});
});
