import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { LAYER_ORDER } from './stylesheet-parts';

const PACKAGE_DIR = join(import.meta.dirname, '..');
const SRC_COMPONENTS_DIR = join(PACKAGE_DIR, 'src', 'styles', 'components');
const DIST_COMPONENTS_DIR = join(PACKAGE_DIR, 'dist', 'styles', 'components');
const TYPES_COMPONENTS_DIR = join(PACKAGE_DIR, 'types', 'styles', 'components');

const discoverModuleNames = function discoverModuleNames(): string[] {
	return readdirSync(SRC_COMPONENTS_DIR)
		.filter((file) => file.endsWith('.module.css'))
		.map((file) => file.replace('.module.css', ''))
		.sort();
};

const readExisting = function readExisting(pathCandidates: string[]): {
	path: string;
	content: string;
} {
	for (const path of pathCandidates) {
		if (existsSync(path)) {
			return { content: readFileSync(path, 'utf8'), path };
		}
	}

	throw new Error(
		`generate-style-artifacts: missing expected file; tried ${pathCandidates.join(
			', '
		)}`
	);
};

const inlineRelativeCssImports = function inlineRelativeCssImports(
	css: string,
	fromPath: string
): string {
	return css.replace(
		/@import\s+(?:url\()?["'](?<capture1>[^"']+\.css)["']\)?\s*;/gu,
		(match, specifier: string) => {
			if (!specifier.startsWith('.')) {
				return match;
			}

			const importedPath = join(dirname(fromPath), specifier);
			const importedCss = readFileSync(importedPath, 'utf8').trim();
			return `${importedCss}\n`;
		}
	);
};

const toLayeredComponentCss = function toLayeredComponentCss(
	css: string
): string {
	const body = css.replace(LAYER_ORDER, '').trim();
	const layered = /@layer\s+components\s*\{/u.test(body)
		? body
		: `@layer components{${body}}`;
	return `${LAYER_ORDER}\n${layered}\n`;
};

const normalizeStyleModule = function normalizeStyleModule(
	source: string,
	name: string
): string {
	return source
		.replace(new RegExp(`\\./${name}_module\\.css`, 'gu'), `./${name}.css`)
		.replace(new RegExp(`\\./${name}\\.module\\.css`, 'gu'), `./${name}.css`);
};

const stripCssImport = function stripCssImport(
	source: string,
	name: string,
	fromRslibOutput: boolean
): string {
	const cssImport = new RegExp(
		`import\\s*["']\\./${name}\\.css["']\\s*;?`,
		'u'
	);
	if (fromRslibOutput && !cssImport.test(source)) {
		throw new Error(
			`generate-style-artifacts: ${name}.module.js does not import its stylesheet; the rslib output shape changed`
		);
	}
	const stripped = source.replace(cssImport, '');
	if (/\.css["']/u.test(stripped)) {
		throw new Error(
			`generate-style-artifacts: ${name}.js still references a stylesheet after stripping ./${name}.css`
		);
	}
	return stripped;
};

const normalizeDeclaration = function normalizeDeclaration(
	source: string
): string {
	return source.replace(
		/export\s*=\s*styles;\s*$/mu,
		'export default styles;\n'
	);
};

const moduleNames = discoverModuleNames();

if (moduleNames.length === 0) {
	throw new Error('generate-style-artifacts: no component CSS Modules found');
}

for (const name of moduleNames) {
	const css = readExisting([
		join(DIST_COMPONENTS_DIR, `${name}_module.css`),
		join(DIST_COMPONENTS_DIR, `${name}.module.css`),
		join(DIST_COMPONENTS_DIR, `${name}.css`),
	]);
	writeFileSync(
		join(DIST_COMPONENTS_DIR, `${name}.css`),
		toLayeredComponentCss(inlineRelativeCssImports(css.content, css.path))
	);

	const js = readExisting([
		join(DIST_COMPONENTS_DIR, `${name}.module.js`),
		join(DIST_COMPONENTS_DIR, `${name}.js`),
	]);
	const classMap = stripCssImport(
		normalizeStyleModule(js.content, name),
		name,
		js.path.endsWith('.module.js')
	);
	writeFileSync(join(DIST_COMPONENTS_DIR, `${name}.js`), classMap);
	writeFileSync(join(DIST_COMPONENTS_DIR, `${name}.node.js`), classMap);

	const declaration = readExisting([
		join(TYPES_COMPONENTS_DIR, `${name}.module.css.d.ts`),
	]);
	writeFileSync(
		join(DIST_COMPONENTS_DIR, `${name}.d.ts`),
		normalizeDeclaration(declaration.content)
	);

	for (const stalePath of [
		join(DIST_COMPONENTS_DIR, `${name}_module.css`),
		join(DIST_COMPONENTS_DIR, `${name}.module.css`),
		join(DIST_COMPONENTS_DIR, `${name}.module.js`),
		join(DIST_COMPONENTS_DIR, `${name}.module.cjs`),
		join(DIST_COMPONENTS_DIR, `${name}.cjs`),
	]) {
		if (existsSync(stalePath)) {
			rmSync(stalePath);
		}
	}
}

console.log(
	`Generated ${moduleNames.length} component style artifact sets in dist/styles/components`
);
