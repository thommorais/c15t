import { CONSENT_REQUEST_HEADER_NAMES } from '@c15t/schema/types';

import { c15tVersionHeaders } from '../transports/version-header';

export const CONSENT_PROXY_DEFAULT_PATHS: readonly string[] = [
	'subjects',
	'subjects/*',
	'init',
	'manifest',
	'health',
	'status',
];

export const CONSENT_PROXY_DEFAULT_FORWARD_HEADERS: readonly string[] = [
	'accept',
	'accept-language',
	'content-type',
	'cookie',
	'if-none-match',
	'origin',
	'referer',
	'user-agent',
	'sec-gpc',
	...CONSENT_REQUEST_HEADER_NAMES,
];

export const CONSENT_PROXY_DEFAULT_TIMEOUT_MS = 10_000;

export const CONSENT_PROXY_FORWARDING_HEADERS: ReadonlySet<string> = new Set([
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
]);

const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set([
	'authorization',
	'cookie',
	'proxy-authorization',
]);

export const CONSENT_PROXY_PUBLIC_FORWARD_HEADERS: ReadonlySet<string> =
	new Set(
		CONSENT_PROXY_DEFAULT_FORWARD_HEADERS.filter(
			(name) => !CREDENTIAL_HEADERS.has(name)
		)
	);

const PROXY_SET_HEADERS: ReadonlySet<string> = new Set([
	'x-c15t-proxy',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
	...Object.keys(c15tVersionHeaders),
]);

const STRIPPED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
	'connection',
	'content-encoding',
	'content-length',
	'keep-alive',
	'set-cookie',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
]);

const STRIPPED_RESPONSE_PREFIXES = ['access-control-', 'proxy-'];

const BODYLESS_METHODS: ReadonlySet<string> = new Set([
	'GET',
	'HEAD',
	'OPTIONS',
]);

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
	'localhost',
	'127.0.0.1',
	'[::1]',
	'::1',
]);

const MAX_DECODE_PASSES = 3;

export interface ConsentProxyOptions {
	paths?: readonly string[];

	forwardHeaders?: readonly string[];

	cookieNames?: readonly string[];

	timeoutMs?: number;
}

export interface ResolvedConsentProxyOptions {
	paths: readonly string[];
	forwardHeaders: readonly string[];
	cookieNames?: readonly string[];
	timeoutMs: number;
}

export interface ConsentProxyForwarding {
	for?: string;
	host: string;
	proto: string;
}

const trimTrailingSlashes = function trimTrailingSlashes(
	value: string
): string {
	let end = value.length;
	while (end > 0 && value[end - 1] === '/') {
		end -= 1;
	}
	return value.slice(0, end);
};

const trimPathSlashes = function trimPathSlashes(value: string): string {
	const trimmed = trimTrailingSlashes(value);
	let start = 0;
	while (start < trimmed.length && trimmed[start] === '/') {
		start += 1;
	}
	return trimmed.slice(start);
};

export const resolveConsentProxyOptions = function resolveConsentProxyOptions(
	proxy: boolean | ConsentProxyOptions | undefined
): ResolvedConsentProxyOptions | undefined {
	if (!proxy) {
		return undefined;
	}
	const options = proxy === true ? {} : proxy;
	return {
		cookieNames: options.cookieNames,
		forwardHeaders: [
			...CONSENT_PROXY_DEFAULT_FORWARD_HEADERS,
			...(options.forwardHeaders ?? []).map((name) => name.toLowerCase()),
		],
		paths: [...CONSENT_PROXY_DEFAULT_PATHS, ...(options.paths ?? [])],
		timeoutMs: options.timeoutMs ?? CONSENT_PROXY_DEFAULT_TIMEOUT_MS,
	};
};

const matchesPattern = function matchesPattern(
	pattern: string,
	segments: readonly string[]
): boolean {
	const expected = trimPathSlashes(pattern).split('/');
	if (expected.length !== segments.length) {
		return false;
	}
	return expected.every(
		(segment, index) => segment === '*' || segment === segments[index]
	);
};

const decodeSegment = function decodeSegment(segment: string): string | null {
	try {
		return decodeURIComponent(segment);
	} catch {
		return null;
	}
};

