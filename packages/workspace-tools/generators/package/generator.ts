import { fileURLToPath } from 'node:url'
import {
	formatFiles,
	generateFiles,
	installPackagesTask,
	joinPathFragments,
	names,
	readJson,
	type Tree,
	workspaceRoot,
} from '@nx/devkit'

interface PackageGeneratorSchema {
	name: string
	description?: string
	unitTestRunner?: 'vitest' | 'none'
}

const PACKAGES_DIR = 'packages'

/**
 * The package whose devDependency versions new packages inherit. utils is on
 * the workspace-wide typescript pin, unlike the packages held back on 7.x.
 */
const REFERENCE_PACKAGE = 'packages/utils/package.json'

/** Used only if the reference package is missing or has no pin for a dependency. */
const FALLBACK_VERSIONS = { typescript: '6.0.3', vitest: '^3.2.4' } as const

/**
 * Nx loads generators as ES modules here, where `__dirname` is undefined, but
 * the plugin is also resolvable from the workspace root. Prefer the module's
 * own URL so the templates are found even if this package moves.
 */
const templatesDir = (): string => {
	const url = import.meta?.url
	if (url) return joinPathFragments(fileURLToPath(new URL('.', url)), 'files')

	return joinPathFragments(workspaceRoot, 'packages/workspace-tools/generators/package/files')
}

export default async function packageGenerator(tree: Tree, options: PackageGeneratorSchema) {
	const { fileName, propertyName } = names(options.name)
	const unitTestRunner = options.unitTestRunner ?? 'vitest'
	const root = joinPathFragments(PACKAGES_DIR, fileName)

	if (tree.exists(root)) {
		throw new Error(`${root} already exists.`)
	}

	const scope = readScope(tree)

	generateFiles(tree, templatesDir(), root, {
		fileName,
		propertyName,
		scope,
		importPath: `@${scope}/${fileName}`,
		description: options.description ?? '',
		unitTestRunner,
		typescriptVersion: readVersion(tree, 'typescript'),
		vitestVersion: readVersion(tree, 'vitest'),
		// generateFiles strips this suffix from every template file name.
		template: '',
	})

	if (unitTestRunner === 'none') {
		tree.delete(joinPathFragments(root, 'vitest.config.ts'))
		tree.delete(joinPathFragments(root, 'src', `${fileName}.test.ts`))
	}

	await formatFiles(tree)

	// pnpm has to link the new workspace package before nx or tsc can resolve it.
	// installPackagesTask skips the install unless the *root* package.json
	// changed, which it does not here, so the install is forced.
	return () => {
		installPackagesTask(tree, true)
	}
}

/**
 * Derives the scope from the workspace's own packages so the generator keeps
 * working after rename-scope has run. Only `workspace:*` specifiers are
 * considered: third-party scopes like @nx are not the workspace's own.
 */
const readScope = (tree: Tree): string => {
	const { devDependencies = {}, dependencies = {} } = readJson(tree, 'package.json')

	for (const [specifier, version] of Object.entries({ ...devDependencies, ...dependencies })) {
		if (typeof version !== 'string' || !version.startsWith('workspace:')) continue

		const match = /^@([^/]+)\//.exec(specifier)
		if (match?.[1]) return match[1]
	}

	throw new Error('Could not determine the workspace scope: no workspace:* dependency in the root package.json.')
}

/** Reads a version pin from the reference package so new packages do not drift. */
const readVersion = (tree: Tree, dependency: keyof typeof FALLBACK_VERSIONS): string => {
	if (!tree.exists(REFERENCE_PACKAGE)) return FALLBACK_VERSIONS[dependency]

	const { devDependencies = {} } = readJson(tree, REFERENCE_PACKAGE)
	return devDependencies[dependency] ?? FALLBACK_VERSIONS[dependency]
}
