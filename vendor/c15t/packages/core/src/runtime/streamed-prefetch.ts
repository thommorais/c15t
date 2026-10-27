import type { ProviderTransportFactory } from '../transports/mode';
import type { ConsentKernel } from '../types';
import { createStreamedMode } from './stream-mode';
import { resolveStreamedInit } from './streamed-init';
import type { ConsentProviderRuntimeOptions, RuntimePrefetch } from './types';

export const streamPrefetch = function streamPrefetch(
	mode: ProviderTransportFactory,
	prefetch: PromiseLike<RuntimePrefetch>,
	options: Pick<ConsentProviderRuntimeOptions, 'experiment' | 'overrides'>,
	getKernel: () => ConsentKernel | undefined
): ProviderTransportFactory {
	return createStreamedMode(
		mode,
		prefetch,
		options,
		getKernel,
		() => resolveStreamedInit
	);
};
