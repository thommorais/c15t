import type { InitOutput } from '@c15t/schema/types';

import type { GlobalVendorList, InitContext, KernelJourney } from '../types';

export interface SSRInitRequestContext {
	backendURL: string;
	country: string | null;
	region: string | null;
	language: string | null;
	gpc: boolean;
	credentials?: RequestCredentials;
}

export interface SSRInitRequestMetadata {
	requestContext?: SSRInitRequestContext;
	journey?: KernelJourney | null;
	experiment?: InitContext['experiment'] | null;
	requestDurationMs?: number;
	cache?: {
		isHit: boolean;
		detail: string | null;
	};
}

export type SSRSkippedReason =
	| 'no_data'
	| 'fetch_failed'
	| 'context_mismatch'
	| null;

export interface SSRInitialData {
	producerPolicyContract?: string | null;
	init: InitOutput | undefined;
	gvl?: GlobalVendorList | null;
	metadata?: SSRInitRequestMetadata;
}
