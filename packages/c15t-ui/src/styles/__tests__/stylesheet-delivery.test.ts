import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'postcss';
import type { AtRule, ChildNode, Container, Declaration } from 'postcss';
import { describe, expect, test } from 'vitest';

import {
	DIALOG_COMPONENTS,
	FIRST_PAINT_COMPONENTS,
	IAB_PREFIX,
} from '../../../scripts/stylesheet-parts';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const COMPONENTS_DIR = join(DIST_DIR, 'styles', 'components');
const PRIMITIVES_DIR = join(DIST_DIR, 'styles', 'primitives');

const readDist = function readDist(path: string): string {
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @c15t/ui first: bun run --cwd packages/ui build`
		);
	}
	return readFileSync(path, 'utf8');
};

const listFiles = function listFiles(dir: string, suffix: string): string[] {
	if (!existsSync(dir)) {
		throw new Error(
			`Missing ${dir}. Build @c15t/ui first: bun run --cwd packages/ui build`
		);
	}
	return readdirSync(dir)
		.filter((file) => file.endsWith(suffix))
		.sort();
};

const contextOf = function contextOf(node: ChildNode): string {
	const context: string[] = [];
	for (
		let parent: Container | undefined = node.parent as Container | undefined;
		parent && parent.type !== 'root';
		parent = parent.parent as Container | undefined
	) {
		if (parent.type === 'atrule' && 'name' in parent) {
			const atRule = parent as AtRule;
			if (atRule.name !== 'layer') {
				context.unshift(`@${atRule.name} ${atRule.params}`);
			}
		}
	}
	return context.join(' ');
};

const normalizeSelector = function normalizeSelector(selector: string): string {
	return selector
		.split(',')
		.map((part) => part.trim())
		.filter((part) => !part.startsWith(':host'))
		.join(',');
};

const ruleKeys = function ruleKeys(css: string): Set<string> {
	const keys = new Set<string>();
	parse(css).walkRules((rule) => {
		const parent = rule.parent as AtRule | undefined;
		if (parent?.type === 'atrule' && parent.name.endsWith('keyframes')) {
			return;
		}
		const declarations = rule.nodes
			.filter((node): node is Declaration => node.type === 'decl')
			.map((node) => `${node.prop}:${node.value}`)
			.join(';');
		if (declarations) {
			keys.add(
				`${contextOf(rule)}|${normalizeSelector(rule.selector)}|${declarations}`
			);
		}
	});
	return keys;
};

const COMPONENT_STYLESHEETS = listFiles(COMPONENTS_DIR, '.css');

describe('class maps carry no CSS', () => {
	const classMaps = [
		...listFiles(COMPONENTS_DIR, '.js').map((file) =>
			join(COMPONENTS_DIR, file)
		),
		...listFiles(PRIMITIVES_DIR, '.js').map((file) =>
			join(PRIMITIVES_DIR, file)
		),
	];

	test('the build emits class maps to check', () => {
		expect(classMaps.length).toBeGreaterThan(COMPONENT_STYLESHEETS.length);
	});

	for (const path of classMaps) {
		const label = path.slice(DIST_DIR.length + 1);
		test(`${label} does not import a stylesheet`, () => {
			const contents = readDist(path);

			expect(contents).not.toMatch(/\.css["']/u);
			expect(contents).not.toMatch(/\bimport\s*["']/u);
		});
	}
});

const isVariableRule = (key: string) => key.split('|')[1]?.includes(':root');

const sheets = {
	dialog: ruleKeys(readDist(join(DIST_DIR, 'styles', 'dialog.css'))),
	iab: ruleKeys(readDist(join(DIST_DIR, 'iab', 'styles.css'))),
	iabTw3: ruleKeys(readDist(join(DIST_DIR, 'iab', 'styles.tw3.css'))),
	primitives: ruleKeys(readDist(join(DIST_DIR, 'styles', 'primitives.css'))),
	styles: ruleKeys(readDist(join(DIST_DIR, 'styles.css'))),
	stylesTw3: ruleKeys(readDist(join(DIST_DIR, 'styles.tw3.css'))),
};

const groupOf = function groupOf(
	file: string
): 'dialog' | 'first-paint' | 'iab' {
	const name = file.replace(/\.css$/u, '');
	if (name.startsWith(IAB_PREFIX)) {
		return 'iab';
	}
	if ((DIALOG_COMPONENTS as readonly string[]).includes(name)) {
		return 'dialog';
	}
	if ((FIRST_PAINT_COMPONENTS as readonly string[]).includes(name)) {
		return 'first-paint';
	}
	throw new Error(`components/${file} is in neither stylesheet part`);
};

const missingFrom = (rules: string[], sheet: Set<string>) =>
	rules.filter((rule) => !sheet.has(rule));

const TARGETS = {
	dialog: {
		rules: [sheets.styles, sheets.stylesTw3],
		variables: [sheets.styles, sheets.stylesTw3],
	},
	'first-paint': {
		rules: [sheets.styles, sheets.stylesTw3],
		variables: [sheets.styles, sheets.stylesTw3],
	},
	iab: {
		rules: [sheets.iab, sheets.iabTw3],
		variables: [sheets.iab, sheets.iabTw3],
	},
} as const;

describe('each component rule lands in the stylesheet for its surface', () => {
	for (const file of COMPONENT_STYLESHEETS) {
		const group = groupOf(file);
		const target = TARGETS[group];

		test(`components/${file} (${group})`, () => {
			const all = [...ruleKeys(readDist(join(COMPONENTS_DIR, file)))];
			const variables = all.filter(isVariableRule);
			const rules = all.filter((rule) => !isVariableRule(rule));

			expect(rules.length).toBeGreaterThan(0);
			expect(target.rules.map((sheet) => missingFrom(rules, sheet))).toEqual(
				target.rules.map(() => [])
			);
			expect(
				target.variables.map((sheet) => missingFrom(variables, sheet))
			).toEqual(target.variables.map(() => []));
		});
	}

	for (const file of listFiles(PRIMITIVES_DIR, '.module.css')) {
		test(`primitives/${file}`, () => {
			const rules = [...ruleKeys(readDist(join(PRIMITIVES_DIR, file)))].filter(
				(rule) => !isVariableRule(rule)
			);
			expect(missingFrom(rules, sheets.primitives)).toEqual([]);
		});
	}
});

describe('styles.css holds no primitive or IAB rule', () => {
	const classNamesOf = function classNamesOf(path: string): string[] {
		return [...readDist(path).matchAll(/c15t-ui-[\w-]+/gu)].map(
			(match) => match[0]
		);
	};
	const selectorsOf = (keys: Set<string>) =>
		[...keys].map((key) => key.split('|')[1] ?? '').join('\n');

	const deferred = [
		...listFiles(PRIMITIVES_DIR, '.module.js').map(
			(file) => `primitives/${file}`
		),
		...COMPONENT_STYLESHEETS.filter((file) => file.startsWith(IAB_PREFIX)).map(
			(file) => `components/${file.replace(/\.css$/u, '.js')}`
		),
	];

	for (const classMap of deferred) {
		test(`styles.css and styles.tw3.css select no class from ${classMap}`, () => {
			const classNames = classNamesOf(join(DIST_DIR, 'styles', classMap));
			expect(classNames.length).toBeGreaterThan(0);
			for (const sheet of [sheets.styles, sheets.stylesTw3]) {
				const selectors = selectorsOf(sheet);
				expect(classNames.filter((name) => selectors.includes(name))).toEqual(
					[]
				);
			}
		});
	}

	test('the primitive and IAB sheets declare no variables', () => {
		expect([...sheets.primitives].filter(isVariableRule)).toEqual([]);
		expect(
			[...sheets.iab].filter(
				(rule) => isVariableRule(rule) && sheets.styles.has(rule)
			)
		).toEqual([]);
	});

	test('no rule reaches the page twice', () => {
		const overlap = (a: Set<string>, b: Set<string>) =>
			[...a].filter((rule) => b.has(rule));

		expect(sheets.dialog).toEqual(new Set());
		expect(overlap(sheets.styles, sheets.primitives)).toEqual([]);
		expect(overlap(sheets.styles, sheets.iab)).toEqual([]);
	});

	test('the primitive sheet keeps its rules in @layer components', () => {
		const root = parse(readDist(join(DIST_DIR, 'styles', 'primitives.css')));
		const topLevel = root.nodes.filter((node) => node.type !== 'comment');
		expect(topLevel).toHaveLength(2);
		expect(topLevel[1]).toMatchObject({
			name: 'layer',
			params: 'components',
			type: 'atrule',
		});
	});
});
