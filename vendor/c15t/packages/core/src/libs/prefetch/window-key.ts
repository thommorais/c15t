export const PREFETCH_WINDOW_KEY = '__c15tInitialDataPromises';

export const hasPrefetchedInitialData =
	function hasPrefetchedInitialData(): boolean {
		if (typeof window === 'undefined') {
			return false;
		}
		const entries = (window as unknown as Record<string, unknown>)[
			PREFETCH_WINDOW_KEY
		];
		return (
			typeof entries === 'object' &&
			entries !== null &&
			Object.keys(entries).length > 0
		);
	};
