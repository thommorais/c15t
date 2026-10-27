import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AcceptedPlugin } from 'postcss';
import postcss, { parse } from 'postcss';
import { describe, expect, test } from 'vitest';

import tailwind3Plugin, { isC15tUiStylesheetPath } from '../postcss-tailwind3';
import * as pluginModule from '../postcss-tailwind3';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = join(TEST_DIR, '..', '..', '..');

const layeredCss = `
@layer theme, base, components, utilities;

:root {
	--c15t-color-primary: #0f172a;
}

@layer components {
	.c15t-ui-button-a1b2c {
		background: var(--c15t-color-primary);
	}
}

@layer utilities {
	.c15t-ui-force {
		color: red;
	}
}
`;

const processCss = async function processCss(from: string) {
	const result = await postcss([tailwind3Plugin]).process(layeredCss, { from });
	return result.css;
};

describe('@c15t/ui/postcss-tailwind3', () => {
	test('unwraps @layer blocks for built @c15t/ui stylesheets in node_modules', async () => {
		const css = await processCss(
			'/app/node_modules/@c15t/ui/dist/styles/components/button.css'
		);

		expect(css).toContain('.c15t-ui-button-a1b2c');
		expect(css).toContain('.c15t-ui-force');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('unwraps @layer blocks for built @c15t/ui stylesheets in the monorepo', async () => {
		const css = await processCss(
			join(PACKAGES_DIR, 'c15t-ui', 'dist', 'styles', 'components', 'button.css')
		);

		expect(css).toContain('.c15t-ui-button-a1b2c');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('leaves app stylesheets untouched', async () => {
		const css = await processCss('/app/src/app/globals.css');

		expect(css).toContain('@layer theme, base, components, utilities');
		expect(css).toContain('@layer components');
		expect(css).toContain('@layer utilities');
	});

	test('leaves a consumer workspace package named like a c15t one alone', async () => {
		const root = mkdtempSync(join(tmpdir(), 'c15t-tw3-'));
		const packageDir = join(root, 'packages', 'react');
		mkdirSync(join(packageDir, 'dist'), { recursive: true });
		writeFileSync(
			join(packageDir, 'package.json'),
			JSON.stringify({ name: '@acme/react' })
		);

		const css = await processCss(join(packageDir, 'dist', 'x.css'));

		expect(css).toContain('@layer components');
		expect(css).toContain('@layer utilities');
	});

	test('removes bare @layer order statements for scoped c15t files', async () => {
		const css = await postcss([tailwind3Plugin]).process(
			'@layer properties, theme, base, components, utilities;',
			{ from: '/app/node_modules/@c15t/ui/dist/styles/components/button.css' }
		);

		expect(css.css.trim()).toBe('');
	});

	test('leaves no @layer in any built layered sheet', async () => {
		for (const file of [
			'styles.css',
			'iab/styles.css',
			'styles/primitives.css',
		]) {
			const from = join(TEST_DIR, '..', '..', 'dist', file);
			// oxlint-disable-next-line no-await-in-loop -- Three small files.
			const result = await postcss([tailwind3Plugin]).process(
				readFileSync(from, 'utf8'),
				{ from }
			);

			expect(result.css, file).toContain('.c15t-ui-');
			expect(result.css, file).not.toMatch(/@layer\b/u);
		}
	});

	test('unwraps c15t rules inlined into an app stylesheet', async () => {
		const app = parse(
			'@tailwind components;\n@layer components { .app-card { color: red; } }',
			{ from: '/app/src/index.css' }
		);
		const inlined = parse(layeredCss, {
			from: '/app/node_modules/@c15t/ui/dist/styles.css',
		});
		app.append(inlined.nodes);

		const result = await postcss([tailwind3Plugin]).process(app, {
			from: '/app/src/index.css',
		});
		const layers = [...result.css.matchAll(/@layer [^{;]+/gu)].map((match) =>
			match[0].trim()
		);

		expect(layers).toEqual(['@layer components']);
		expect(result.css).toContain('.app-card');
		expect(result.css).toContain('.c15t-ui-button-a1b2c');
	});

	test('normalizes the in-process module namespace into a working plugin', async () => {
		const result = await postcss([
			pluginModule as unknown as AcceptedPlugin,
		]).process(layeredCss, {
			from: '/app/node_modules/@c15t/ui/dist/styles/components/button.css',
		});

		expect(result.css).toContain('.c15t-ui-button-a1b2c');
		expect(result.css).not.toMatch(/@layer\b/u);
	});

	test('loads through a real require() of the built dist entry', () => {
		const raw = execFileSync(
			process.execPath,
			[
				join(TEST_DIR, 'postcss-require-probe.mjs'),
				layeredCss,
				'/app/node_modules/@c15t/ui/dist/styles/components/button.css',
			],
			{ encoding: 'utf8' }
		);
		const { css } = JSON.parse(raw) as { css: string };

		expect(css).toContain('.c15t-ui-button-a1b2c');
		expect(css).toContain('.c15t-ui-force');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('unwraps c15t layers that an @import inlined into an app stylesheet', async () => {
		const root = parse(
			'@tailwind components;\n@layer components { .app-card { color: red; } }',
			{ from: '/app/src/app.css' }
		);
		root.prepend(
			parse(layeredCss, {
				from: '/app/node_modules/@c15t/ui/dist/styles.css',
			}).nodes
		);

		const { css } = await postcss([tailwind3Plugin]).process(root, {
			from: '/app/src/app.css',
		});

		expect(css).toContain('.c15t-ui-button-a1b2c');
		expect(css).not.toContain('@layer theme, base, components, utilities');
		expect(css.match(/@layer components/gu)).toHaveLength(1);
		expect(css).toMatch(/@layer components \{ \.app-card/u);
	});

	test('unwraps c15t layers inside an adapter stylesheet that imports @c15t/ui', async () => {
		const from = '/app/node_modules/@c15t/astro/dist/styles.css';
		const root = parse(
			'@layer properties, theme, base, components, utilities;',
			{ from }
		);
		root.append(
			parse(layeredCss, {
				from: '/app/node_modules/@c15t/ui/dist/styles.css',
			}).nodes
		);

		const { css } = await postcss([tailwind3Plugin]).process(root, { from });

		expect(css).toContain('.c15t-ui-button-a1b2c');
		expect(css).not.toMatch(/@layer\b/u);
	});

	test('matches realistic package paths only', () => {
		for (const path of [
			'/app/node_modules/@c15t/ui/dist/styles.css',
			'/app/node_modules/.pnpm/@c15t+ui@3.0.0/node_modules/@c15t/ui/dist/styles/dialog.css',
			'/app/node_modules/@c15t/svelte/dist/styles.css',
			'/app/node_modules/@c15t/astro/dist/styles.css',
			'/app/node_modules/@c15t/browser/dist/c15t.css',
			'/app/node_modules/c15t/dist/react/styles.css',
			join(PACKAGES_DIR, 'svelte', 'dist', 'styles.css'),
			'/app/node_modules/@c15t/ui/dist/styles/dialog.css?transform-only',
		]) {
			expect(isC15tUiStylesheetPath(path)).toBe(true);
		}
		for (const path of [
			'/app/node_modules/@other/ui/dist/styles.css',
			'/app/node_modules/c15t-theme/dist/styles.css',
			'/repo/packages/web/dist/styles.css',
			'/home/dev/app/packages/react/dist/styles.css',
			'/app/src/styles.css',
		]) {
			expect(isC15tUiStylesheetPath(path)).toBe(false);
		}
	});

	test('matches realistic @c15t/ui paths', () => {
		expect(
			isC15tUiStylesheetPath(
				'/app/node_modules/@c15t/ui/dist/styles/components/button.css'
			)
		).toBe(true);
		expect(
			isC15tUiStylesheetPath(
				join(PACKAGES_DIR, 'c15t-ui', 'dist', 'styles', 'components', 'button.css')
			)
		).toBe(true);
		expect(
			isC15tUiStylesheetPath('/app/node_modules/@c15t/ui/dist/styles.css')
		).toBe(true);
		expect(
			isC15tUiStylesheetPath(
				'C:\\app\\node_modules\\@c15t\\ui\\dist\\iab\\styles.css'
			)
		).toBe(true);
		expect(
			isC15tUiStylesheetPath('/app/node_modules/@c15t/ui/dist/styles.tw3.css')
		).toBe(true);
		expect(
			isC15tUiStylesheetPath('/app/dist/styles/components/button.css')
		).toBe(false);
		expect(isC15tUiStylesheetPath('/app/dist/styles.css')).toBe(false);
		expect(
			isC15tUiStylesheetPath('/app/node_modules/@c15t/browser/dist/c15t.css')
		).toBe(true);
		expect(
			isC15tUiStylesheetPath(
				'/app/node_modules/@c15t/browser/dist/c15t.iab.css'
			)
		).toBe(true);
		expect(
			isC15tUiStylesheetPath('/app/node_modules/@c15t/browser/dist/c15t.js')
		).toBe(false);
		expect(
			isC15tUiStylesheetPath('/app/node_modules/other-ui/dist/styles.css')
		).toBe(false);
	});
});
