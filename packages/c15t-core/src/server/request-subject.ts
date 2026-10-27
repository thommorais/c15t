import { isSpeculativeRequest } from '@c15t/schema/types';

import { rootDomainOf } from '../libs/cookie/domain-utils';
import type { StorageConfig } from '../libs/cookie/types';
import { generateSubjectId } from '../libs/generate-subject-id';
import { readStoredRecordsFromCookieHeader } from '../modules/persistence/hydrate';
import {
	readStoredSubjectIdFromCookieHeader,
	resolveStorageKeys,
} from '../modules/persistence/record-storage';
import { resolveRequestOrigin } from './request-origin';
import type { RequestHeaderSource } from './request-origin';

export interface ResolveRequestSubjectOptions {
	request: {
		headers?: RequestHeaderSource;
		url?: string | URL;
		cookie?: string;
	};

	storage?: StorageConfig;

	shared?: boolean;

	trustForwardedHeaders?: boolean;

	now?: number;
}

export interface SubjectCookie {
	name: string;
	value: string;
	maxAge: number;
	path: '/';
	sameSite: 'lax';
	secure: boolean;
	httpOnly: false;
	domain?: string;
	header: string;
}

export interface RequestSubject {
	subjectId: string;
	cookie: string;
	setCookie: SubjectCookie | null;
}

const SECONDS_PER_DAY = 86_400;
const COOKIE_DOMAIN = /^(?:[a-z0-9_.-]+|\[[0-9a-f:.]+\])$/iu;

const readCookieHeader = function readCookieHeader(
	options: ResolveRequestSubjectOptions
): string {
	const { cookie, headers } = options.request;
	if (cookie !== undefined) {
		return cookie;
	}
	if (!headers) {
		return '';
	}
	if (typeof (headers as Headers).get === 'function') {
		return (headers as Headers).get('cookie') ?? '';
	}
	return Object.entries(
		headers as Record<string, string | string[] | undefined>
	)
		.filter(([name]) => name.toLowerCase() === 'cookie')
		.flatMap(([, value]) => value ?? [])
		.join('; ');
};

const toHeaders = function toHeaders(
	headers: RequestHeaderSource | undefined
): Headers {
	if (typeof (headers as Headers | undefined)?.get === 'function') {
		return headers as Headers;
	}
	const result = new Headers();
	for (const [name, value] of Object.entries(headers ?? {})) {
		const first = Array.isArray(value) ? value[0] : value;
		if (first !== undefined) {
			result.set(name, first);
		}
	}
	return result;
};

const withCookie = function withCookie(
	cookieHeader: string,
	name: string,
	value: string
): string {
	const others = cookieHeader
		.split(';')
		.map((part) => part.trim())
		.filter((part) => part && !part.startsWith(`${name}=`));
	return [...others, `${name}=${value}`].join('; ');
};

const cookieValueOf = function cookieValueOf(subjectId: string): string | null {
	try {
		return encodeURIComponent(subjectId);
	} catch (error) {
		if (error instanceof URIError) {
			return null;
		}
		throw error;
	}
};

const subjectCookie = function subjectCookie(
	options: ResolveRequestSubjectOptions,
	name: string,
	subjectId: string,
	value: string
): SubjectCookie {
	const { storage } = options;
	const origin = resolveRequestOrigin({
		headers: options.request.headers,
		requestURL: options.request.url,
		trustForwardedHeaders: options.trustForwardedHeaders === true,
	});
	const url = origin ? new URL(origin) : null;
	const secure = url?.protocol === 'https:';
	let domain = storage?.defaultDomain || undefined;
	if (storage?.crossSubdomain && url) {
		const root = rootDomainOf(url.hostname);
		domain = COOKIE_DOMAIN.test(root) ? root : undefined;
	}
	const maxAge = Math.round(
		(storage?.defaultExpiryDays ?? 365) * SECONDS_PER_DAY
	);
	const header = [
		`${name}=${value}`,
		`Max-Age=${maxAge}`,
		'Path=/',
		...(domain ? [`Domain=${domain}`] : []),
		...(secure ? ['Secure'] : []),
		'SameSite=Lax',
	].join('; ');
	return {
		domain,
		header,
		httpOnly: false,
		maxAge,
		name,
		path: '/',
		sameSite: 'lax',
		secure,
		value: subjectId,
	};
};

export const resolveRequestSubject = function resolveRequestSubject(
	options: ResolveRequestSubjectOptions
): RequestSubject | null {
	if (
		options.shared ||
		isSpeculativeRequest(toHeaders(options.request.headers))
	) {
		return null;
	}
	const cookieHeader = readCookieHeader(options);
	const name = resolveStorageKeys(options.storage).subject;
	const stored = readStoredSubjectIdFromCookieHeader(
		cookieHeader,
		options.storage
	);
	const recorded = readStoredRecordsFromCookieHeader(
		cookieHeader,
		options.storage,
		options.now ?? Date.now()
	).subject?.subjectId;
	const subjectId = recorded ?? stored ?? generateSubjectId();
	const value = cookieValueOf(subjectId);
	if (stored || value === null) {
		return { cookie: cookieHeader, setCookie: null, subjectId };
	}
	return {
		cookie: withCookie(cookieHeader, name, value),
		setCookie: subjectCookie(options, name, subjectId, value),
		subjectId,
	};
};
