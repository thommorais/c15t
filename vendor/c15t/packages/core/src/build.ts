import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { ConsentManifest } from '@c15t/schema/types';

import { buildPrefetchScript } from './libs/prefetch/prefetch';
import type { PrefetchOptions } from './libs/prefetch/types';
import { loadStaticManifest } from './server/static-manifest';
import { manifestNeedsLocation } from './transports/manifest-browser-location';

export type { ConsentManifest } from '@c15t/schema/types';

const resolveBuildManifestURL = (
	options: {
		backendURL?: string;
		manifestURL?: string;
	},
	label: string
): string => {
	const source = options.manifestURL ?? options.backendURL;
	let url: URL;
	try {
		url = new URL(source ?? '');
	} catch {
		throw new Error(
			`${label}: build-time manifests require an absolute upstream URL.`
		);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(
			`${label}: build-time manifests require an http(s) upstream URL.`
		);
	}
	if (options.manifestURL === undefined) {
		url.pathname = `${url.pathname.replace(/\/+$/u, '')}/manifest`;
	}
	return url.href;
};

export const loadBuildManifest = (
	options: {
		backendURL?: string;
		manifestURL?: string;
		fetch?: typeof globalThis.fetch;
	},
	label: string
): Promise<ConsentManifest> =>
	loadStaticManifest(
		{
			fetch: options.fetch,
			manifestURL: resolveBuildManifestURL(options, label),
		},
		label
	);

const BUILD_MANIFEST_TIMEOUT_MS = 10_000;

export const hasBuildManifestSource = (options: {
	backendURL?: string;
	manifestURL?: string;
}): boolean => {
	try {
		resolveBuildManifestURL(options, '');
		return true;
	} catch {
		return false;
	}
};

export type ManifestBuildErrorMode = 'runtime' | 'fail';

export type ManifestBuildCommand = 'build' | 'dev';

export const MANIFEST_BUILD_ERROR_ENV = 'C15T_ON_BUILD_ERROR';

const isBuildErrorMode = (value: unknown): value is ManifestBuildErrorMode =>
	value === 'runtime' || value === 'fail';

export const resolveManifestBuildErrorMode = (
	onBuildError: unknown,
	command: ManifestBuildCommand,
	label: string,
	env: Record<string, string | undefined> = process.env
): { explicit: boolean; mode: ManifestBuildErrorMode } => {
	const fromEnv = env[MANIFEST_BUILD_ERROR_ENV];
	if (fromEnv) {
		if (!isBuildErrorMode(fromEnv)) {
			throw new Error(
				`${label}: ${MANIFEST_BUILD_ERROR_ENV} must be 'runtime' or 'fail', received ${JSON.stringify(fromEnv)}.`
			);
		}
		return { explicit: true, mode: fromEnv };
	}
	if (onBuildError !== undefined) {
		if (!isBuildErrorMode(onBuildError)) {
			throw new Error(
				`${label}: onBuildError must be 'runtime' or 'fail', received ${JSON.stringify(onBuildError)}.`
			);
		}
		return { explicit: true, mode: onBuildError };
	}
	return { explicit: false, mode: command === 'build' ? 'fail' : 'runtime' };
};

const parseEnvFile = (source: string): Record<string, string> => {
	const values: Record<string, string> = {};
	for (const raw of source.split(/\r?\n/u)) {
		const line = raw.trim().replace(/^export\s+/u, '');
		const equals = line.indexOf('=');
		if (line.startsWith('#') || equals < 1) {
			continue;
		}
		const key = line.slice(0, equals).trim();
		let value = line.slice(equals + 1).trim();
		const [quote] = value;
		const close = quote === '"' || quote === "'" ? value.indexOf(quote, 1) : -1;
		value =
			close > 0 ? value.slice(1, close) : (value.split('#', 1)[0] ?? '').trim();
		values[key] = value;
	}
	return values;
};

