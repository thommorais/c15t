import { createRequire } from 'node:module';

import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';

import {
	compactModuleMinify,
	publicEntryAliases,
} from '@c15t/build/rslib-modules';
import { getRsdoctorPlugins } from '@c15t/build/rslib-utils';

const selfContainedEntries = {
	'runtime/lazy-hosted': './src/runtime/lazy-hosted.ts',
	'runtime/lazy-manifest-browser': './src/runtime/lazy-manifest-browser.ts',
	'runtime/lazy-offline': './src/runtime/lazy-offline.ts',
	'runtime/script-server-start': './src/runtime/script-server-start.ts',
};

const require = createRequire(import.meta.url);
const bundledPackages = function bundledPackages(
	alias: Record<string, string | false | (string | false)[]>
) {
	return {
		...alias,
		'@c15t/schema/types$': require.resolve('@c15t/schema/types'),
		'@c15t/translations$': require.resolve('@c15t/translations'),
		'@c15t/translations/all$': require.resolve('@c15t/translations/all'),
		'@c15t/translations/en$': require.resolve('@c15t/translations/en'),
	};
};

const selfContainedLib = function selfContainedLib(
	name: string,
	entry: string
) {
	return {
		autoExternal: false,
		bundle: true,
		dts: false,
		format: 'esm' as const,
		output: {
			cleanDistPath: false,
			distPath: { root: './dist' },
			externals: [/^@c15t\/translations\/(?!en$)[a-z]{2}$/u],
			filename: { js: '[name].js' },
		},
		resolve: {
			alias: bundledPackages,
			aliasStrategy: 'prefer-alias' as const,
		},
		source: { entry: { [name]: entry } },
		tools: { rspack: { output: { asyncChunks: false } } },
	};
};

export default defineConfig({
	lib: [
		{
			bundle: false,
			dts: {
				distPath: './dist-types',
			},
			format: 'esm',
			outBase: './src',
			plugins: [
				publicEntryAliases({
					'clear-on-revocation.js': './modules/clear-on-revocation/index.js',
					'consent-categories.js': './consent-record/types.js',
					'consent-record.js': './consent-record/index.js',
					'generate-subject-id.js': './libs/generate-subject-id.js',
					'iframe-blocker.js': './modules/iframe-blocker/index.js',
					'network-blocker.js': './modules/network-blocker/index.js',
					'network-hold.js': './modules/network-blocker/hold.js',
					'persistence.js': './modules/persistence/index.js',
					'preference-draft.js': './preference-draft/index.js',
					'runtime.js': './runtime/index.js',
					'script-loader.js': './modules/script-loader/index.js',
					'server.js': './server/index.js',
					'transport-manifest-cache.js': './transports/manifest-cache.js',
					'transport-manifest.js': './transports/manifest.js',
					'transports.js': './transports/index.js',
					'window-debug.js': './modules/window-debug/index.js',
				}),
			],
			source: {
				entry: {
					index: [
						'./src/**/*.ts',
						'!./src/**/__tests__/**',
						'!./src/**/*.test.ts',
						'!./src/**/*.spec.ts',
						...Object.values(selfContainedEntries).map((entry) => `!${entry}`),
					],
				},
			},
		},
		...Object.entries(selfContainedEntries).map(([name, entry]) =>
			selfContainedLib(name, entry)
		),
	],
	output: {
		cleanDistPath: true,
		minify: compactModuleMinify,
		target: 'web',
	},
	performance: {
		buildCache: false,
	},
	plugins: [pluginReact()],
	source: {
		exclude: [
			'**/__tests__/**',
			'**/*.test.ts',
			'**/*.test.tsx',
			'**/*.spec.ts',
			'**/*.spec.tsx',
			'**/*.browser.test.ts',
		],
	},
	tools: {
		rspack: {
			plugins: [...getRsdoctorPlugins()],
		},
	},
});
