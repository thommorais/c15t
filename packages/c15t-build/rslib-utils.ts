import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';

export const standardExcludePatterns = [
	'**/.DS_Store',
	'**/__tests__/**',
	'**/__snapshots__/**',
	'**/__screenshots__/**',
	'**/*.test.ts',
	'**/*.test.tsx',
	'**/*.spec.ts',
	'**/*.spec.tsx',
	'**/*.browser.test.ts',
	'**/*.e2e.test.ts',
	'**/*.e2e.test.tsx',
	'**/*.e2e.ts',
	'**/mockServiceWorker.js',
	'**/test-setup.*',
];

export const standardSourceEntries = [
	'./src/**',
	'!./src/**/__tests__/**',
	'!./src/**/__snapshots__/**',
	'!./src/**/__screenshots__/**',
	'!./src/**/*.test.ts',
	'!./src/**/*.test.tsx',
	'!./src/**/*.spec.ts',
	'!./src/**/*.spec.tsx',
	'!./src/**/*.browser.test.ts',
	'!./src/**/*.e2e.test.ts',
	'!./src/**/*.e2e.test.tsx',
	'!./src/**/*.e2e.ts',
	'!./src/**/mockServiceWorker.js',
	'!./src/**/test-setup.*',
];

export const getRsdoctorPlugins = function getRsdoctorPlugins() {
	if (process.env.WITH_RSDOCTOR) {
		return [
			new RsdoctorRspackPlugin({
				disableClientServer: true,
				output: {
					mode: 'brief',
					options: {
						type: ['json'],
					},
				},
			}),
		];
	}
	return [];
};
