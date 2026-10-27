type HeaderSource = Headers | Record<string, string | undefined>;

const getHeader = function getHeader(
	source: HeaderSource,
	name: string
): string | undefined {
	if (typeof (source as Headers).get === 'function') {
		return (source as Headers).get(name) ?? undefined;
	}
	const record = source as Record<string, string | undefined>;
	return record[name] ?? record[name.toLowerCase()];
};

const trimTrailingSlash = function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
};

const getRefererHost = function getRefererHost(
	headers: HeaderSource
): string | null {
	const referer = getHeader(headers, 'referer');
	if (!referer) {
		return null;
	}
	try {
		return new URL(referer).host || null;
	} catch {
		return null;
	}
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

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
const UNSAFE_HOST_CHARACTER = /[\s/\\?#@]/u;

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

export interface ResolveBackendURLOptions {
	trustForwardedHeaders?: boolean;
}

export const resolveBackendURL = function resolveBackendURL(
	backendURL: string,
	headers: HeaderSource,
	options: ResolveBackendURLOptions = {}
): string | null {
	try {
		if (/^https?:\/\//iu.test(backendURL)) {
			return trimTrailingSlash(new URL(backendURL).toString());
		}

		if (!backendURL.startsWith('/') || backendURL.startsWith('//')) {
			return null;
		}

		let host: string | undefined;
		let protocol: 'http' | 'https' | undefined;
		if (options.trustForwardedHeaders) {
			host =
				firstListValue(getHeader(headers, 'x-forwarded-host')) ??
				getHeader(headers, 'host')?.trim() ??
				getRefererHost(headers) ??
				undefined;
			protocol =
				normalizeProtocol(
					firstListValue(getHeader(headers, 'x-forwarded-proto'))
				) ??
				(getHeader(headers, 'x-forwarded-ssl') === 'on'
					? 'https'
					: undefined) ??
				'https';
		} else {
			host = getHeader(headers, 'host')?.trim();
		}
		if (!host || UNSAFE_HOST_CHARACTER.test(host)) {
			return null;
		}
		const { origin } = new URL(
			`${protocol ?? defaultProtocolForHost(host)}://${host}`
		);
		const resolved = new URL(`${origin}${backendURL}`);
		if (resolved.origin !== origin) {
			return null;
		}
		return trimTrailingSlash(resolved.toString());
	} catch {
		return null;
	}
};
