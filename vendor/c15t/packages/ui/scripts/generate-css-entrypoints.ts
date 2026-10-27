import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { defaultTheme, generateDefaultThemeCSS } from '../src/theme/utils';
import {
	DIALOG_COMPONENTS,
	FIRST_PAINT_COMPONENTS,
	IAB_DIALOG_COMPONENTS,
	IAB_FIRST_PAINT_COMPONENTS,
	IAB_PREFIX,
	LAYER_ORDER,
} from './stylesheet-parts';

const DIST_DIR = join(import.meta.dirname, '..', 'dist');
const TYPES_DIR = join(import.meta.dirname, '..', 'dist-types');
const PRIMITIVES_DIR = join(DIST_DIR, 'styles', 'primitives');
const COMPONENTS_DIR = join(DIST_DIR, 'styles', 'components');

for (const file of readdirSync(PRIMITIVES_DIR)) {
	if (file.endsWith('_module.css')) {
		renameSync(
			join(PRIMITIVES_DIR, file),
			join(PRIMITIVES_DIR, file.replace('_module.css', '.module.css'))
		);
	}
}

for (const file of readdirSync(PRIMITIVES_DIR)) {
	if (file.endsWith('.module.js')) {
		const filePath = join(PRIMITIVES_DIR, file);
		let content = readFileSync(filePath, 'utf-8');
		if (content.includes('_module.css')) {
			content = content.replace(/_module\.css/gu, '.module.css');
		}
		content = content.replace(
			/import\s*["'][^"']+\.module\.css["']\s*;?/gu,
			''
		);
		writeFileSync(filePath, content);
	}
}

const discoverPrimitiveNames = function discoverPrimitiveNames(): string[] {
	return readdirSync(PRIMITIVES_DIR)
		.filter((f) => f.endsWith('.module.css'))
		.map((f) => f.replace('.module.css', ''))
		.sort();
};

const discoverComponentNames = function discoverComponentNames(): string[] {
	if (!existsSync(COMPONENTS_DIR)) {
		return [];
	}
	const files = readdirSync(COMPONENTS_DIR);
	const stale = files.filter(
		(f) => f.endsWith('_module.css') || f.endsWith('.module.css')
	);
	if (stale.length > 0) {
		throw new Error(
			`generate-css-entrypoints: dist/styles/components still contains rslib CSS Module artifacts (${stale.join(
				', '
			)}); run generate-style-artifacts.ts first`
		);
	}
	return files
		.filter((f) => f.endsWith('.css'))
		.map((f) => f.replace(/\.css$/u, ''))
		.sort();
};

const NON_IAB_PRIMITIVES = discoverPrimitiveNames();
const allComponents = discoverComponentNames();
const NON_IAB_COMPONENTS = allComponents.filter(
	(c) => !c.startsWith(IAB_PREFIX)
);
const IAB_COMPONENTS = allComponents.filter((c) => c.startsWith(IAB_PREFIX));

if (NON_IAB_PRIMITIVES.length === 0) {
	throw new Error(
		'generate-css-entrypoints: no primitives found in dist/styles/primitives/'
	);
}
if (NON_IAB_COMPONENTS.length === 0) {
	throw new Error(
		'generate-css-entrypoints: no components found in dist/styles/components/'
	);
}

const firstPaintNames = new Set<string>(FIRST_PAINT_COMPONENTS);
const dialogNames = new Set<string>(DIALOG_COMPONENTS);
const unassigned = NON_IAB_COMPONENTS.filter(
	(c) => !(firstPaintNames.has(c) || dialogNames.has(c))
);
if (unassigned.length > 0) {
	throw new Error(
		`generate-css-entrypoints: add ${unassigned.join(
			', '
		)} to FIRST_PAINT_COMPONENTS or DIALOG_COMPONENTS in scripts/stylesheet-parts.ts`
	);
}
const missing = [...firstPaintNames, ...dialogNames].filter(
	(c) => !NON_IAB_COMPONENTS.includes(c)
);
if (missing.length > 0) {
	throw new Error(
		`generate-css-entrypoints: scripts/stylesheet-parts.ts lists ${missing.join(
			', '
		)}, which dist/styles/components does not contain`
	);
}

