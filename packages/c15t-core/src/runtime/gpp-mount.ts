import type { ConsentKernel } from '../types';
import type {
	ConsentRuntimeGPPHandle,
	GPPModuleLoader,
	RuntimeGPPOptions,
} from './types';

export interface RuntimeGPPMountOptions {
	gpp: RuntimeGPPOptions | true;
	kernel: ConsentKernel;
	loadGPP: GPPModuleLoader;
	onError: (error: unknown) => void;
}

export const mountRuntimeGPP = function mountRuntimeGPP({
	gpp,
	kernel,
	loadGPP,
	onError,
}: RuntimeGPPMountOptions): () => void {
	let stopped = false;
	let handle: ConsentRuntimeGPPHandle | null = null;
	const mount = async function mount(): Promise<void> {
		try {
			const { createGPP } = await loadGPP();
			if (!stopped) {
				handle = createGPP(gpp === true ? { kernel } : { ...gpp, kernel });
			}
		} catch (error) {
			onError(error);
		}
	};
	void mount();
	return function unmountGPP() {
		stopped = true;
		handle?.dispose();
		handle = null;
	};
};
