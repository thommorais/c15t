/// <reference types="node" />
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { describe, expect, test } from 'vitest';

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MARKERS = {
	englishCopy: 'Customize your privacy settings here.',
	germanCopy: 'Anbieter ({count})',
	offlinePolicy: 'quebec_opt_in',
	resolver: 'Unsupported pack field',
} as const;

type Marker = keyof typeof MARKERS;

interface StaticBundle {
	text: string;
	lazy: string[];
}

const bundleStatic = async function bundleStatic(
	entry: { contents: string } | { path: string }
): Promise<StaticBundle> {
	const lazy = new Set<string>();
	const lazyExternal: Plugin = {
		name: 'lazy-external',
		setup(pluginBuild) {
			// oxlint-disable-next-line require-unicode-regexp
			pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
				if (args.kind !== 'dynamic-import') {
					return undefined;
				}
				const resolved = await pluginBuild.resolve(args.path, {
					kind: 'import-statement',
					resolveDir: args.resolveDir,
				});
				lazy.add(resolved.path);
				return { external: true, path: args.path };
			});
		},
	};
	const result = await build({
		bundle: true,
		format: 'esm',
		logLevel: 'silent',
		platform: 'browser',
		plugins: [lazyExternal],
		write: false,
		...('contents' in entry
			? {
					stdin: {
						contents: entry.contents,
						loader: 'ts' as const,
						resolveDir: SOURCE_DIR,
					},
				}
			: { entryPoints: [entry.path] }),
	});
	return { lazy: [...lazy], text: result.outputFiles[0]?.text ?? '' };
};

const bundleWithLazy = async function bundleWithLazy(
	contents: string
): Promise<{ firstLoad: string; lazy: string }> {
	const first = await bundleStatic({ contents });
	const seen = new Set<string>();
	const pending = [...first.lazy];
	const lazyTexts: string[] = [];
	while (pending.length > 0) {
		const path = pending.pop() as string;
		if (seen.has(path)) {
			continue;
		}
		seen.add(path);
		// oxlint-disable-next-line no-await-in-loop
		const next = await bundleStatic({ path });
		lazyTexts.push(next.text);
		pending.push(...next.lazy);
	}
	return { firstLoad: first.text, lazy: lazyTexts.join('\n') };
};

const markersIn = (text: string): Marker[] =>
	(Object.keys(MARKERS) as Marker[])
		.filter((marker) => text.includes(MARKERS[marker]))
		.sort();

const ALL_MARKERS = (Object.keys(MARKERS) as Marker[]).sort();

const clientModeEntry = (mode: string): string => `
import { hosted, manifest, offline } from './modes';
import { clientMode } from './runtime/client-mode';

export const mode = clientMode(${mode}, {
	backendURL: 'https://your-project.inth.app',
	routePrefix: '/api/c15t',
});
`;

describe('clientMode() first-load JavaScript', () => {
	test.each([
		['manifest()', 'manifest()'],
		["manifest({ resolve: 'browser' })", "manifest({ resolve: 'browser' })"],
		['hosted()', "hosted({ backendURL: 'https://other.example' })"],
		['offline()', 'offline()'],
	])(
		'%s ships no resolver, policy pack or copy',
		async (_name, mode) => {
			const { firstLoad, lazy } = await bundleWithLazy(clientModeEntry(mode));

			expect(markersIn(firstLoad)).toEqual([]);
			expect(markersIn(lazy)).toEqual(ALL_MARKERS);
		},
		60_000
	);
});

describe('manifest-browser first-load JavaScript', () => {
	test('loads the resolver, copy and IAB code on demand', async () => {
		const { firstLoad, lazy } = await bundleWithLazy(`
import { manifest } from './transports/manifest-browser';

export const mode = manifest({ backendURL: '' });
`);

		expect(markersIn(firstLoad)).toEqual([]);
		expect(markersIn(lazy)).toEqual(
			expect.arrayContaining(['englishCopy', 'germanCopy', 'resolver'])
		);
	}, 60_000);
});