const findComponentsLayer = function findComponentsLayer(
	css: string
): { start: number; bodyStart: number; end: number } | null {
	const match = /@layer\s+components\s*\{/u.exec(css);
	if (!match) {
		return null;
	}
	const bodyStart = match.index + match[0].length;
	let depth = 1;
	for (let index = bodyStart; index < css.length; index += 1) {
		const char = css[index];
		if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return { bodyStart, end: index, start: match.index };
			}
		}
	}
	throw new Error(
		'generate-css-entrypoints: unbalanced @layer components block'
	);
};

const splitStylesheet = function splitStylesheet(source: string): {
	unlayered: string;
	componentRules: string;
} {
	const css = source.replace(LAYER_ORDER, '');
	const layer = findComponentsLayer(css);
	if (!layer) {
		return { componentRules: css.trim(), unlayered: '' };
	}
	const componentRules = css.slice(layer.bodyStart, layer.end).trim();
	const unlayered = `${css.slice(0, layer.start)}${css.slice(
		layer.end + 1
	)}`.trim();
	return { componentRules, unlayered };
};

const splitTopLevelStatements = function splitTopLevelStatements(
	css: string
): string[] {
	const statements: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < css.length; index += 1) {
		const char = css[index];
		if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				statements.push(css.slice(start, index + 1).trim());
				start = index + 1;
			}
		}
	}
	const tail = css.slice(start).trim();
	if (tail) {
		statements.push(tail);
	}
	return statements.filter(Boolean);
};

