import { getAppScheme } from './app-scheme';

export interface LoggerLike {
	debug?: (message: string, ...rest: unknown[]) => void;
	warn?: (message: string, ...rest: unknown[]) => void;
	error?: (message: string, ...rest: unknown[]) => void;
}

export const matchesWildcard = function matchesWildcard(
	origin: string,
	wildcardPattern: string
): boolean {
	const wildcardDomain = wildcardPattern.slice(2);

	return origin !== wildcardDomain && origin.endsWith(`.${wildcardDomain}`);
};

const WWW_REGEX = /^www\./u;

const PROTOCOL_REGEX = /^[a-z][a-z\d+.-]*:\/\//iu;

const DEFAULT_PORTS: Record<string, string> = {
	'http:': '80',
	'https:': '443',
	'ws:': '80',
	'wss:': '443',
};

interface NormalizedTrustedDomain {
	scheme?: string;
	hostname: string;
	port?: string;
}

const extractExplicitPort = function extractExplicitPort(
	authority: string
): string | undefined {
	// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
	const ipv6 = authority.match(/^\[[^\]]+\](?::(\d+))?$/u);
	if (ipv6) {
		return ipv6[1] || undefined;
	}

	// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
	const match = authority.match(/:(\d+)$/u);
	return match ? match[1] : undefined;
};

const normalizeTrustedDomain = function normalizeTrustedDomain(
	domain: string
): NormalizedTrustedDomain | null {
	const trimmed = domain.trim();
	if (!trimmed) {
		return null;
	}

	const hasProtocol = PROTOCOL_REGEX.test(trimmed);
	const withoutProtocol = trimmed.replace(PROTOCOL_REGEX, '');
	const authority = withoutProtocol.split(/[/?#]/u)[0] ?? '';

	try {
		const parsed = new URL(hasProtocol ? trimmed : `https://${authority}`);

		return {
			hostname: parsed.hostname.toLowerCase(),
			port: extractExplicitPort(authority),
			scheme: getAppScheme(trimmed),
		};
	} catch {
		return null;
	}
};

const matchesHostname = function matchesHostname(
	originHostname: string,
	trusted: NormalizedTrustedDomain,
	logger?: LoggerLike
): boolean {
	if (trusted.hostname.startsWith('*.')) {
		const isMatch = matchesWildcard(originHostname, trusted.hostname);
		logger?.debug?.(
			`Wildcard match result: ${isMatch} ${originHostname} matches ${trusted.hostname}`
		);
		return isMatch;
	}

	const stripWww = !trusted.scheme;
	const normalizedOriginHostname = stripWww
		? originHostname.replace(WWW_REGEX, '')
		: originHostname;
	const normalizedTrustedHostname = stripWww
		? trusted.hostname.replace(WWW_REGEX, '')
		: trusted.hostname;
	const isMatch = normalizedOriginHostname === normalizedTrustedHostname;
	logger?.debug?.(
		`Exact match result: ${isMatch} ${normalizedOriginHostname} === ${normalizedTrustedHostname}`
	);
	return isMatch;
};

interface ParsedOrigin {
	hostname: string;
	port?: string;
	scheme?: string;
}

const matchesTrustedDomain = function matchesTrustedDomain(
	origin: ParsedOrigin,
	domain: string,
	logger?: LoggerLike
): boolean {
	if (!domain || domain.trim() === '') {
		logger?.debug?.('Skipping empty domain');
		return false;
	}

	const normalizedDomain = normalizeTrustedDomain(domain);
	if (!normalizedDomain) {
		logger?.debug?.('Skipping invalid domain');
		return false;
	}

	logger?.debug?.(
		`Checking against stripped domain: ${normalizedDomain.hostname}`
	);

	if (normalizedDomain.scheme && normalizedDomain.scheme !== origin.scheme) {
		logger?.debug?.(
			`Scheme mismatch: ${origin.scheme ?? '<web>'} !== ${normalizedDomain.scheme}`
		);
		return false;
	}

	if (normalizedDomain.port && normalizedDomain.port !== origin.port) {
		logger?.debug?.(
			`Port mismatch: ${origin.port ?? '<default>'} !== ${normalizedDomain.port}`
		);
		return false;
	}

	return matchesHostname(origin.hostname, normalizedDomain, logger);
};

export const isOriginTrusted = function isOriginTrusted(
	origin: string,
	trustedDomains: string[],
	logger?: LoggerLike
): boolean {
	try {
		if (trustedDomains.length === 0) {
			throw new Error('No trusted domains');
		}

		logger?.debug?.(
			`Checking if origin ${origin} is trusted in ${trustedDomains}`
		);

		if (trustedDomains.includes('*')) {
			logger?.debug?.('Allowing all origins');
			return true;
		}

		const url = new URL(origin);
		const originHostname = url.hostname.toLowerCase();
		const originScheme = getAppScheme(origin);
		const originPort = url.port || DEFAULT_PORTS[url.protocol] || undefined;
		logger?.debug?.(`Parsed origin hostname: ${originHostname}`);

		return trustedDomains.some((domain) =>
			matchesTrustedDomain(
				{ hostname: originHostname, port: originPort, scheme: originScheme },
				domain,
				logger
			)
		);
	} catch (error) {
		logger?.error?.('Error validating origin:', error);
		return false;
	}
};
