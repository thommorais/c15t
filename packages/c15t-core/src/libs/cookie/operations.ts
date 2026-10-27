import { getDefaultCookieOptions, getRootDomain } from './domain-utils';
import { expandFlatKeys, shortenFlatKeys } from './key-mapping';
import {
	flatToString,
	flattenObject,
	stringToFlat,
	unflattenObject,
} from './serialization';
import type { CookieOptions, StorageConfig } from './types';

export const readCookieValueFromHeader = function readCookieValueFromHeader(
	cookieHeader: string | undefined,
	name: string
): string | undefined {
	if (!cookieHeader) {
		return undefined;
	}

	const nameEQ = `${name}=`;
	for (const cookie of cookieHeader.split(';')) {
		const trimmed = cookie.trim();
		if (trimmed.startsWith(nameEQ)) {
			return trimmed.substring(nameEQ.length);
		}
	}

	return undefined;
};

export interface CookieWriteReport {
	attempted: boolean;
	verified: boolean;
	error?: unknown;
}

const serializeCookieValue = function serializeCookieValue(
	value: unknown
): string {
	if (typeof value === 'string') {
		return value;
	}
	const flattened = flattenObject(value as Record<string, unknown>);
	const shortened = shortenFlatKeys(flattened);
	return flatToString(shortened);
};

export const writeCookie = function writeCookie(
	name: string,
	value: unknown,
	options?: CookieOptions,
	config?: StorageConfig
): CookieWriteReport {
	if (typeof document === 'undefined') {
		return { attempted: false, verified: false };
	}

	const opts = { ...getDefaultCookieOptions(config), ...options };

	if (opts.crossSubdomain && !options?.domain) {
		opts.domain = getRootDomain();
	}

	let cookieValue: string;
	try {
		cookieValue = serializeCookieValue(value);

		const date = new Date();
		date.setTime(date.getTime() + opts.expiryDays * 24 * 60 * 60 * 1000);
		const expires = `expires=${date.toUTCString()}`;

		const parts = [`${name}=${cookieValue}`, expires, `path=${opts.path}`];

		if (opts.domain) {
			parts.push(`domain=${opts.domain}`);
		}

		if (opts.secure) {
			parts.push('secure');
		}

		if (opts.sameSite) {
			parts.push(`SameSite=${opts.sameSite}`);
		}

		document.cookie = parts.join('; ');
	} catch (error) {
		return { attempted: false, error, verified: false };
	}

	let readBack: string | undefined;
	try {
		readBack = readCookieValueFromHeader(document.cookie, name);
	} catch {
		readBack = undefined;
	}
	return { attempted: true, verified: readBack === cookieValue };
};

export const setCookie = function setCookie(
	name: string,
	value: unknown,
	options?: CookieOptions,
	config?: StorageConfig
): void {
	const report = writeCookie(name, value, options, config);
	if (!report.attempted && report.error !== undefined) {
		console.warn(`Failed to set cookie "${name}":`, report.error);
	}
};

export const parseCookieValue = function parseCookieValue<ReturnType = unknown>(
	cookieValue: string
): ReturnType | null {
	try {
		if (cookieValue.includes(':')) {
			const shortened = stringToFlat(cookieValue);
			const expanded = expandFlatKeys(shortened);
			const nested = unflattenObject(expanded);
			return nested as ReturnType;
		}

		return cookieValue as ReturnType;
	} catch (error) {
		console.warn('Failed to parse cookie value:', error);
		return null;
	}
};

export const getRawCookieValue = function getRawCookieValue(
	name: string,
	onUnavailable?: () => void
): string | null {
	if (typeof document === 'undefined') {
		onUnavailable?.();
		return null;
	}

	try {
		return readCookieValueFromHeader(document.cookie, name) ?? null;
	} catch (error) {
		console.warn(`Failed to get cookie "${name}":`, error);
		onUnavailable?.();
		return null;
	}
};

export const getCookie = function getCookie<ReturnType = unknown>(
	name: string
): ReturnType | null {
	if (typeof document === 'undefined') {
		return null;
	}

	try {
		const nameEQ = `${name}=`;
		const cookies = document.cookie.split(';');

		for (const cookie of cookies) {
			let c = cookie;
			while (c.charAt(0) === ' ') {
				c = c.substring(1);
			}

			if (c.indexOf(nameEQ) === 0) {
				const cookieValue = c.substring(nameEQ.length);
				return parseCookieValue<ReturnType>(cookieValue);
			}
		}

		return null;
	} catch (error) {
		console.warn(`Failed to get cookie "${name}":`, error);
		return null;
	}
};

export const deleteCookie = function deleteCookie(
	name: string,
	options?: CookieOptions,
	config?: StorageConfig
): void {
	if (typeof document === 'undefined') {
		return;
	}

	const opts = { ...getDefaultCookieOptions(config), ...options };

	if (opts.crossSubdomain && !options?.domain) {
		opts.domain = getRootDomain();
	}

	try {
		const parts = [
			`${name}=`,
			'expires=Thu, 01 Jan 1970 00:00:00 GMT',
			`path=${opts.path}`,
		];

		if (opts.domain) {
			parts.push(`domain=${opts.domain}`);
		}

		document.cookie = parts.join('; ');
	} catch (error) {
		console.warn(`Failed to delete cookie "${name}":`, error);
	}
};