const scopeRootToHost = function scopeRootToHost(css: string): string {
	return css.replace(
		/(?<before>^|[\s,}{;]):root(?<className>\.[A-Za-z0-9_-]+)?(?=[\s,{])/gu,
		(_match, before: string, className: string | undefined) =>
			className
				? `${before}:root${className}, :host(${className})`
				: `${before}:root, :host`
	);
};

interface StylesheetSource {
	group: string;
	label: string;
	path: string;
}

const collectCssParts = function collectCssParts(
	sources: StylesheetSource[],
	seenUnlayered: Set<string>
): { rootParts: string[]; ruleParts: Map<string, string[]> } {
	const rootParts: string[] = [];
	const ruleParts = new Map<string, string[]>();

	for (const { group, label, path } of sources) {
		const { unlayered, componentRules } = splitStylesheet(
			readFileSync(path, 'utf-8')
		);
		const uniqueUnlayered = splitTopLevelStatements(
			scopeRootToHost(unlayered)
		).filter((statement) => {
			if (seenUnlayered.has(statement)) {
				return false;
			}
			seenUnlayered.add(statement);
			return true;
		});
		if (uniqueUnlayered.length > 0) {
			rootParts.push(`/* ${label} vars */\n${uniqueUnlayered.join('\n')}`);
		}
		if (componentRules) {
			const parts = ruleParts.get(group) ?? [];
			parts.push(`/* ${label} */\n${componentRules}`);
			ruleParts.set(group, parts);
		}
	}

	return { rootParts, ruleParts };
};

const DEFAULT_THEME_BANNER =
	'/* default theme tokens (generated from defaultTheme) */';
const DEFAULT_THEME_CSS = [
	DEFAULT_THEME_BANNER,
	generateDefaultThemeCSS({
		...defaultTheme,
		colors: {
			...defaultTheme.colors,
			switchTrackActive: 'var(--c15t-primary)',
		},
		dark: {
			...defaultTheme.dark,
			switchTrackActive: 'var(--c15t-primary)',
		},
	}),
].join('\n');

const TAILWIND3_HINT =
	"/* Tailwind 3 cannot build the next block on its own. Add '@c15t/ui/postcss-tailwind3' before 'tailwindcss' in your PostCSS plugins. */";

const layered = function layered(ruleParts: string[]): string {
	return `${TAILWIND3_HINT}\n@layer components {\n${ruleParts.map((r) => `  ${r}`).join('\n\n')}\n}`;
};

const joinParts = function joinParts(parts: (string | undefined)[]): string {
	return `${parts.filter((part) => part && part.length > 0).join('\n\n')}\n`;
};

const rulesFor = function rulesFor(
	ruleParts: Map<string, string[]>,
	group: string,
	file: string
): string[] {
	const parts = ruleParts.get(group) ?? [];
	if (parts.length === 0) {
		throw new Error(
			`generate-css-entrypoints: no component rules collected for ${file}`
		);
	}
	return parts;
};

const writeDist = function writeDist(relativePath: string, css: string) {
	const target = join(DIST_DIR, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, css);
};

const yieldToAppRoot = function yieldToAppRoot(css: string): string {
	return css
		.replace(/:root(?=[.[:])/gu, 'html')
		.replace(/:root(?![\w-])/gu, ':where(:root)');
};

const writeSheet = function writeSheet(name: string, css: string): string {
	const text = css
		.replace(/\/\*[\s\S]*?\*\//gu, '')
		.replace(/\n{2,}/gu, '\n')
		.trim();
	writeDist(
		`styles/sheets/${name}.js`,
		`export const id = ${JSON.stringify(`c15t-${name}`)};\nexport const css = ${JSON.stringify(text)};\n`
	);
	const declaration = join(TYPES_DIR, 'styles', 'sheets', `${name}.d.ts`);
	mkdirSync(dirname(declaration), { recursive: true });
	writeFileSync(
		declaration,
		[
			'/** Identifies the stylesheet, so a page renders it once. */',
			'export declare const id: string;',
			'/** The stylesheet text. */',
			'export declare const css: string;',
			'',
		].join('\n')
	);
	rmSync(join(DIST_DIR, 'styles', 'sheets', `${name}.d.ts`), { force: true });
	return text;
};

const seenUnlayered = new Set<string>();
const nonIab = collectCssParts(
	[
		...NON_IAB_PRIMITIVES.map((name) => ({
			group: 'primitives',
			label: `primitives/${name}`,
			path: join(PRIMITIVES_DIR, `${name}.module.css`),
		})),
		...NON_IAB_COMPONENTS.map((name) => ({
			group: dialogNames.has(name) ? 'dialog' : 'first-paint',
			label: `components/${name}`,
			path: join(COMPONENTS_DIR, `${name}.css`),
		})),
	],
	seenUnlayered
);
const rootCss = nonIab.rootParts.join('\n\n');
const componentRules = [
	...rulesFor(nonIab.ruleParts, 'first-paint', 'styles.css'),
	...rulesFor(nonIab.ruleParts, 'dialog', 'styles.css'),
];

writeDist(
	'styles.css',
	joinParts([LAYER_ORDER, DEFAULT_THEME_CSS, rootCss, layered(componentRules)])
);

writeDist(
	'styles.tw3.css',
	joinParts([DEFAULT_THEME_CSS, rootCss, componentRules.join('\n\n')])
);

writeDist(
	'styles/dialog.css',
	'/* Deprecated and empty: @c15t/ui/styles.css includes the dialog rules. */\n'
);
writeDist(
	'styles/dialog.js',
	'// Deprecated and empty: @c15t/ui/styles.css includes the dialog rules.\nexport {};\n'
);
writeDist('styles/dialog.d.ts', 'export {};\n');

const primitiveRules = rulesFor(
	nonIab.ruleParts,
	'primitives',
	'styles/primitives.css'
);
writeDist(
	'styles/primitives.css',
	joinParts([
		LAYER_ORDER,
		'/* @c15t/ui primitive styles. Needs @c15t/ui/styles.css for tokens and variables. */',
		layered(primitiveRules),
	])
);

writeSheet(
	'first-paint',
	[
		LAYER_ORDER,
		yieldToAppRoot(DEFAULT_THEME_CSS),
		yieldToAppRoot(rootCss),
		`@layer components{${rulesFor(nonIab.ruleParts, 'first-paint', 'styles/sheets/first-paint.js').join('\n')}}`,
	].join('\n')
);
writeDist(
	'styles/sheets/first-paint-deferred.js',
	[
		'export const id = "c15t-first-paint";',
		'export const css = "";',
		'export const load = () => import("./first-paint.js").then((sheet) => sheet.css);',
		'',
	].join('\n')
);
writeFileSync(
	join(TYPES_DIR, 'styles', 'sheets', 'first-paint-deferred.d.ts'),
	[
		'/** Identifies the stylesheet, so a page renders it once. */',
		'export declare const id: string;',
		'/** Empty: the text loads through `load`. */',
		'export declare const css: string;',
		'/** Loads the stylesheet text. */',
		'export declare const load: () => Promise<string>;',
		'',
	].join('\n')
);
const dialogSheet = `${LAYER_ORDER}\n@layer components{${rulesFor(nonIab.ruleParts, 'dialog', 'styles/sheets/dialog.js').join('\n')}}`;
writeDist('styles/sheets/dialog.css', `${writeSheet('dialog', dialogSheet)}\n`);
writeSheet(
	'primitives',
	`${LAYER_ORDER}\n@layer components{${primitiveRules.join('\n')}}`
);

if (IAB_COMPONENTS.length > 0) {
	const iabFirstPaintNames = new Set<string>(IAB_FIRST_PAINT_COMPONENTS);
	const iabDialogNames = new Set<string>(IAB_DIALOG_COMPONENTS);
	const unassignedIab = IAB_COMPONENTS.filter(
		(name) => !(iabFirstPaintNames.has(name) || iabDialogNames.has(name))
	);
	const missingIab = [...iabFirstPaintNames, ...iabDialogNames].filter(
		(name) => !IAB_COMPONENTS.includes(name)
	);
	if (unassignedIab.length > 0 || missingIab.length > 0) {
		throw new Error(
			`generate-css-entrypoints: IAB stylesheet groups differ from components (unassigned: ${unassignedIab.join(', ')}; missing: ${missingIab.join(', ')})`
		);
	}
	const iab = collectCssParts(
		IAB_COMPONENTS.map((name) => ({
			group: name,
			label: `components/${name}`,
			path: join(COMPONENTS_DIR, `${name}.css`),
		})),
		seenUnlayered
	);
	const iabRules = IAB_COMPONENTS.flatMap((name) =>
		rulesFor(iab.ruleParts, name, 'iab/styles.css')
	);
	const iabBanner =
		'/* @c15t/ui IAB TCF styles. Load after @c15t/ui/styles.css, which holds the tokens. */';
	const iabRoot = iab.rootParts.join('\n\n');

	writeDist(
		'iab/styles.css',
		joinParts([LAYER_ORDER, iabBanner, iabRoot, layered(iabRules)])
	);

	writeDist(
		'iab/styles.tw3.css',
		joinParts([iabBanner, iabRoot, iabRules.join('\n\n')])
	);

	writeSheet(
		'iab-first-paint',
		[
			LAYER_ORDER,
			yieldToAppRoot(iabRoot),
			`@layer components{${IAB_FIRST_PAINT_COMPONENTS.flatMap((name) => rulesFor(iab.ruleParts, name, 'styles/sheets/iab-first-paint.js')).join('\n')}}`,
		].join('\n')
	);
	const iabDialogSheet = `${LAYER_ORDER}\n@layer components{${IAB_DIALOG_COMPONENTS.flatMap((name) => rulesFor(iab.ruleParts, name, 'styles/sheets/iab-dialog.js')).join('\n')}}`;
	writeDist(
		'styles/sheets/iab-dialog.css',
		`${writeSheet('iab-dialog', iabDialogSheet)}\n`
	);
}

console.log(
	'Generated dist/styles.css, dist/styles.tw3.css, dist/styles/dialog.css, dist/styles/dialog.js, dist/styles/primitives.css, dist/styles/sheets/*.js, dist/iab/styles.css, and dist/iab/styles.tw3.css'
);