const isUnsafeSegment = function isUnsafeSegment(segment: string): boolean {
	let current = segment;
	for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
		const decoded = decodeSegment(current);
		if (
			decoded === null ||
			decoded === '' ||
			decoded === '.' ||
			decoded === '..' ||
			decoded.includes('/') ||
			decoded.includes('\\')
		) {
			return true;
		}
		if (decoded === current) {
			return false;
		}
		current = decoded;
	}
	return true;
};

export const isConsentProxyPathAllowed = function isConsentProxyPathAllowed(
	path: string,
	allowed: readonly string[]
): boolean {
	const normalized = trimPathSlashes(path);
	if (!normalized) {
		return false;
	}
	const segments = normalized.split('/');
	if (segments.some((segment) => isUnsafeSegment(segment))) {
		return false;
	}
	return allowed.some((pattern) => matchesPattern(pattern, segments));
};

export const isCleartextRemoteURL = function isCleartextRemoteURL(
	url: string
): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname);
	} catch {
		return false;
	}
};

export const stripIdentityForCleartext = function stripIdentityForCleartext(
	headers: Record<string, string> | undefined,
	targetURL: string
): Record<string, string> | undefined {
	if (!headers || !isCleartextRemoteURL(targetURL)) {
		return headers;
	}
	const kept = Object.fromEntries(
		Object.entries(headers).filter(([name]) =>
			CONSENT_PROXY_PUBLIC_FORWARD_HEADERS.has(name.toLowerCase())
		)
	);
	return Object.keys(kept).length > 0 ? kept : undefined;
};

export const filterCookieHeader = function filterCookieHeader(
	cookieHeader: string,
	names: readonly string[]
): string | undefined {
	const allowed = new Set(names);
	const kept = cookieHeader
		.split(';')
		.map((pair) => pair.trim())
		.filter((pair) => {
			const name = pair.split('=')[0]?.trim();
			return name !== undefined && allowed.has(name);
		});
	return kept.length > 0 ? kept.join('; ') : undefined;
};

const carriesIdentity = function carriesIdentity(headers: Headers): boolean {
	for (const name of headers.keys()) {
		const lower = name.toLowerCase();
		if (CREDENTIAL_HEADERS.has(lower)) {
			return true;
		}
		if (
			!(
				CONSENT_PROXY_PUBLIC_FORWARD_HEADERS.has(lower) ||
				PROXY_SET_HEADERS.has(lower)
			)
		) {
			return true;
		}
	}
	return false;
};

export interface BuildConsentProxyRequestHeadersInput {
	request: Request;
	forwardHeaders: readonly string[];
	cookieNames?: readonly string[];
	forwarding: ConsentProxyForwarding;
	adapter: string;
}

export const buildConsentProxyRequestHeaders =
	function buildConsentProxyRequestHeaders({
		adapter,
		cookieNames,
		forwardHeaders,
		forwarding,
		request,
	}: BuildConsentProxyRequestHeadersInput): Headers {
		const headers = new Headers();
		for (const name of forwardHeaders) {
			const value = request.headers.get(name);
			if (
				value === null ||
				CONSENT_PROXY_FORWARDING_HEADERS.has(name.toLowerCase())
			) {
				continue;
			}
			if (name === 'cookie') {
				const scoped = cookieNames
					? filterCookieHeader(value, cookieNames)
					: undefined;
				if (scoped) {
					headers.set(name, scoped);
				}
				continue;
			}
			headers.set(name, value);
		}

		if (forwarding.for) {
			headers.set('x-forwarded-for', forwarding.for);
		}
		headers.set('x-forwarded-host', forwarding.host);
		headers.set('x-forwarded-proto', forwarding.proto);
		for (const [name, value] of Object.entries(c15tVersionHeaders)) {
			headers.set(name, value);
		}
		headers.set('x-c15t-proxy', adapter);
		return headers;
	};

export const rewriteProxySetCookie = function rewriteProxySetCookie(
	value: string
): string {
	return value
		.split(';')
		.filter((part) => !/^\s*domain\s*=/iu.test(part))
		.join(';');
};

