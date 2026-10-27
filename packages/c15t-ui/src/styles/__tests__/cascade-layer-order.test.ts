import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'postcss';
import type { AtRule, Rule } from 'postcss';
import { describe, expect, test } from 'vitest';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');

const TAILWIND_4_LAYER_ORDER = [
	'properties',
	'theme',
	'base',
	'components',
	'utilities',
];

const LAYERED_ENTRYPOINTS = [
	'styles.css',
	join('styles', 'primitives.css'),
	join('iab', 'styles.css'),
];

const FLAT_ENTRYPOINTS = ['styles.tw3.css', join('iab', 'styles.tw3.css')];

const readEntrypoint = function readEntrypoint(relativePath: string): string {
	const path = join(DIST_DIR, relativePath);
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @c15t/ui first: bun run --cwd packages/ui build`
		);
	}
	return readFileSync(path, 'utf8');
};

const layerRules = function layerRules(css: string): AtRule[] {
	const rules: AtRule[] = [];
	parse(css).walkAtRules('layer', (rule) => {
		rules.push(rule);
	});
	return rules;
};

describe.each(LAYERED_ENTRYPOINTS)('%s', (entrypoint) => {
	const css = readEntrypoint(entrypoint);

	test('mentions Tailwind 4 layer order before any layer block', () => {
		const [first] = layerRules(css);

		expect({
			isBlock: first?.nodes !== undefined,
			order: first?.params.split(/\s*,\s*/u),
		}).toEqual({ isBlock: false, order: TAILWIND_4_LAYER_ORDER });
	});
});

describe.each(FLAT_ENTRYPOINTS)('%s', (entrypoint) => {
	test('stays free of @layer for Tailwind 3', () => {
		expect(layerRules(readEntrypoint(entrypoint))).toEqual([]);
	});
});

const COMPONENT_STYLESHEETS = readdirSync(
	join(DIST_DIR, 'styles', 'components')
)
	.filter((file) => file.endsWith('.css'))
	.map((file) => join('styles', 'components', file))
	.sort();

describe.each(COMPONENT_STYLESHEETS)('%s', (stylesheet) => {
	const css = readEntrypoint(stylesheet);

	test('mentions Tailwind 4 layer order before any layer block', () => {
		const [first] = layerRules(css);

		expect({
			isBlock: first?.nodes !== undefined,
			order: first?.params.split(/\s*,\s*/u),
		}).toEqual({ isBlock: false, order: TAILWIND_4_LAYER_ORDER });
	});

	test('keeps component rules inside @layer components', () => {
		const unlayered = parse(css)
			.nodes.filter(
				(node): node is Rule =>
					node.type === 'rule' &&
					!node.selectors.every((selector) =>
						/^:(?:root|host)\b/u.test(selector)
					)
			)
			.map((rule) => rule.selector);

		expect(unlayered).toEqual([]);
	});
});
