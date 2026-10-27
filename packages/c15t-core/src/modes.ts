import type { ConsentManifest, PolicyRule } from '@c15t/schema/types';

export interface ManifestModeInputs {
	country?: string;
	region?: string;
}

export interface ManifestModeBaseOptions {
	manifestURL?: string;
	geoURL?: string;
	inputs?: ManifestModeInputs;
}

export type ManifestModeSourceOptions =
	| {
			source?: 'build' | 'runtime';
			snapshot?: never;
	  }
	| {
			snapshot: ConsentManifest;
			source?: never;
	  };

export type ManifestModeOptions = ManifestModeBaseOptions &
	ManifestModeSourceOptions & {
		resolve?: 'server' | 'browser';
	};

export type ManifestMode = { type: 'manifest' } & ManifestModeOptions;

export interface HostedModeOptions {
	backendURL?: string;
	headers?: Record<string, string>;
}

export interface HostedMode extends HostedModeOptions {
	type: 'hosted';
}

export interface OfflineModeOptions {
	policyRules?: PolicyRule[];
	acknowledgeNoRecords?: boolean;
}

export interface OfflineMode extends OfflineModeOptions {
	type: 'offline';
}

export type ConsentMode = ManifestMode | HostedMode | OfflineMode;

export type ConsentModeType = ConsentMode['type'];

export const manifest = function manifest(
	options: ManifestModeOptions = {}
): ManifestMode {
	return { ...options, type: 'manifest' };
};

export const hosted = function hosted(
	options: HostedModeOptions = {}
): HostedMode {
	return { ...options, type: 'hosted' };
};

export const local = function local(
	options: OfflineModeOptions = {}
): OfflineMode {
	return { ...options, type: 'offline' };
};

export const offline = local;