const readSetCookies = function readSetCookies(headers: Headers): string[] {
	const withGetSetCookie = headers as Headers & {
		getSetCookie?: () => string[];
	};
	if (typeof withGetSetCookie.getSetCookie === 'function') {
		return withGetSetCookie.getSetCookie();
	}
	const single = headers.get('set-cookie');
	return single ? [single] : [];
};

export const buildConsentProxyResponseHeaders =
	function buildConsentProxyResponseHeaders(upstream: Headers): Headers {
		const headers = new Headers();
		const nominated = new Set(
			(upstream.get('connection') ?? '')
				.split(',')
				.map((token) => token.trim().toLowerCase())
				.filter(Boolean)
		);
		upstream.forEach((value, name) => {
			const lower = name.toLowerCase();
			if (
				STRIPPED_RESPONSE_HEADERS.has(lower) ||
				nominated.has(lower) ||
				STRIPPED_RESPONSE_PREFIXES.some((prefix) => lower.startsWith(prefix))
			) {
				return;
			}
			headers.set(lower, value);
		});
		for (const cookie of readSetCookies(upstream)) {
			headers.append('set-cookie', rewriteProxySetCookie(cookie));
		}
		return headers;
	};

export interface ForwardConsentRequestInput {
	request: Request;
	path: string;
	backendURL: string;
	options: ResolvedConsentProxyOptions;
	forwarding: ConsentProxyForwarding;
	adapter: string;
	fetch?: typeof globalThis.fetch;
}

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

const isTimeoutError = (error: unknown): boolean =>
	(error as { name?: unknown } | null)?.name === 'TimeoutError';

export const forwardConsentRequest = async function forwardConsentRequest({
	adapter,
	backendURL,
	fetch: fetchImpl,
	forwarding,
	options,
	path,
	request,
}: ForwardConsentRequestInput): Promise<Response> {
	const normalized = trimPathSlashes(path);
	if (!isConsentProxyPathAllowed(normalized, options.paths)) {
		return notFound();
	}

	const { search } = new URL(request.url);
	const base = trimTrailingSlashes(backendURL);
	const target = `${base}/${normalized}${search}`;
	const expectedPathname = `${trimTrailingSlashes(new URL(base).pathname)}/${normalized}`;
	if (new URL(target).pathname !== expectedPathname) {
		return notFound();
	}
	const cleartextRemote = isCleartextRemoteURL(target);
	const method = request.method.toUpperCase();
	const init: RequestInit & { duplex?: 'half'; headers: Headers } = {
		headers: buildConsentProxyRequestHeaders({
			adapter,
			cookieNames: cleartextRemote ? undefined : options.cookieNames,
			forwardHeaders: cleartextRemote
				? options.forwardHeaders.filter((name) =>
						CONSENT_PROXY_PUBLIC_FORWARD_HEADERS.has(name.toLowerCase())
					)
				: options.forwardHeaders,
			forwarding: cleartextRemote
				? { ...forwarding, for: undefined }
				: forwarding,
			request,
		}),
		method,
		redirect: 'manual',
	};
	if (options.timeoutMs > 0 && typeof AbortSignal.timeout === 'function') {
		init.signal = AbortSignal.timeout(options.timeoutMs);
	}
	if (!BODYLESS_METHODS.has(method) && request.body) {
		init.body = request.body;
		init.duplex = 'half';
	}

	let upstream: Response;
	try {
		upstream = await (fetchImpl ?? globalThis.fetch)(target, init);
	} catch (error) {
		return isTimeoutError(error)
			? Response.json({ error: 'Upstream timeout' }, { status: 504 })
			: Response.json({ error: 'Bad gateway' }, { status: 502 });
	}
	const responseHeaders = buildConsentProxyResponseHeaders(upstream.headers);
	if (carriesIdentity(init.headers)) {
		responseHeaders.set('cache-control', 'private, no-store');
		responseHeaders.delete('etag');
		responseHeaders.delete('last-modified');
	}
	return new Response(upstream.body, {
		headers: responseHeaders,
		status: upstream.status,
		statusText: upstream.statusText,
	});
};
