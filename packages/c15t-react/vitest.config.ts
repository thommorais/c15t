import { resolve } from 'node:path';

import { baseConfig } from '@c15t/vitest-config/base';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

const isVitestWatchMode = function isVitestWatchMode(): boolean {
	const args = process.argv.slice(2);
	if (args.includes('--watch')) {
		return true;
	}
	return !(args.includes('run') || args.includes('--run'));
};

export default mergeConfig(
	baseConfig,
	defineConfig({
		optimizeDeps: {
			exclude: [
				'@rsbuild/plugin-react',
				'@rslib/core',
				'@rsdoctor/rspack-plugin',
				'@rsdoctor/core',
				'@rspack/resolver',
				'@rspack/resolver-binding-wasm32-wasi',
			],
		},
		plugins: [react()],
		resolve: {
			alias: Object.fromEntries([
				['~', resolve(__dirname, './src')],
				['c15t/next', resolve(__dirname, './src/index.ts')],
				['@c15t/react/iab', resolve(__dirname, './src/iab.ts')],
				['@c15t/react/context', resolve(__dirname, './src/context.ts')],
				['@c15t/react', resolve(__dirname, './src/index.ts')],
				[
					'@c15t/core/modules/clear-on-revocation',
					resolve(
						__dirname,
						'../c15t-core/src/modules/clear-on-revocation/index.ts'
					),
				],
				[
					'@c15t/core/modules/script-loader',
					resolve(__dirname, '../c15t-core/src/modules/script-loader/index.ts'),
				],
				[
					'@c15t/core/modules/network-blocker',
					resolve(__dirname, '../c15t-core/src/modules/network-blocker/index.ts'),
				],
				[
					'@c15t/core/modules/network-hold',
					resolve(__dirname, '../c15t-core/src/modules/network-blocker/hold.ts'),
				],
				[
					'@c15t/core/modules/iframe-blocker',
					resolve(__dirname, '../c15t-core/src/modules/iframe-blocker/index.ts'),
				],
				[
					'@c15t/core/modules/persistence',
					resolve(__dirname, '../c15t-core/src/modules/persistence/index.ts'),
				],
				[
					'@c15t/core/modules/window-debug',
					resolve(__dirname, '../c15t-core/src/modules/window-debug/index.ts'),
				],
				['@c15t/core/events', resolve(__dirname, '../c15t-core/src/events.ts')],
				[
					'@c15t/core/runtime/controls',
					resolve(__dirname, '../c15t-core/src/runtime/controls.ts'),
				],
				[
					'@c15t/core/preference-draft',
					resolve(__dirname, '../c15t-core/src/preference-draft/index.ts'),
				],
				[
					'@c15t/core/runtime/provider',
					resolve(__dirname, '../c15t-core/src/runtime/provider.ts'),
				],
				[
					'@c15t/core/runtime',
					resolve(__dirname, '../c15t-core/src/runtime/index.ts'),
				],
				[
					'@c15t/core/server',
					resolve(__dirname, '../c15t-core/src/server/index.ts'),
				],
				[
					'@c15t/core/surface-actions',
					resolve(__dirname, '../c15t-core/src/surface-actions/index.ts'),
				],
				[
					'@c15t/core/generated',
					resolve(__dirname, '../c15t-core/src/generated.ts'),
				],
				[
					'@c15t/core/transports/manifest-browser',
					resolve(__dirname, '../c15t-core/src/transports/manifest-browser.ts'),
				],
				['@c15t/core', resolve(__dirname, '../c15t-core/src/index.ts')],
				['@c15t/schema/types', resolve(__dirname, '../c15t-schema/src/types.ts')],
				[
					'@c15t/schema/config',
					resolve(__dirname, '../c15t-schema/src/config/index.ts'),
				],
				['@c15t/schema', resolve(__dirname, '../c15t-schema/src/index.ts')],
				[
					'@c15t/translations/all',
					resolve(__dirname, '../c15t-translations/src/all.ts'),
				],
				[
					'@c15t/translations/en',
					resolve(__dirname, '../c15t-translations/src/translations/en.ts'),
				],
				[
					'@c15t/translations',
					resolve(__dirname, '../c15t-translations/src/index.ts'),
				],
				[
					'@c15t/ui/primitives/collapsible',
					resolve(__dirname, '../c15t-ui/src/primitives/collapsible/index.ts'),
				],
				[
					'@c15t/ui/primitives/preference-item',
					resolve(__dirname, '../c15t-ui/src/primitives/preference-item/index.ts'),
				],
				[
					'@c15t/ui/primitives/tabs',
					resolve(__dirname, '../c15t-ui/src/primitives/tabs/index.ts'),
				],
				[
					'@c15t/ui/styles/primitives/collapsible',
					resolve(__dirname, '../c15t-ui/src/styles/primitives/collapsible.ts'),
				],
				[
					'@c15t/ui/styles/primitives/preference-item',
					resolve(__dirname, '../c15t-ui/src/styles/primitives/preference-item.ts'),
				],
				[
					'@c15t/ui/styles/primitives/tabs',
					resolve(__dirname, '../c15t-ui/src/styles/primitives/tabs.ts'),
				],
				[
					'@iabtechlabtcf/core',
					resolve(__dirname, '../c15t-iab/node_modules/@iabtechlabtcf/core'),
				],
				['@c15t/iab/headless', resolve(__dirname, '../c15t-iab/src/headless.ts')],
				['@c15t/iab/gpp', resolve(__dirname, '../c15t-iab/src/gpp.ts')],
				['@c15t/iab', resolve(__dirname, '../c15t-iab/src/index.ts')],
				['react', resolve(__dirname, './node_modules/react')],
				['react-dom', resolve(__dirname, './node_modules/react-dom')],
			]),
		},
		server: {
			watch: isVitestWatchMode() ? undefined : null,
		},
		test: {
			browser: {
				enabled: true,
				headless: true,
				instances: [{ browser: 'chromium' }],
				provider: playwright({
					launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
				}),
			},
			coverage: {
				thresholds: {
					branches: 50,
					functions: 60,
					lines: 65,
					statements: 60,
				},
			},
			include: [
				'src/**/*.test.tsx',
				'src/**/*.test.ts',
				'src/**/*.spec.tsx',
				'src/**/*.spec.ts',
				'src/**/*.e2e.test.tsx',
			],
			retry: 2,
			setupFiles: ['./src/test-setup.browser.ts'],
		},
	})
);
