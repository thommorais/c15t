import type { InternalKernel } from '../kernel/internals';
import { isProductionBuild } from '../libs/is-production';
import type { kernelConfigToInitResponse } from '../transports/init-output';
import type {
	ConsentKernel,
	InitContext,
	InitResponse,
	KernelConfig,
	KernelOverrides,
	KernelTransport,
} from '../types';
import type { RuntimePrefetch } from './types';

const hasKeys = function hasKeys(value: KernelOverrides): boolean {
	return Object.keys(value).length > 0;
};

const warn = function warn(...message: unknown[]): void {
	if (!isProductionBuild()) {
		console.warn(...message);
	}
};

export interface StreamedInitOptions {
	context: InitContext;
	kernel: ConsentKernel | null;
	onResolved: (config: KernelConfig) => void;
	overrides: KernelOverrides | undefined;
	prefetch: PromiseLike<RuntimePrefetch>;
	recordsGeneration: number | undefined;
	runsExperiment: boolean;
	transport: KernelTransport;
	toInitResponse: typeof kernelConfigToInitResponse;
}

export const resolveStreamedInit = async function resolveStreamedInit(
	options: StreamedInitOptions
): Promise<InitResponse> {
	const { context, kernel, overrides, transport } = options;
	let config: RuntimePrefetch;
	try {
		config = (await options.prefetch) ?? {};
	} catch (error) {
		warn('c15t: prefetch rejected; using transport init.', error);
		return transport.init?.(context) ?? {};
	}
	if (config.experiment && !options.runsExperiment) {
		warn(
			'c15t: the streamed consent state carries an experiment, but the runtime started before it arrived and runs none. Await the server result, or also pass `experiment` to the options.'
		);
	}
	options.onResolved(config);

	const response = options.toInitResponse(config);
	if (response) {
		const resolvedOverrides = {
			...(response.resolvedOverrides ?? {}),
			...(overrides ?? {}),
		};
		if (hasKeys(resolvedOverrides)) {
			response.resolvedOverrides = resolvedOverrides;
		}
		return response;
	}

	const baseline = { ...(config.initialOverrides ?? {}), ...(overrides ?? {}) };
	if (kernel) {
		if (hasKeys(baseline)) {
			kernel.set.overrides(baseline);
		}
		if (
			config.initialRecords &&
			kernel.getRecordsGeneration() === options.recordsGeneration
		) {
			(kernel as InternalKernel).hydrate(config.initialRecords);
		}
	}
	return (
		transport.init?.({
			...context,
			overrides: { ...context.overrides, ...baseline },
		}) ?? {}
	);
};
