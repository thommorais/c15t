import { describe, expect, test } from 'vitest';

const rawSources = import.meta.glob(
	['../**/*.{ts,tsx}', '!../**/__tests__/**', '!../**/*.test.*'],
	{ eager: true, import: 'default', query: '?raw' }
) as Record<string, string>;

describe('branding logo module', () => {
	test('holds only the branding marks', () => {
		const logo = rawSources['../components/shared/ui/logo.tsx'];

		expect(logo).toBeDefined();
		expect(logo).not.toMatch(/FingerprintIcon|SettingsIcon/u);
	});

	test('only the dialog trigger imports the trigger icons', () => {
		const importers = Object.entries(rawSources)
			.filter(([, text]) => /from '[^']*trigger-icons'/u.test(text))
			.map(([file]) => file)
			.sort();

		expect(importers).toEqual([
			'../components/panel-trigger/atoms/icon.tsx',
			'../components/panel-trigger/atoms/toolbar.tsx',
		]);
	});
});
