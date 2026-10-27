export interface StorageConfig {
	storageKey?: string;

	crossSubdomain?: boolean;

	defaultDomain?: string;

	defaultExpiryDays?: number;
}

export interface CookieOptions {
	expiryDays?: number;

	crossSubdomain?: boolean;

	domain?: string;

	path?: string;

	secure?: boolean;

	sameSite?: 'Strict' | 'Lax' | 'None';
}
