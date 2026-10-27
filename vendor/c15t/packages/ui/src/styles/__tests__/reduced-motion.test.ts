import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { parse } from 'postcss';
import type { Container, Rule } from 'postcss';
import { describe, expect, test } from 'vitest';

const STYLES_DIR = join(__dirname, '..');

const MODULE_DIRS = ['components', 'primitives'].map((dir) =>
	join(STYLES_DIR, dir)
);

const MOTION_PROPERTY = /^(?:transition|animation)(?:-name|-duration)?$/u;

const STOPS_MOTION = /^(?:none|0m?s?)(?:\s|,|$)/u;

const normalize = (selector: string): string =>
	selector
		.replace(/\s+/gu, ' ')
		.replace(/\(\s+/gu, '(')
		.replace(/\s+\)/gu, ')');

const ancestors = function ancestors(rule: Rule): Container[] {
	const list: Container[] = [];
	let { parent } = rule;
	while (parent) {
		list.push(parent);
		({ parent } = parent);
	}
	return list;
};

const isReducedMotion = (node: Container): boolean =>
	node.type === 'atrule' &&
	'params' in node &&
	/prefers-reduced-motion:\s*reduce/u.test(String(node.params));

const isInert = (node: Container): boolean =>
	node.type === 'atrule' &&
	'name' in node &&
	/keyframes|starting-style/u.test(String(node.name));

const unguardedSelectors = function unguardedSelectors(
	source: string
): string[] {
	const animated: { selector: string; index: number }[] = [];
	const reduced: { selector: string; index: number }[] = [];
	let index = 0;

	parse(source).walkRules((rule) => {
		index += 1;
		const parents = ancestors(rule);
		if (parents.some(isInert)) {
			return;
		}
		const selectors = rule.selectors.map(normalize);
		if (parents.some(isReducedMotion)) {
			for (const selector of selectors) {
				reduced.push({ index, selector });
			}
			return;
		}
		let animates = false;
		rule.walkDecls(MOTION_PROPERTY, (decl) => {
			if (!STOPS_MOTION.test(decl.value.trim())) {
				animates = true;
			}
		});
		if (animates) {
			for (const selector of selectors) {
				animated.push({ index, selector });
			}
		}
	});

	return animated
		.filter(
			({ selector, index: at }) =>
				!reduced.some(
					(guard) => guard.selector === selector && guard.index > at
				)
		)
		.map(({ selector }) => selector);
};

const moduleFiles = MODULE_DIRS.flatMap((dir) =>
	readdirSync(dir)
		.filter((file) => file.endsWith('.module.css'))
		.map((file) => join(dir, file))
);

describe('reduced motion', () => {
	test.each(moduleFiles.map((file) => [relative(STYLES_DIR, file), file]))(
		'%s stops every transition and animation it starts',
		(_name, file) => {
			expect(unguardedSelectors(readFileSync(file, 'utf8'))).toEqual([]);
		}
	);

	test('a lighter reduced-motion selector does not count', () => {
		const css = `
			.banner:not(.headless) { transition: opacity 80ms; }
			@media (prefers-reduced-motion: reduce) {
				.banner { transition: none; }
			}`;
		expect(unguardedSelectors(css)).toEqual(['.banner:not(.headless)']);
	});
});
