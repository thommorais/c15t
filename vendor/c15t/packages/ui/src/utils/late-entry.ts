export const LATE_ENTRY_THRESHOLD_MS = 100;

export const isLateEntry = function isLateEntry(now?: number): boolean {
	if (
		typeof performance === 'undefined' ||
		typeof performance.getEntriesByType !== 'function'
	) {
		return false;
	}
	const paint = performance
		.getEntriesByType('paint')
		.find((entry) => entry.name === 'first-contentful-paint');
	if (!paint) {
		return false;
	}
	return (now ?? performance.now()) - paint.startTime > LATE_ENTRY_THRESHOLD_MS;
};
