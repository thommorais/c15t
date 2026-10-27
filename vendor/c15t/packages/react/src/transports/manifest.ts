import { backendURL as builtBackendURL, snapshot } from '@c15t/core/generated';
import {
	manifest as browserManifest,
	withEarlyInit,
} from '@c15t/core/transports/manifest-browser';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@c15t/core/transports/manifest-browser';
import type { ConsentManifest } from '@c15t/schema/types';

export interface BuildOutput {
	backendURL?: string;
	snapshot?: ConsentManifest;
}

export const withBuildDefaults = function withBuildDefaults(
	options: BrowserManifestOptions,
	build: BuildOutput
): BrowserManifestOptions {
	const settings: BrowserManifestOptions = { ...options };
	if (build.backendURL !== undefined && settings.backendURL === undefined) {
		settings.backendURL = build.backendURL;
	}
	if (settings.manifestURL !== undefined) {
		return settings;
	}
	if (
		build.snapshot &&
		settings.snapshot === undefined &&
		settings.source !== 'runtime'
	) {
		(settings as { snapshot?: ConsentManifest }).snapshot = build.snapshot;
	}
	return settings;
};

export const manifest = function manifest(
	options: BrowserManifestOptions = {}
): BrowserManifestModeFactory {
	return withEarlyInit(
		browserManifest(
			withBuildDefaults(options, { backendURL: builtBackendURL, snapshot })
		)
	);
};

export type {
	BrowserManifestModeFactory,
	BrowserManifestOptions as ManifestModeOptions,
} from '@c15t/core/transports/manifest-browser';
