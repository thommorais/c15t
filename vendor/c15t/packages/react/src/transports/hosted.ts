import { hosted as coreHosted } from '@c15t/core';
import type { HostedModeFactory, HostedModeOptions } from '@c15t/core';
import { backendURL as builtBackendURL } from '@c15t/core/generated';

declare const process: { env: { NODE_ENV?: string } };

export type HostedOptions = Omit<HostedModeOptions, 'backendURL'> & {
	backendURL?: string;
};

export const hostedWithBuild = function hostedWithBuild(
	options: HostedOptions,
	buildBackendURL: string | undefined
): HostedModeFactory {
	const backendURL = options.backendURL ?? buildBackendURL;
	if (backendURL === undefined) {
		throw new Error(
			`c15t: hosted() needs \`backendURL\`.${
				process.env.NODE_ENV === 'production'
					? ''
					: ' Pass it, or add consentManifest() from c15t/build to your Vite config and set VITE_C15T_BACKEND_URL (or VITE_INTH_PROJECT_URL).'
			}`
		);
	}
	return coreHosted({ ...options, backendURL });
};

export const hosted = function hosted(
	options: HostedOptions = {}
): HostedModeFactory {
	return hostedWithBuild(options, builtBackendURL);
};
