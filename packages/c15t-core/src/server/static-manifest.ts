import type { ConsentManifest } from '@c15t/schema/types';

import { failedResponseError } from '../libs/failed-response';
import { c15tProtocolHeaders } from '../transports/version-header';

const RESERVED_EXPORT_NAMES = new Set([
	'arguments',
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'eval',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'implements',
	'import',
	'in',
	'instanceof',
	'interface',
	'let',
	'new',
	'null',
	'package',
	'private',
	'protected',
	'public',
	'return',
	'static',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
	'yield',
]);

export interface StaticManifestModuleOptions {
	manifestURL: string;
	fetch?: typeof globalThis.fetch;
	exportName?: string;
	importSource?: string;
}

export const loadStaticManifest = async (
	options: Pick<StaticManifestModuleOptions, 'manifestURL' | 'fetch'>,
	label: string
): Promise<ConsentManifest> => {
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!fetchImpl) {
		throw new Error(`${label}: no fetch available.`);
	}
	const response = await fetchImpl(options.manifestURL, {
		headers: { accept: 'application/json', ...c15tProtocolHeaders },
		method: 'GET',
	});
	if (!response.ok) {
		throw await failedResponseError(`${label}: /manifest`, response);
	}
	try {
		const { parseConsentManifest } = await import('@c15t/schema');
		return parseConsentManifest(await response.json());
	} catch (cause) {
		throw new Error(
			`${label}: /manifest returned an invalid consent manifest.`,
			{
				cause,
			}
		);
	}
};

export const resolveStaticManifestModuleNames = (
	options: Pick<StaticManifestModuleOptions, 'exportName' | 'importSource'>,
	defaults: { importSource: string; label: string }
): { exportName: string; importSource: string } => {
	const exportName = options.exportName ?? 'consentManifest';
	if (
		!/^[A-Za-z_$][\w$]*$/u.test(exportName) ||
		RESERVED_EXPORT_NAMES.has(exportName)
	) {
		throw new Error(
			`${defaults.label}: exportName must be a valid identifier, received ${JSON.stringify(exportName)}.`
		);
	}
	const importSource = options.importSource ?? defaults.importSource;
	if (!/^[A-Za-z0-9@_./+~-]+$/u.test(importSource)) {
		throw new Error(
			`${defaults.label}: importSource must be a module specifier, received ${JSON.stringify(importSource)}.`
		);
	}
	return { exportName, importSource };
};

export const renderStaticManifestModule = (
	names: { exportName: string; importSource: string },
	manifest: ConsentManifest | undefined
): string =>
	[
		`import type { ConsentManifest } from '${names.importSource}';`,
		'',
		...(manifest
			? [
					`export const ${names.exportName} = ${JSON.stringify(manifest, null, 2)} as const satisfies ConsentManifest;`,
				]
			: [
					'// The build did not fetch the manifest, so the server fetches it at runtime.',
					`export const ${names.exportName}: ConsentManifest | undefined = undefined;`,
				]),
		'',
	].join('\n');

export const createStaticManifestModule = async (
	options: StaticManifestModuleOptions,
	defaults: { importSource: string; label: string }
): Promise<string> => {
	const names = resolveStaticManifestModuleNames(options, defaults);
	const manifest = await loadStaticManifest(options, defaults.label);
	return renderStaticManifestModule(names, manifest);
};