export const readBuildEnv = (
	names: readonly string[],
	options: {
		env?: Record<string, unknown>;
		mode?: string;
		root?: string;
	} = {}
): string | undefined => {
	let parsed: Record<string, string>[] | undefined;
	const readFiles = (root: string): Record<string, string>[] => {
		const files = [
			...(options.mode
				? [`.env.${options.mode}.local`, `.env.${options.mode}`]
				: []),
			'.env.local',
			'.env',
		];
		return files.map((file) => {
			try {
				return parseEnvFile(readFileSync(resolve(root, file), 'utf8'));
			} catch {
				return {};
			}
		});
	};
	for (const name of names) {
		const loaded = options.env?.[name];
		if (typeof loaded === 'string' && loaded !== '') {
			return loaded;
		}
		const fromProcess = process.env[name];
		if (fromProcess) {
			return fromProcess;
		}
		if (!options.root) {
			continue;
		}
		parsed ??= readFiles(options.root);
		const files = parsed;
		const expand = (value: string, depth: number): string =>
			value.replace(
				/\\?\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/gu,
				(match: string) => {
					if (match.startsWith('\\')) {
						return match.slice(1);
					}
					const key = match.replace(/^\$\{?|\}$/gu, '');
					const found =
						process.env[key] ?? files.find((values) => key in values)?.[key];
					return found === undefined || depth > 8
						? ''
						: expand(found, depth + 1);
				}
			);
		for (const values of files) {
			if (values[name]) {
				return expand(values[name], 0) || undefined;
			}
		}
	}
	return undefined;
};

export const formatEnvNames = (names: readonly string[]): string => {
	const isInth = (name: string) => name.endsWith('_INTH_PROJECT_URL');
	const primary = names.filter((name) => !isInth(name)).join(' or ');
	const inth = names.filter(isInth).join(' or ');
	if (!primary) {
		return inth;
	}
	return inth ? `${primary} (or ${inth})` : primary;
};

export interface ManifestBuildLogger {
	info: (message: string) => void;
	warn: (message: string) => void;
}

export const labelledBuildLogger = (
	label: string,
	logger: ManifestBuildLogger = console
): ManifestBuildLogger => ({
	info: (message) => logger.info(`${label}: ${message}`),
	warn: (message) => logger.warn(`${label}: ${message}`),
});

export interface ManifestBuildPolicy {
	command: ManifestBuildCommand;
	envNames?: readonly string[];
	label: string;
	logger: ManifestBuildLogger;
	onBuildError?: unknown;
	skipReason?: string;
	failureHint?: string;
}

const describeFailure = (error: unknown, label: string): string => {
	if (error instanceof Error && error.name === 'TimeoutError') {
		return `no response within ${BUILD_MANIFEST_TIMEOUT_MS / 1000} seconds`;
	}
	let reason = error instanceof Error ? error.message : String(error);
	const prefix = `${label}: `;
	if (reason.startsWith(prefix)) {
		reason = reason.slice(prefix.length);
	}
	if (error instanceof TypeError && error.cause instanceof Error) {
		reason = `${reason}: ${error.cause.message}`;
	}
	return reason;
};

const reportMissingSource = (
	policy: ManifestBuildPolicy,
	resolved: { explicit: boolean; mode: ManifestBuildErrorMode },
	envHint: string
): void => {
	const { command, label, logger } = policy;
	const missing = `no backend URL is set, so ${command === 'build' ? 'the build' : 'dev'} cannot fetch the consent manifest.${envHint}`;
	if (resolved.mode === 'fail') {
		throw new Error(
			`${label}: ${missing} Set \`${MANIFEST_BUILD_ERROR_ENV}=runtime\` (or \`onBuildError: 'runtime'\`) to ${command === 'build' ? 'build' : 'run dev'} without a snapshot.`
		);
	}
	if (resolved.explicit) {
		logger.info(
			`skipped the consent manifest fetch because no backend URL is set.${envHint}`
		);
		return;
	}
	logger.warn(`${missing} A production build stops on this error.`);
};

