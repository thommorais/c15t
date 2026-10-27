import { kernelConfigToInitResponse } from '../transports/init-output';
import type {
	ProviderTransportContext,
	ProviderTransportFactory,
} from '../transports/mode';
import type {
	ConsentKernel,
	InitResponse,
	KernelConfig,
	KernelTransport,
} from '../types';
import type { StreamedInitOptions } from './streamed-init';
import type { ConsentProviderRuntimeOptions, RuntimePrefetch } from './types';

export type ResolveStreamedInit = (
	options: StreamedInitOptions
) => Promise<InitResponse>;

export const createStreamedMode = function createStreamedMode(
	mode: ProviderTransportFactory,
	prefetch: PromiseLike<RuntimePrefetch>,
	options: Pick<ConsentProviderRuntimeOptions, 'experiment' | 'overrides'>,
	getKernel: () => ConsentKernel | undefined,
	loadResolver: () => ResolveStreamedInit | Promise<ResolveStreamedInit>
): ProviderTransportFactory {
	const factory = (context: ProviderTransportContext): KernelTransport => {
		let resolved: KernelConfig | undefined;
		const transport = mode({
			...context,
			pendingPrefetch: prefetch,
			get prefetch() {
				return resolved ?? context.prefetch;
			},
		});
		let used = false;
		return {
			...transport,
			async init(initContext) {
				if (used) {
					return (await transport.init?.(initContext)) ?? {};
				}
				used = true;
				const kernel = getKernel() ?? null;
				const recordsGeneration = kernel?.getRecordsGeneration();
				const resolveInit = await loadResolver();
				return resolveInit({
					context: initContext,
					kernel,
					onResolved: (config) => {
						resolved = config;
					},
					overrides: options.overrides,
					prefetch,
					recordsGeneration,
					runsExperiment: options.experiment !== undefined,
					toInitResponse: kernelConfigToInitResponse,
					transport,
				});
			},
		};
	};
	return Object.assign(factory, { kind: mode.kind });
};

export const lazyStreamPrefetch = function lazyStreamPrefetch(
	mode: ProviderTransportFactory,
	prefetch: PromiseLike<RuntimePrefetch>,
	options: Pick<ConsentProviderRuntimeOptions, 'experiment' | 'overrides'>,
	getKernel: () => ConsentKernel | undefined
): ProviderTransportFactory {
	const loading = import('./streamed-init');
	return createStreamedMode(
		mode,
		prefetch,
		options,
		getKernel,
		async () => (await loading).resolveStreamedInit
	);
};

export const streamPrefetchWith = function streamPrefetchWith(
	resolveInit: ResolveStreamedInit
): typeof lazyStreamPrefetch {
	return (mode, prefetch, options, getKernel) =>
		createStreamedMode(mode, prefetch, options, getKernel, () => resolveInit);
};
