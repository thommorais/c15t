import type { ConsentKernel } from '../../types';

export interface IframeBlockerOptions {
	kernel: ConsentKernel;
	disableAutomaticBlocking?: boolean;
}

export interface IframeBlockerHandle {
	dispose: () => void;
	processAllIframes: () => void;
}
