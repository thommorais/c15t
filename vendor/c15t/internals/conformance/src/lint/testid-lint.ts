#!/usr/bin/env bun

import { Glob } from 'bun';

import { isCanonicalTestId } from '../contract/test-ids';

export interface TestIdViolation {
	file: string;
	line: number;
	testId: string;
	kind: 'literal' | 'dynamic';
}

// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
const LITERAL_RE = /(?:^|\s)data-testid=(?:"([^"]+)"|'(?<capture1>[^']+)')/gu;
// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
const TEMPLATE_RE = /(?:^|\s)data-testid=\{`([^`]+)`\}/gu;

const SKIP_FRAGMENTS = [
	'__tests__/',
	'.test.',
	'.spec.',
	'.stories.',
	'/dist/',
	'/node_modules/',
	'/.svelte-kit/',
];

export const scanFileForViolations = async function scanFileForViolations(
	absPath: string
): Promise<TestIdViolation[]> {
	const violations: TestIdViolation[] = [];
	const contents = await Bun.file(absPath).text();
	const lines = contents.split('\n');

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		for (const m of line.matchAll(LITERAL_RE)) {
			const id = m[1] ?? m[2];
			if (!id) {
				continue;
			}
			if (!isCanonicalTestId(id)) {
				violations.push({
					file: absPath,
					kind: 'literal',
					line: i + 1,
					testId: id,
				});
			}
		}
		for (const m of line.matchAll(TEMPLATE_RE)) {
			// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
			const template = m[1];
			if (!template) {
				continue;
			}
			const probed = template.replace(/\$\{[^}]+\}/gu, 'sample');
			if (!isCanonicalTestId(probed)) {
				violations.push({
					file: absPath,
					kind: 'dynamic',
					line: i + 1,
					testId: template,
				});
			}
		}
	}

	return violations;
};

export const runTestIdLint = async function runTestIdLint(
	roots: readonly string[]
): Promise<TestIdViolation[]> {
	const violations: TestIdViolation[] = [];
	for (const root of roots) {
		const glob = new Glob('**/*.{tsx,jsx,ts,svelte,vue}');
		// oxlint-disable-next-line no-await-in-loop -- Preserve sequential execution and callback compatibility.
		for await (const match of glob.scan({ cwd: root, onlyFiles: true })) {
			const rel = `${root}/${match}`;
			if (SKIP_FRAGMENTS.some((frag) => rel.includes(frag))) {
				continue;
			}
			const fileViolations = await scanFileForViolations(rel);
			violations.push(...fileViolations);
		}
	}
	return violations;
};

const main = async function main(): Promise<void> {
	const roots = [
		'packages/react',
		'packages/svelte',
		'packages/vue',
		'packages/solid',
		'packages/ui',
	];
	const violations = await runTestIdLint(roots);
	if (violations.length === 0) {
		// oxlint-disable-next-line no-console -- CLI output
		console.log('✓ testid-lint: all test-ids are canonical');
		process.exit(0);
	}
	// oxlint-disable-next-line no-console -- CLI output
	console.error(`✗ testid-lint: ${violations.length} non-canonical test-id(s)`);
	for (const v of violations) {
		// oxlint-disable-next-line no-console -- CLI output
		console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.testId}`);
	}
	// oxlint-disable-next-line no-console -- CLI output
	console.error(
		'\nAdd the test-id to internals/conformance/src/contract/test-ids.ts (TEST_IDS or TEST_ID_PATTERNS)'
	);
	process.exit(1);
};

if (import.meta.main) {
	await main();
}
