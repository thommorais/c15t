import { availableParallelism } from 'node:os';

import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.TURBO_HASH
	? Math.max(2, Math.floor(availableParallelism() / 4))
	: undefined;

export const baseConfig = defineConfig({
	test: {
		// oxlint-disable-next-line sort-keys -- Preserve declaration order, interface shape, and public compatibility.
		coverage: {
			enabled: true,
			include: [
				'**/*.{ts,tsx,js,jsx}',
				'!**/*.d.ts',
				'!**/node_modules/**',
				'!**/dist/**',
				'!**/dist-types/**',
				'!**/storybook-static/**',
				'!**/coverage/**',
				'!**/*.config.{ts,js,mjs,cjs}',
				'!**/scripts/**',
			],

			provider: 'istanbul',
			reporter: [
				'text',
				[
					'json-summary',
					{
						file: 'coverage-summary.json',
					},
				],
				[
					'json',
					{
						file: 'coverage-final.json',
					},
				],
				[
					'html',
					{
						subdir: 'html',
					},
				],
			],
			reportOnFailure: true,
			reportsDirectory: './coverage',
		},
		maxWorkers,
	},
});
