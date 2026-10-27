import { resolveRequestBackendURL } from '@c15t/core/server';

const ABSOLUTE_URL_REGEX = /^https?:\/\//u;

const trimTrailingSlash = function trimTrailingSlash(url: string): string {
	if (url === '/') {
		return url;
	}

	return url.endsWith('/') ? url.slice(0, -1) : url;
};

export const validateBackendURL = function validateBackendURL(
	backendURL: string
): {
	isAbsolute: boolean;
	normalizedURL: string;
} {
	const isAbsolute = ABSOLUTE_URL_REGEX.test(backendURL);

	if (isAbsolute) {
		String(new URL(backendURL));

		return {
			isAbsolute: true,
			normalizedURL: trimTrailingSlash(backendURL),
		};
	}

	if (backendURL.startsWith('/')) {
		return {
			isAbsolute: false,
			normalizedURL: trimTrailingSlash(backendURL),
		};
	}

	throw new Error(
		`Invalid URL format: ${backendURL}. URL must be absolute (https://...) or relative starting with (/)`
	);
};

export const normalizeBackendURL = function normalizeBackendURL(
	backendURL: string,
	headersList: Headers,
	options: { trustForwardedHeaders?: boolean } = {}
): string | null {
	return resolveRequestBackendURL(backendURL, {
		headers: headersList,
		trustForwardedHeaders: options.trustForwardedHeaders,
	});
};
