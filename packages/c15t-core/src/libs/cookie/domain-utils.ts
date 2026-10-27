import type { CookieOptions, StorageConfig } from './types';

export const getDefaultCookieOptions = function getDefaultCookieOptions(
	config?: StorageConfig
): Required<CookieOptions> {
	return {
		crossSubdomain: config?.crossSubdomain ?? false,
		domain: config?.defaultDomain ?? '',
		expiryDays: config?.defaultExpiryDays ?? 365,
		path: '/',
		sameSite: 'Lax',
		secure:
			typeof window !== 'undefined' && window.location.protocol === 'https:',
	};
};

export const rootDomainOf = function rootDomainOf(hostname: string): string {
	if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/u.test(hostname)) {
		return hostname;
	}

	const parts = hostname.split('.');

	if (parts.length >= 2) {
		return `.${parts.slice(-2).join('.')}`;
	}

	return hostname;
};

export const getRootDomain = function getRootDomain(): string {
	if (typeof window === 'undefined') {
		return '';
	}
	return rootDomainOf(window.location.hostname);
};
