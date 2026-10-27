const requested = new Set<string>();

new PerformanceObserver((list) => {
	for (const entry of list.getEntries()) {
		requested.add(new URL(entry.name).pathname);
	}
}).observe({ buffered: true, type: 'resource' });

export const moduleRequested = (path: string): boolean => requested.has(path);
