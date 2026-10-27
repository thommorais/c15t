import type { Overrides, SSRInitialData } from '@c15t/core';

export interface FetchSSRDataOptionsBase {
	backendURL: string;

	trustForwardedHeaders?: boolean;

	overrides?: Overrides;

	debug?: boolean;
}

export interface FetchSSRDataOptions extends FetchSSRDataOptionsBase {
	headers: Headers;
}

export type FetchSSRDataResult = SSRInitialData | undefined;
