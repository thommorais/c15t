import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'postcss';
import type { AtRule, ChildNode, Container, Declaration } from 'postcss';
import { describe, expect, test } from 'vitest';

import { DIALOG_COMPONENTS } from '../../../scripts/stylesheet-parts';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const SHEETS_DIR = join(DIST_DIR, 'styles', 'sheets');

const readDist = function readDist(path: string): string {
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @c15t/ui first: bun run --cwd packages/ui build`
		);
	}
	return readFileSync(path, 'utf8');
};

interface Sheet {
	id: string;
	css: string;
}

const importSheet = async function importSheet(name: string): Promise<Sheet> {
	readDist(join(SHEETS_DIR, `${name}.js`));
	return (await import(
		pathToFileURL(join(SHEETS_DIR, `${name}.js`)).href
	)) as Sheet;
};

const contextOf = function contextOf(node: ChildNode): string {
	const context: string[] = [];
	for (
		let parent = node.parent as Container | undefined;
		parent && parent.type !== 'root';
		parent = parent.parent as Container | undefined
	) {
		if (parent.type === 'atrule') {
			const atRule = parent as AtRule;
			context.unshift(`@${atRule.name} ${atRule.params}`);
		}
	}
	return context.join(' ');
};

const ruleList = function ruleList(css: string): string[] {
	const rules: string[] = [];
	parse(css).walkRules((rule) => {
		const declarations = rule.nodes
			.filter((node): node is Declaration => node.type === 'decl')
			.map((node) => `${node.prop}:${node.value}`)
			.join(';');
		rules.push(`${contextOf(rule)}|${rule.selector}|${declarations}`);
	});
	return rules;
};

const layerStatements = (css: string): string[] =>
	parse(css)
		.nodes.filter(
			(node): node is AtRule =>
				node.type === 'atrule' && node.name === 'layer' && !node.nodes
		)
		.map((node) => node.params);

describe('styles/sheets', async () => {
	const firstPaint = await importSheet('first-paint');
	const dialog = await importSheet('dialog');
	const primitives = await importSheet('primitives');
	const iabFirstPaint = await importSheet('iab-first-paint');
	const iabDialog = await importSheet('iab-dialog');
	const sheets = [firstPaint, dialog, primitives, iabFirstPaint, iabDialog];

	test('each sheet has its own id', () => {
		expect(sheets.map((sheet) => sheet.id)).toEqual([
			'c15t-first-paint',
			'c15t-dialog',
			'c15t-primitives',
			'c15t-iab-first-paint',
			'c15t-iab-dialog',
		]);
	});

	test('first-paint then dialog apply what styles.css applies, in order', () => {
		const styles = ruleList(readDist(join(DIST_DIR, 'styles.css')));
		const asInStyles = (rule: string) =>
			rule.replaceAll(':where(:root)', ':root').replaceAll('html.', ':root.');

		expect(styles.length).toBeGreaterThan(0);
		expect(
			[...ruleList(firstPaint.css), ...ruleList(dialog.css)].map(asInStyles)
		).toEqual(styles);
	});

	test("the default tokens rank below the app's own token rules", () => {
		const selectors = new Set(
			ruleList(firstPaint.css)
				.filter((rule) => rule.split('|')[2]?.includes('--c15t-'))
				.map((rule) => rule.split('|')[1] ?? '')
		);

		expect(selectors.size).toBeGreaterThan(0);
		for (const selector of selectors) {
			expect(selector).not.toMatch(/(?<!:where\():root/u);
		}
		expect([...selectors].join('\n')).toContain('html.c15t-dark');
	});

	test('primitives applies what styles/primitives.css applies', () => {
		expect(ruleList(primitives.css)).toEqual(
			ruleList(readDist(join(DIST_DIR, 'styles', 'primitives.css')))
		);
	});

	test('every sheet opens with the layer order', () => {
		for (const sheet of sheets) {
			expect(layerStatements(sheet.css)).toEqual([
				'properties, theme, base, components, utilities',
			]);
		}
	});

	test('first-paint holds no dialog or widget rule', () => {
		const dialogClasses = DIALOG_COMPONENTS.flatMap((name) =>
			[
				...readDist(
					join(DIST_DIR, 'styles', 'components', `${name}.js`)
				).matchAll(/c15t-ui-[\w-]+/gu),
			].map((match) => match[0])
		);
		const selectors = ruleList(firstPaint.css)
			.map((rule) => rule.split('|')[1])
			.join('\n');

		expect(dialogClasses.length).toBeGreaterThan(0);
		expect(dialogClasses.filter((name) => selectors.includes(name))).toEqual(
			[]
		);
	});

	test('dialog.css holds the dialog sheet', () => {
		expect(readDist(join(SHEETS_DIR, 'dialog.css')).trim()).toBe(dialog.css);
	});

	test('IAB sheets preserve every aggregate rule without resetting variables', () => {
		const asInStyles = (rule: string) =>
			rule.replaceAll(':where(:root)', ':root').replaceAll('html.', ':root.');
		expect(
			[...ruleList(iabFirstPaint.css), ...ruleList(iabDialog.css)]
				.map(asInStyles)
				.sort()
		).toEqual(ruleList(readDist(join(DIST_DIR, 'iab/styles.css'))).sort());
		const declarations: string[] = [];
		parse(iabDialog.css).walkDecls((declaration) => {
			declarations.push(declaration.prop);
		});
		expect(declarations.filter((name) => name.startsWith('--'))).toEqual([]);
	});

	test('IAB banner CSS excludes dialog rules and preserves app overrides', () => {
		const selectors = ruleList(iabFirstPaint.css)
			.map((rule) => rule.split('|')[1])
			.join('\n');
		const panelClasses = [
			...readDist(join(DIST_DIR, 'styles/components/iab-panel.js')).matchAll(
				/c15t-ui-[\w-]+/gu
			),
		].map((match) => match[0]);
		expect(panelClasses.length).toBeGreaterThan(0);
		expect(panelClasses.filter((name) => selectors.includes(name))).toEqual([]);
		expect(iabFirstPaint.css).toContain(':where(:root)');
		expect(iabFirstPaint.css).not.toMatch(/(?<!:where\():root/u);
	});

	test('iab-dialog.css holds the IAB dialog sheet', () => {
		expect(readDist(join(SHEETS_DIR, 'iab-dialog.css')).trim()).toBe(
			iabDialog.css
		);
	});
});