export const loadManifestForBuild = async (
	source: {
		backendURL?: string;
		manifestURL?: string;
		fetch?: typeof globalThis.fetch;
	},
	policy: ManifestBuildPolicy
): Promise<ConsentManifest | undefined> => {
	const { command, label, logger } = policy;
	const { explicit, mode } = resolveManifestBuildErrorMode(
		policy.onBuildError,
		command,
		label
	);
	if (policy.skipReason) {
		logger.info(
			`skipped the consent manifest fetch because ${policy.skipReason}.`
		);
		return undefined;
	}
	const envHint = policy.envNames?.length
		? ` Pass backendURL or set ${formatEnvNames(policy.envNames)}.`
		: '';
	const configured = source.manifestURL ?? source.backendURL;
	if (!configured) {
		reportMissingSource(policy, { explicit, mode }, envHint);
		return undefined;
	}
	if (!hasBuildManifestSource(source)) {
		if (explicit && mode === 'fail') {
			try {
				resolveBuildManifestURL(source, label);
			} catch (error) {
				throw new Error(`${(error as Error).message}${envHint}`, {
					cause: error,
				});
			}
		}
		logger.info(
			`skipped the consent manifest fetch because ${JSON.stringify(configured)} is not an absolute http(s) URL, so the server fetches the policy at runtime.`
		);
		return undefined;
	}
	const fetchImpl = source.fetch ?? globalThis.fetch?.bind(globalThis);
	const url = resolveBuildManifestURL(source, label);
	const phase = command === 'build' ? 'the build' : 'dev';
	try {
		return await loadBuildManifest(
			{
				...source,
				fetch:
					fetchImpl &&
					((input, init) =>
						fetchImpl(input, {
							...init,
							signal: AbortSignal.timeout(BUILD_MANIFEST_TIMEOUT_MS),
						})),
			},
			label
		);
	} catch (error) {
		const failure = `could not fetch the consent manifest from ${url} during ${phase} (${describeFailure(error, label)}).`;
		if (mode === 'fail') {
			throw new Error(
				`${label}: ${failure} Set \`${MANIFEST_BUILD_ERROR_ENV}=runtime\` (or \`onBuildError: 'runtime'\`) to ${command === 'build' ? 'deploy' : 'run dev'} with runtime fetching.${policy.failureHint ?? ''}`,
				{ cause: error }
			);
		}
		logger.warn(
			`${failure} The server fetches it at runtime instead.${
				explicit ? '' : ' A production build stops on this error.'
			}`
		);
		return undefined;
	}
};

export interface ManifestBuildOptions {
	backendURL?: string;
	onBuildError?: ManifestBuildErrorMode;
	fetch?: typeof globalThis.fetch;
}

export interface ConsentManifestPluginOptions extends ManifestBuildOptions {
	source?: 'build' | 'runtime';
	initPrefetch?: boolean | InitPrefetchOptions;
}

export type InitPrefetchOptions = Pick<
	PrefetchOptions,
	'credentials' | 'experiment' | 'journey' | 'overrides' | 'storageKey'
>;

export interface GeneratedManifestModule {
	backendURL: string | undefined;
	snapshot: ConsentManifest | undefined;
}

export const GENERATED_MODULE_IDS = [
	'@c15t/core/generated',
	'c15t/generated',
] as const;

export const MANIFEST_CACHE_DIR = 'node_modules/.cache/c15t';

export const renderGeneratedModule = (
	module: GeneratedManifestModule,
	options: { clientStub?: boolean; serverOnly?: boolean } = {}
): string => {
	let snapshot = `export const snapshot = ${JSON.stringify(module.snapshot, null, 2)};`;
	if (options.clientStub) {
		snapshot =
			'// The snapshot stays on the server; the browser bundle never gets it.\nexport const snapshot = undefined;';
	} else if (!module.snapshot) {
		snapshot =
			'// The build has no snapshot, so the policy is read at runtime.\nexport const snapshot = undefined;';
	}
	return [
		'// Written by the c15t build integration. Do not edit.',
		...(options.serverOnly ? ["import 'server-only';"] : []),
		`export const backendURL = ${JSON.stringify(module.backendURL) ?? 'undefined'};`,
		snapshot,
		'',
	].join('\n');
};

export const renderGeneratedDeclarations = (importSource: string): string =>
	[
		`import type { ConsentManifest } from '${importSource}';`,
		'',
		'export declare const backendURL: string | undefined;',
		'export declare const snapshot: ConsentManifest | undefined;',
		'',
	].join('\n');

const writeModuleFile = async (
	outputFile: string,
	source: string
): Promise<string> => {
	let current: string | undefined;
	try {
		current = await readFile(outputFile, 'utf8');
	} catch (error) {
		if (
			!(error instanceof Error && 'code' in error && error.code === 'ENOENT')
		) {
			throw error;
		}
	}
	if (current !== source) {
		await mkdir(dirname(outputFile), { recursive: true });
		await writeFile(outputFile, source, 'utf8');
	}
	return outputFile;
};

export interface ManifestCacheFiles {
	browser: string;
	server: string;
}

