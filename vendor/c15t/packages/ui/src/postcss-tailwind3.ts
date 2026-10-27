const C15T_INSTALLED_STYLESHEET_PATH =
	/(?:^|[\\/])node_modules[\\/](?:@c15t[\\/][^\\/]+|c15t)[\\/]dist[\\/](?:[^\\/]+[\\/])*[^\\/]+\.css(?:\?[^\\/]*)?$/u;

const WORKSPACE_STYLESHEET_PATH =
	/^(?<directory>.*[\\/]packages[\\/][^\\/]+)[\\/]dist[\\/](?:[^\\/]+[\\/])*[^\\/]+\.css(?:\?[^\\/]*)?$/u;

interface FileSystem {
	readFileSync: (path: string, encoding: 'utf8') => string;
}

const workspacePackageCache = new Map<string, boolean>();

const isC15tWorkspacePackage = function isC15tWorkspacePackage(
	directory: string
): boolean {
	const cached = workspacePackageCache.get(directory);
	if (cached !== undefined) {
		return cached;
	}
	const fs = (
		globalThis as {
			process?: { getBuiltinModule?: (id: string) => unknown };
		}
	).process?.getBuiltinModule?.('node:fs') as FileSystem | undefined;
	let matches = false;
	if (fs) {
		try {
			const manifest: unknown = JSON.parse(
				fs.readFileSync(`${directory}/package.json`, 'utf8')
			);
			const name =
				typeof manifest === 'object' && manifest !== null && 'name' in manifest
					? manifest.name
					: undefined;
			matches =
				typeof name === 'string' &&
				(name === 'c15t' || name.startsWith('@c15t/'));
		} catch {
		}
	}
	workspacePackageCache.set(directory, matches);
	return matches;
};

interface PostcssSource {
	input?: {
		file?: string;
	};
}

interface PostcssAtRule {
	nodes?: unknown[];
	source?: PostcssSource;
	remove: () => void;
	replaceWith: (...nodes: unknown[]) => void;
}

interface PostcssRoot {
	source?: PostcssSource;
	walkAtRules: (name: string, callback: (rule: PostcssAtRule) => void) => void;
}

export interface PostcssTailwind3Plugin {
	postcssPlugin: string;
	Once: (root: PostcssRoot) => void;
}

export interface PostcssTailwind3PluginCreator {
	(): PostcssTailwind3Plugin;
	postcss: true;
}

export const isC15tUiStylesheetPath = function isC15tUiStylesheetPath(
	filePath: string
): boolean {
	if (C15T_INSTALLED_STYLESHEET_PATH.test(filePath)) {
		return true;
	}
	const directory = WORKSPACE_STYLESHEET_PATH.exec(filePath)?.groups?.directory;
	return directory !== undefined && isC15tWorkspacePackage(directory);
};

const c15tTailwind3: PostcssTailwind3PluginCreator = Object.assign(
	(): PostcssTailwind3Plugin => ({
		Once(root: PostcssRoot) {
			const rootFile = root.source?.input?.file ?? '';

			root.walkAtRules('layer', (rule: PostcssAtRule) => {
				const file = rule.source?.input?.file ?? rootFile;
				if (!isC15tUiStylesheetPath(file)) {
					return;
				}

				if (rule.nodes && rule.nodes.length > 0) {
					rule.replaceWith(...rule.nodes);
					return;
				}

				rule.remove();
			});
		},

		postcssPlugin: 'c15t-tailwind3',
	}),
	{ postcss: true as const }
);

export { c15tTailwind3 };
export default c15tTailwind3;

export const postcss: PostcssTailwind3Plugin = c15tTailwind3();
