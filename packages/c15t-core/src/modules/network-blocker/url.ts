import type { NetworkBlockerRule } from './types';

export const normalizeMethod = function normalizeMethod(
	method: string | undefined | null
): string {
	if (!method) {
		return 'GET';
	}
	return method.toUpperCase();
};

export const parseUrl = function parseUrl(
	rawUrl: string | URL | Request
): URL | null {
	try {
		if (rawUrl instanceof URL) {
			return rawUrl;
		}
		if (typeof rawUrl === 'string') {
			if (typeof window === 'undefined') {
				return null;
			}
			return new URL(rawUrl, window.location?.href);
		}
		if (typeof Request !== 'undefined' && rawUrl instanceof Request) {
			return new URL(rawUrl.url);
		}
		return null;
	} catch {
		return null;
	}
};

export const hostnameMatchesRule = function hostnameMatchesRule(
	hostname: string,
	rule: NetworkBlockerRule
): boolean {
	if (!hostname) {
		return false;
	}
	const ruleDomain = rule.domain.trim().toLowerCase();
	const targetHost = hostname.trim().toLowerCase();
	if (!ruleDomain || !targetHost) {
		return false;
	}
	if (targetHost === ruleDomain) {
		return true;
	}
	return targetHost.endsWith(`.${ruleDomain}`);
};

export const pathMatchesRule = function pathMatchesRule(
	pathname: string,
	rule: NetworkBlockerRule
): boolean {
	if (typeof rule.pathIncludes !== 'string') {
		return true;
	}
	if (!pathname) {
		return false;
	}
	return pathname.includes(rule.pathIncludes);
};

export const methodMatchesRule = function methodMatchesRule(
	method: string,
	rule: NetworkBlockerRule
): boolean {
	if (!rule.methods || rule.methods.length === 0) {
		return true;
	}
	const upper = normalizeMethod(method);
	return rule.methods.some((m: string) => normalizeMethod(m) === upper);
};
