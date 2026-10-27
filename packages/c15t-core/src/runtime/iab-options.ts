export const isIABConfigured = function isIABConfigured(
	iab: { enabled?: boolean } | false | null | undefined
): boolean {
	return (
		iab !== false && iab !== null && iab !== undefined && iab.enabled !== false
	);
};
