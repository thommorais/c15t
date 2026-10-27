import type { KernelHosting } from '../../types';

export type WindowDebugMode = 'hosted' | 'offline' | 'custom' | 'manifest';

export interface WindowDebugOptions {
	pkg: string;
	mode: WindowDebugMode;
	getHosting?: () => KernelHosting | null;
}

export interface WindowDebugHandle {
	dispose: () => void;
}

export interface C15tWindowDebug {
	readonly version: string;
	readonly pkg: string;
	readonly mode: WindowDebugMode;
	readonly hosting: KernelHosting | null;
}

export interface WindowDebugModeInput {
	readonly kind: WindowDebugMode;
}
