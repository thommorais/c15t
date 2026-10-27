export type RequestHeaderSource =
	| Headers
	| Record<string, string | string[] | undefined>;

export interface ResolveRequestOriginOptions {
	requestURL?: string | URL;

	headers?: RequestHeaderSource;

	trustForwardedHeaders?: boolean;
}

const ABSOLUTE_HTTP_URL = /^https?:\/\//iu;
const UNSAFE_HOST_CHARACTER = /[\s/\\?#@]/u;
const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/u;

const readHeader = function readHeader(
	headers: RequestHeaderSource | undefined,
	name: string
): string | undefined {
	if (!headers) {
		return undefined;
	}
	if (typeof (headers as Headers).get === 'function') {
		return (headers as Headers).get(name) ?? undefined;
	}
	const lower = name.toLowerCase();
	const value = Object.entries(
		headers as Record<string, string | string[] | undefined>
	).find(([key]) => key.toLowerCase() === lower)?.[1];
	return Array.isArray(value) ? value[0] : value;
};

const firstListValue = function firstListValue(
	value: string | undefined
): string | undefined {
	const first = value?.split(',')[0]?.trim();
	return first || undefined;
};

const normalizeProtocol = function normalizeProtocol(
	value: string | undefined
): 'http' | 'https' | undefined {
	const protocol = value?.trim().toLowerCase().replace(/:$/u, '');
	return protocol === 'http' || protocol === 'https' ? protocol : undefined;
};

const parseForwardedHeader = function parseForwardedHeader(
	value: string | undefined
): { host?: string; protocol?: 'http' | 'https' } {
	const first = firstListValue(value);
	if (!first) {
		return {};
	}
	const result: { host?: string; protocol?: 'http' | 'https' } = {};
	for (const pair of first.split(';')) {
		const separator = pair.indexOf('=');
		if (separator === -1) {
			continue;
		}
		const key = pair.slice(0, separator).trim().toLowerCase();
		const token = pair.slice(separator + 1).trim();
		const raw =
			token.length >= 2 && token.startsWith('"') && token.endsWith('"')
				? token.slice(1, -1)
				: token;
		if (key === 'host' && raw) {
			result.host = raw;
		} else if (key === 'proto') {
			result.protocol = normalizeProtocol(raw);
		}
	}
	return result;
};

const defaultProtocolForHost = function defaultProtocolForHost(
	host: string
): 'http' | 'https' {
	let hostname: string;
	try {
		hostname = new URL(`http://${host}`).hostname.toLowerCase();
	} catch {
		return 'https';
	}
	const isPlainHTTP =
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.startsWith('[') ||
		IPV4_LITERAL.test(hostname) ||
		!hostname.includes('.');
	return isPlainHTTP ? 'http' : 'https';
};

const toOrigin = function toOrigin(
	protocol: 'http' | 'https',
	host: string
): string | null {
	if (!host || UNSAFE_HOST_CHARACTER.test(host)) {
		return null;
	}
	try {
		const url = new URL(`${protocol}://${host}`);
		return url.pathname === '/' && !url.username && !url.password
			? url.origin
			: null;
	} catch {
		return null;
	}
};

const originFromForwardedHeaders = function originFromForwardedHeaders(
	headers: RequestHeaderSource | undefined,
	requestOrigin: URL | null
): string | null {
	const forwarded = parseForwardedHeader(readHeader(headers, 'forwarded'));
	const host =
		forwarded.host ??
		firstListValue(readHeader(headers, 'x-forwarded-host')) ??
		requestOrigin?.host ??
		readHeader(headers, 'host')?.trim();
	if (!host) {
		return null;
	}
	const protocol =
		forwarded.protocol ??
		normalizeProtocol(
			firstListValue(readHeader(headers, 'x-forwarded-proto'))
		) ??
		(readHeader(headers, 'x-forwarded-ssl') === 'on' ? 'https' : undefined) ??
		normalizeProtocol(requestOrigin?.protocol) ??
		defaultProtocolForHost(host);
	return toOrigin(protocol, host);
};

const originFromRequestURL = function originFromRequestURL(
	requestURL: string | URL | undefined
): string | null {
	if (!requestURL) {
		return null;
	}
	try {
		const url = new URL(requestURL);
		const protocol = normalizeProtocol(url.protocol);
		return protocol ? toOrigin(protocol, url.host) : null;
	} catch {
		return null;
	}
};

export const resolveRequestOrigin = function resolveRequestOrigin(
	options: ResolveRequestOriginOptions
): string | null {
	const fromURL = originFromRequestURL(options.requestURL);
	if (options.trustForwardedHeaders) {
		const forwarded = originFromForwardedHeaders(
			options.headers,
			fromURL ? new URL(fromURL) : null
		);
		if (forwarded) {
			return forwarded;
		}
	}
	if (fromURL) {
		return fromURL;
	}
	const host = readHeader(options.headers, 'host')?.trim();
	if (!host) {
		return null;
	}
	return toOrigin(defaultProtocolForHost(host), host);
};

const trimTrailingSlash = function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
};

export const resolveRequestBackendURL = function resolveRequestBackendURL(
	backendURL: string,
	options: ResolveRequestOriginOptions = {}
): string | null {
	try {
		if (ABSOLUTE_HTTP_URL.test(backendURL)) {
			return trimTrailingSlash(new URL(backendURL).toString());
		}
		if (!backendURL.startsWith('/') || backendURL.startsWith('//')) {
			return null;
		}
		const origin = resolveRequestOrigin(options);
		if (!origin) {
			return null;
		}
		const resolved = new URL(`${origin}${backendURL}`);
		if (resolved.origin !== origin) {
			return null;
		}
		return trimTrailingSlash(resolved.toString());
	} catch {
		return null;
	}
};