export const writeManifestCacheModule = async (
	options: ManifestBuildOptions,
	defaults: {
		command: ManifestBuildCommand;
		envNames?: readonly string[];
		importSource: string;
		label: string;
		rootDir?: string;
		skipReason?: string;
	},
	logger: ManifestBuildLogger = labelledBuildLogger(defaults.label)
): Promise<ManifestCacheFiles> => {
	const snapshot = await loadManifestForBuild(
		{ backendURL: options.backendURL, fetch: options.fetch },
		{
			command: defaults.command,
			envNames: defaults.envNames,
			label: defaults.label,
			logger,
			onBuildError: options.onBuildError,
			skipReason: defaults.skipReason,
		}
	);
	const directory = resolve(
		defaults.rootDir ?? process.cwd(),
		MANIFEST_CACHE_DIR
	);
	const module = { backendURL: options.backendURL, snapshot };
	const [server, browser] = await Promise.all([
		writeModuleFile(
			join(directory, 'manifest.js'),
			renderGeneratedModule(module)
		),
		writeModuleFile(
			join(directory, 'manifest.browser.js'),
			renderGeneratedModule(module, { clientStub: true, serverOnly: true })
		),
		writeModuleFile(
			join(directory, 'manifest.d.ts'),
			renderGeneratedDeclarations(defaults.importSource)
		),
	]);
	return { browser, server };
};

export interface ManifestPluginConfig {
	command?: 'build' | 'serve';
	env?: Record<string, unknown>;
	envDir?: string | false;
	logger?: ManifestBuildLogger;
	mode?: string;
	plugins?: readonly { name: string }[];
	root: string;
}

export interface ManifestPluginContext {
	environment?: { config?: { consumer?: 'client' | 'server' } };
}

export interface ConsentManifestPlugin {
	apply: (config: unknown, environment: { isPreview?: boolean }) => boolean;
	buildStart: () => void;
	config: () => {
		optimizeDeps: { exclude: string[] };
		ssr: { noExternal: string[] };
	};
	configResolved: (config: ManifestPluginConfig) => void;
	enforce: 'pre';
	load: (
		this: ManifestPluginContext | undefined,
		id: string,
		options?: { ssr?: boolean }
	) => Promise<string | undefined>;
	name: string;
	renderChunk: (code: string) => Promise<{ code: string; map: null } | null>;
	resolveId: (id: string) => string | undefined;
	transformIndexHtml: (html: string) => string | undefined;
}

const LOCATION_ADVICE =
	"the consent policy depends on the visitor's location, which the browser doesn't know. Unless you pass `inputs` or `geoURL` to `manifest()`, every first visit still calls the backend's /init, so the bundled policy adds bytes without saving a request. Consider `mode: hosted()` instead.";

const PREFETCH_SCRIPT_ID = 'c15t-initial-data-prefetch';

const PREFETCH_ANCHORS = [
	/<meta\s[^>]*charset[^>]*>/iu,
	/<head(?:\s[^>]*)?>/iu,
	/<html(?:\s[^>]*)?>/iu,
	/<!doctype[^>]*>/iu,
] as const;

const VIRTUAL_GENERATED_ID = '\0@c15t/core/generated';

const PLACEHOLDERS = {
	backendURL: '__c15t_build_backend_url__',
	snapshot: '__c15t_build_snapshot__',
} as const;

const placeholderExpression = (token: string): string =>
	`/* @__PURE__ */ Object(${JSON.stringify(token)})`;

const placeholderPattern = (token: string): RegExp =>
	new RegExp(
		`(?:/\\*\\s*[#@]__PURE__\\s*\\*/\\s*)?Object\\(\\s*(["'\`])${token}\\1\\s*\\)`,
		'gu'
	);

const GENERATED_IMPORTERS = [
	'c15t',
	'@c15t/browser',
	'@c15t/core',
	'@c15t/react',
	'@c15t/svelte',
	'@c15t/tanstack-start',
	'@c15t/vue',
];

