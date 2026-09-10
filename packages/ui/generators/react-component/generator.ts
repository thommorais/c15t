import { join } from 'node:path'
import { formatFiles, generateFiles, names, type Tree, updateJson, workspaceRoot } from '@nx/devkit'

interface ReactComponentGeneratorSchema {
	name: string
}

const PROJECT_ROOT = 'packages/ui'

export default async function reactComponentGenerator(tree: Tree, options: ReactComponentGeneratorSchema) {
	const { fileName, className } = names(options.name)

	const templateDir = join(workspaceRoot, PROJECT_ROOT, 'generators/react-component/files')
	generateFiles(tree, templateDir, join(PROJECT_ROOT, 'src'), { fileName, className })

	updateJson(tree, join(PROJECT_ROOT, 'package.json'), json => {
		json.exports = {
			...json.exports,
			[`./${fileName}`]: `./src/${fileName}.tsx`,
		}
		return json
	})

	await formatFiles(tree)
}
