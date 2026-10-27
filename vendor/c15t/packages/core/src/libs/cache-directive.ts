export const parseCacheDirectiveSeconds = function parseCacheDirectiveSeconds(
	cacheControl: string | null | undefined,
	directive: string
): number | undefined {
	if (!cacheControl) {
		return undefined;
	}
	for (const part of cacheControl.split(',')) {
		const [rawKey, rawValue] = part.trim().split('=');
		if (rawKey?.toLowerCase() !== directive) {
			continue;
		}
		const value = rawValue?.trim();
		if (!value || !/^\d+$/u.test(value)) {
			return undefined;
		}
		const seconds = Number(value);
		return Number.isSafeInteger(seconds) ? seconds : undefined;
	}
	return undefined;
};
