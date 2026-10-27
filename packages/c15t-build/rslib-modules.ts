import type { Minify, RsbuildPlugin } from '@rsbuild/core';

export const compactModuleMinify: Minify = {
	css: false,
	js: true,
	jsOptions: {
		minimizerOptions: {
			compress: {
				dead_code: true,
				defaults: false,
				directives: false,
				keep_classnames: true,
				keep_fnames: true,
				toplevel: true,
				unused: true,
			},
			format: {
				comments: 'some',
				preserve_annotations: true,
			},
			mangle: false,
			minify: true,
		},
	},
};

export const publicEntryAliases = function publicEntryAliases(
	aliases: Readonly<Record<string, string>>
): RsbuildPlugin {
	return {
		name: 'public-entry-aliases',
		setup(api) {
			api.processAssets({ stage: 'report' }, ({ compilation, sources }) => {
				if (compilation.errors.length > 0) {
					return;
				}
				for (const [filename, target] of Object.entries(aliases)) {
					if (!compilation.getAsset(target.replace(/^\.\//u, ''))) {
						throw new Error(`Missing public entry target: ${target}`);
					}
					compilation.emitAsset(
						filename,
						new sources.RawSource(`export * from '${target}';\n`)
					);
				}
			});
		},
	};
};
