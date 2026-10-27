import type {
	HostedModeFactory,
	HostedModeOptions,
	ProviderTransportFactory,
} from './mode';

export const hostedFactories = new WeakSet<ProviderTransportFactory>();

export const readHostedMode = function readHostedMode(
	mode: ProviderTransportFactory
): HostedModeOptions | undefined {
	if (!hostedFactories.has(mode)) {
		return undefined;
	}
	const { kind: _kind, type: _type, ...options } = mode as HostedModeFactory;
	return options;
};
