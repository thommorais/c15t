import { isProductionBuild } from '../libs/is-production';

const LOADED = Symbol('c15t-lazy-module-loaded');

export const afterModuleLoaded = function afterModuleLoaded(
	handle: { dispose: () => void } | null | undefined,
	next: () => void
): void {
	const loaded = (handle as { [LOADED]?: Promise<void> } | null | undefined)?.[
		LOADED
	];
	if (!loaded) {
		next();
		return;
	}
	void (async () => {
		await loaded;
		next();
	})();
};

export const lazyRuntimeModule = function lazyRuntimeModule<
	Options,
	Handle extends { dispose: () => void },
>(
	load: () => Promise<(options: Options) => Handle>
): (options: Options) => Handle {
	return (options) => {
		let inner: Handle | null = null;
		let disposed = false;
		const queued: [PropertyKey, unknown[]][] = [];
		const attempt = async (): Promise<void> => {
			try {
				const create = await load();
				if (disposed) {
					return;
				}
				inner = create(options);
				for (const [method, args] of queued.splice(0)) {
					(
						inner as unknown as Record<
							PropertyKey,
							(...a: unknown[]) => unknown
						>
					)[method]?.(...args);
				}
			} catch (error) {
				if (!isProductionBuild()) {
					console.warn(
						'c15t: a runtime module failed to load and stays inactive.',
						error
					);
				}
				if (!disposed && typeof window !== 'undefined') {
					window.addEventListener('online', attempt, { once: true });
				}
			}
		};
		const loaded = attempt();
		return new Proxy({} as Handle, {
			get(_target, method) {
				if (method === LOADED) {
					return loaded;
				}
				if (method === 'dispose') {
					return () => {
						disposed = true;
						queued.length = 0;
						if (typeof window !== 'undefined') {
							window.removeEventListener('online', attempt);
						}
						inner?.dispose();
						inner = null;
					};
				}
				return (...args: unknown[]) => {
					if (inner) {
						return (
							inner as unknown as Record<
								PropertyKey,
								(...a: unknown[]) => unknown
							>
						)[method]?.(...args);
					}
					if (!disposed) {
						queued.push([method, args]);
					}
					return undefined;
				};
			},
		});
	};
};
