import type {
	ConsentKernel,
	HydrationRecords,
	HydrationResult,
	InitResponse,
	KernelEvent,
} from '../types';

export interface InternalKernel extends ConsentKernel {
	hydrate: (records: HydrationRecords) => HydrationResult;
	adoptInit: (response: InitResponse, afterStart: boolean) => void;
	markLive: (at?: number) => void;
	holdSaves: (until: Promise<unknown>) => void;
	readonly events: ConsentKernel['events'] & {
		emit: (event: KernelEvent) => void;
	};
}
