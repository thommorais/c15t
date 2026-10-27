import {
	CONSENT_EXPERIMENT_HEADER,
	parseExperimentHeader,
	buildConsentSessionReport,
	CONSENT_SESSION_CLIENT_IP_HEADER,
	getIpAddress,
	isSpeculativeRequest as isSpeculativeHeaders,
	readSessionJourney,
} from '@c15t/schema/types';
import type { BuildConsentSessionReportOptions } from '@c15t/schema/types';

import { c15tProtocolHeaders } from '../transports/version-header';

export const SESSION_REPORT_FORWARD_HEADERS = [
	'user-agent',
	CONSENT_SESSION_CLIENT_IP_HEADER,
] as const;

export const SESSION_REPORT_CLIENT_IP_HEADER = CONSENT_SESSION_CLIENT_IP_HEADER;

const SESSION_REPORT_TIMEOUT_MS = 3000;

export type {
	BuildConsentSessionReportOptions,
	SessionReportInputs,
} from '@c15t/schema/types';
export { buildConsentSessionReport } from '@c15t/schema/types';

export type SessionReportHeaders =
	| Headers
	| Record<string, string | string[] | undefined>;

const trimSlash = function trimSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
};

const ABSOLUTE_URL = /^https?:\/\//iu;

export const resolveSessionReportBackendURL =
	function resolveSessionReportBackendURL(source: {
		backendURL?: string | null;
	}): string | undefined {
		return source.backendURL && ABSOLUTE_URL.test(source.backendURL)
			? trimSlash(source.backendURL)
			: undefined;
	};

const readHeader = function readHeader(
	headers: SessionReportHeaders | undefined,
	name: string
): string | undefined {
	if (!headers) {
		return undefined;
	}
	if (headers instanceof Headers) {
		return headers.get(name) ?? undefined;
	}
	const direct = headers[name] ?? headers[name.toLowerCase()];
	if (direct !== undefined) {
		return Array.isArray(direct) ? direct[0] : direct;
	}
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === name) {
			return Array.isArray(value) ? value[0] : value;
		}
	}
	return undefined;
};

const toHeaders = function toHeaders(
	headers: SessionReportHeaders | undefined
): Headers {
	if (!headers) {
		return new Headers();
	}
	if (headers instanceof Headers) {
		return headers;
	}
	const result = new Headers();
	for (const [key, value] of Object.entries(headers)) {
		const single = Array.isArray(value) ? value[0] : value;
		if (single) {
			result.set(key, single);
		}
	}
	return result;
};

export const isSpeculativeRequest = function isSpeculativeRequest(
	headers: SessionReportHeaders | undefined
): boolean {
	return isSpeculativeHeaders(toHeaders(headers));
};

export const forwardSessionReportHeaders = function forwardSessionReportHeaders(
	headers: SessionReportHeaders | undefined
): Record<string, string> {
	const forwarded: Record<string, string> = {};
	const userAgent = readHeader(headers, 'user-agent');
	if (userAgent) {
		forwarded['user-agent'] = userAgent;
	}
	const ip = getIpAddress(toHeaders(headers), { masking: false });
	if (ip) {
		forwarded[CONSENT_SESSION_CLIENT_IP_HEADER] = ip;
	}
	return forwarded;
};

export interface ReportConsentSessionOptions extends BuildConsentSessionReportOptions {
	backendURL?: string | null;
	fetch?: typeof globalThis.fetch;
	headers?: SessionReportHeaders;
	method?: string;
	url?: string | URL;
	waitUntil?: (task: Promise<void>) => void;
}

export const reportConsentSession = function reportConsentSession(
	options: ReportConsentSessionOptions
): Promise<void> {
	const backendURL = resolveSessionReportBackendURL(options);
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (
		!backendURL ||
		!fetchImpl ||
		isSpeculativeRequest(options.headers) ||
		(options.method !== undefined && options.method.toUpperCase() !== 'GET')
	) {
		return Promise.resolve();
	}

	const task = (async () => {
		try {
			const body = buildConsentSessionReport({
				...options,
				experiment:
					options.experiment ??
					parseExperimentHeader(
						readHeader(options.headers, CONSENT_EXPERIMENT_HEADER)
					),
				journey:
					options.journey ??
					readSessionJourney(
						options.url,
						readHeader(options.headers, 'origin') ?? options.url
					),
			});
			const response = await fetchImpl(`${backendURL}/sessions`, {
				body: JSON.stringify(body),
				headers: {
					'content-type': 'application/json',
					...c15tProtocolHeaders,
					...forwardSessionReportHeaders(options.headers),
				},
				method: 'POST',
				signal:
					typeof AbortSignal !== 'undefined' &&
					typeof AbortSignal.timeout === 'function'
						? AbortSignal.timeout(SESSION_REPORT_TIMEOUT_MS)
						: undefined,
			});
			await response.body?.cancel();
		} catch {
		}
	})();
	try {
		options.waitUntil?.(task);
	} catch {
	}
	return task;
};
