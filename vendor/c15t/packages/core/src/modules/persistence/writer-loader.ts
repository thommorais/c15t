import type { InternalKernel } from '../../kernel/internals';
import type { createPersistenceWriter } from './writer/writer';

export interface WriterModule {
	createPersistenceWriter: typeof createPersistenceWriter;
}

export interface WriterLoader {
	module?: WriterModule;
	load: () => Promise<WriterModule>;
}

export const createWriterLoader = function createWriterLoader(
	importWriter: () => Promise<WriterModule>
): WriterLoader {
	let loading: Promise<WriterModule> | undefined;
	const loader: WriterLoader = {
		load() {
			loading ??= (async () => {
				try {
					loader.module = await importWriter();
					return loader.module;
				} catch (error) {
					loading = undefined;
					throw error;
				}
			})();
			return loading;
		},
	};
	return loader;
};

export const pageWriterLoader = createWriterLoader(
	() => import('./writer/writer')
);

const PRELOAD_DELAY_MS = 3000;
const SURFACE_ROOT = /consent-(?:banner|dialog)-root$/u;
const INTENT_EVENTS = ['pointerdown', 'keydown', 'focusin'] as const;

export const preloadWriter = function preloadWriter(
	kernel: InternalKernel,
	load: () => void
): () => void {
	let listening = false;
	const listen = (add: boolean) => {
		if (listening === add) {
			return;
		}
		listening = add;
		for (const type of INTENT_EVENTS) {
			document[add ? 'addEventListener' : 'removeEventListener'](
				type,
				// oxlint-disable-next-line no-use-before-define -- Called after assembly.
				onIntent,
				true
			);
		}
	};
	const preload = () => {
		listen(false);
		load();
	};
	const onIntent = (event: Event) => {
		if (
			event
				.composedPath()
				.some((node) =>
					SURFACE_ROOT.test((node as HTMLElement).dataset?.testid as string)
				)
		) {
			preload();
		}
	};
	const stop = kernel.events.on('surface:shown', () => {
		stop();
		listen(true);
		const idle = () =>
			setTimeout(
				() => (globalThis.requestIdleCallback ?? setTimeout)(preload),
				PRELOAD_DELAY_MS
			);
		if (document.readyState === 'complete') {
			idle();
		} else {
			window.addEventListener('load', idle, { once: true });
		}
	});
	return () => {
		stop();
		listen(false);
	};
};
