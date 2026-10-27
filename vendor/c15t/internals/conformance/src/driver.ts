import type {
	CreatePolicySession,
	ProbePolicyContract,
} from './contract/policy-driver';

export type SupportedFramework =
	| 'browser'
	| 'react'
	| 'nextjs'
	| 'tanstack-start'
	| 'svelte'
	| 'vue'
	| 'solid';

export type MountableComponent =
	| 'consent-banner'
	| 'consent-dialog'
	| 'consent-widget'
	| 'iab-consent-banner'
	| 'iab-consent-dialog';

export interface MountPolicyOptions {
	model?: 'opt-in' | 'opt-out';
	respectGpc?: boolean;
}

export interface MountOptions {
	component: MountableComponent;
	initMode?: 'authoritative' | 'pending' | 'failing';
	gpc?: boolean;
	persistence?: boolean;
	policy?: MountPolicyOptions;
	gvl?: unknown;
	providerOptions?: unknown;
	initialState?: unknown;
	locale?: string;
}

export interface MountResult {
	root: HTMLElement;
	resolveInit?: () => Promise<void>;
	unmount: () => void | Promise<void>;
}

export interface DriverStore {
	getState: () => Record<string, unknown>;
	subscribe: (listener: () => void) => () => void;
}

export interface TestDriver {
	readonly framework: SupportedFramework;
	createPolicySession?: CreatePolicySession;
	probePolicyContract?: ProbePolicyContract;

	mount: (opts: MountOptions) => Promise<MountResult>;

	getStore: () => DriverStore;

	serverRender: (opts: MountOptions) => Promise<string>;
}

export type * from './contract/policy-driver';

export class DriverNotImplementedError extends Error {
	constructor(framework: SupportedFramework, capability: string) {
		super(
			`[${framework}] driver does not yet implement: ${capability}. Supported consent adapters must implement this capability.`
		);
		this.name = 'DriverNotImplementedError';
	}
}