export const createConsentManifestPlugin = (
	options: ConsentManifestPluginOptions,
	defaults: {
		envNames: readonly string[];
		label: string;
		serverRendered?: boolean | ((config: ManifestPluginConfig) => boolean);
		adviseHostedForLocation?: boolean;
	}
): ConsentManifestPlugin => {
	let resolved: ManifestPluginConfig | undefined;
	let backendURL: string | undefined;
	let serverRendered = false;
	let generation: Promise<ConsentManifest | undefined> | undefined;
	let missingURLReported = false;
	let bundlesSnapshot = false;
	let prefetchSkipReported = false;
	const runtimeOnly = options.source === 'runtime';
	const command = (): ManifestBuildCommand =>
		resolved?.command === 'serve' ? 'dev' : 'build';
	const logger = (): ManifestBuildLogger =>
		labelledBuildLogger(defaults.label, resolved?.logger);
	const policy = (): ManifestBuildPolicy => ({
		command: command(),
		envNames: defaults.envNames,
		failureHint:
			" If the app passes manifest({ manifestURL }) or manifest({ source: 'runtime' }), pass `source: 'runtime'` to this plugin so the build skips this download.",
		label: defaults.label,
		logger: logger(),
		onBuildError: options.onBuildError,
	});
	const fetchSnapshot = async (): Promise<ConsentManifest | undefined> => {
		try {
			const snapshot = await loadManifestForBuild(
				{ backendURL, fetch: options.fetch },
				policy()
			);
			if (
				defaults.adviseHostedForLocation &&
				!serverRendered &&
				command() === 'build' &&
				snapshot &&
				manifestNeedsLocation(snapshot)
			) {
				logger().warn(LOCATION_ADVICE);
			}
			return snapshot;
		} catch (error) {
			generation = undefined;
			throw error;
		}
	};
	const loadSnapshot = (): Promise<ConsentManifest | undefined> => {
		generation ??= fetchSnapshot();
		return generation;
	};
	const reportMissingBackendURL = (): void => {
		if (missingURLReported) {
			return;
		}
		missingURLReported = true;
		logger().warn(
			`no backend URL is set. \`hosted()\` and \`manifest()\` without their own \`backendURL\` throw when the app starts. Pass backendURL to the plugin or set ${formatEnvNames(defaults.envNames)}.`
		);
	};
	const reportPrefetchSkipped = (reason: string): void => {
		if (prefetchSkipReported || options.initPrefetch === undefined) {
			return;
		}
		prefetchSkipReported = true;
		logger().warn(
			`initPrefetch: ${reason}, so index.html gets no \`/init\` script. It speeds up \`hosted()\` only.`
		);
	};
	const addPrefetchScript = (html: string): string | undefined => {
		const { initPrefetch = true } = options;
		if (!initPrefetch || serverRendered) {
			return undefined;
		}
		if (!backendURL) {
			if (options.initPrefetch !== undefined) {
				reportMissingBackendURL();
			}
			return undefined;
		}
		if (runtimeOnly) {
			reportPrefetchSkipped(
				"`source: 'runtime'` means the app uses `manifest()`"
			);
			return undefined;
		}
		if (bundlesSnapshot) {
			reportPrefetchSkipped(
				'the bundle reads the snapshot, as `manifest()` does'
			);
			return undefined;
		}
		const prefetchOptions: PrefetchOptions =
			initPrefetch === true ? { backendURL } : { ...initPrefetch, backendURL };
		const script = `<script id="${PREFETCH_SCRIPT_ID}">${buildPrefetchScript(
			prefetchOptions
		)}</script>`;
		for (const anchor of PREFETCH_ANCHORS) {
			const match = anchor.exec(html);
			if (match) {
				const end = match.index + match[0].length;
				const lineStart = html.lastIndexOf('\n', match.index) + 1;
				const indent = /^[\t ]*/u.exec(html.slice(lineStart))?.[0] ?? '';
				return `${html.slice(0, end)}\n${indent}${script}${html.slice(end)}`;
			}
		}
		return `${script}\n${html}`;
	};
	return {
		apply: (_config: unknown, environment: { isPreview?: boolean }) =>
			!environment.isPreview,
		buildStart: () => {
			bundlesSnapshot = false;
		},
		config: () => ({
			optimizeDeps: { exclude: [...GENERATED_MODULE_IDS] },
			ssr: { noExternal: [...GENERATED_IMPORTERS] },
		}),
		configResolved: (config: ManifestPluginConfig) => {
			resolved = config;
			resolveManifestBuildErrorMode(
				options.onBuildError,
				command(),
				defaults.label
			);
			if (
				options.source !== undefined &&
				options.source !== 'build' &&
				!runtimeOnly
			) {
				throw new Error(
					`${defaults.label}: source must be 'build' or 'runtime', received ${JSON.stringify(options.source)}.`
				);
			}
			const { serverRendered: rendered = false } = defaults;
			serverRendered =
				typeof rendered === 'function' ? rendered(config) : rendered;
			if (serverRendered && options.initPrefetch) {
				logger().warn(
					'initPrefetch has no effect in a server-rendered app, which resolves consent on the server.'
				);
			}
			const envRoot =
				typeof config.envDir === 'string' ? config.envDir : config.root;
			backendURL =
				options.backendURL ??
				readBuildEnv(defaults.envNames, {
					env: config.env,
					mode: config.mode,
					root: envRoot,
				});
			const exposed = defaults.envNames.find((name) =>
				name.startsWith('VITE_')
			);
			if (backendURL && exposed && config.env && !config.env[exposed]) {
				config.env[exposed] = backendURL;
			}
		},
		enforce: 'pre' as const,
		async load(
			this: ManifestPluginContext | undefined,
			id: string,
			loadOptions?: { ssr?: boolean }
		): Promise<string | undefined> {
			if (id !== VIRTUAL_GENERATED_ID) {
				return undefined;
			}
			if (!resolved) {
				throw new Error(
					`${defaults.label}: Vite loaded ${GENERATED_MODULE_IDS[0]} before the plugin read its configuration.`
				);
			}
			const consumer =
				this?.environment?.config?.consumer ??
				(loadOptions?.ssr ? 'server' : 'client');
			const clientStub = serverRendered && consumer === 'client';
			if (command() === 'dev') {
				return renderGeneratedModule(
					{
						backendURL,
						snapshot:
							clientStub || runtimeOnly ? undefined : await loadSnapshot(),
					},
					{ clientStub }
				);
			}
			let snapshotLine = `export const snapshot = ${placeholderExpression(PLACEHOLDERS.snapshot)};`;
			if (clientStub) {
				snapshotLine =
					'// The snapshot stays on the server; the browser bundle never gets it.\nexport const snapshot = undefined;';
			} else if (runtimeOnly) {
				snapshotLine =
					"// source: 'runtime': the app reads the manifest at runtime.\nexport const snapshot = undefined;";
			}
			const lines = [
				'// Written by the c15t build integration. Do not edit.',
				'// The build fills in what the bundle still reads after tree-shaking.',
				`export const backendURL = ${
					backendURL === undefined
						? placeholderExpression(PLACEHOLDERS.backendURL)
						: JSON.stringify(backendURL)
				};`,
				snapshotLine,
				'',
			];
			return lines.join('\n');
		},
		name: 'c15t:consent-manifest',
		async renderChunk(code: string) {
			const readsSnapshot = code.includes(PLACEHOLDERS.snapshot);
			const readsBackendURL = code.includes(PLACEHOLDERS.backendURL);
			if (!(readsSnapshot || readsBackendURL)) {
				return null;
			}
			let rendered = code;
			if (readsSnapshot) {
				bundlesSnapshot = true;
				const snapshot = await loadSnapshot();
				rendered = rendered.replace(
					placeholderPattern(PLACEHOLDERS.snapshot),
					snapshot ? `(${JSON.stringify(snapshot)})` : 'void 0'
				);
			}
			if (readsBackendURL) {
				if (!readsSnapshot) {
					reportMissingBackendURL();
				}
				rendered = rendered.replace(
					placeholderPattern(PLACEHOLDERS.backendURL),
					'void 0'
				);
			}
			if (
				Object.values(PLACEHOLDERS).some((token) => rendered.includes(token))
			) {
				throw new Error(
					`${defaults.label}: the bundler rewrote the ${GENERATED_MODULE_IDS[0]} stand-ins, so the build cannot fill them in.`
				);
			}
			return { code: rendered, map: null };
		},
		resolveId: (id: string): string | undefined =>
			(GENERATED_MODULE_IDS as readonly string[]).includes(id)
				? VIRTUAL_GENERATED_ID
				: undefined,
		transformIndexHtml: addPrefetchScript,
	};
};

export const consentManifest = (
	options: ConsentManifestPluginOptions = {}
): ConsentManifestPlugin =>
	createConsentManifestPlugin(options, {
		adviseHostedForLocation: true,
		envNames: ['VITE_C15T_BACKEND_URL', 'VITE_INTH_PROJECT_URL'],
		label: '@c15t/core/build',
	});
