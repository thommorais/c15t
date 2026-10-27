import type { ReactElement } from 'react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server';

export const BANNER = '[data-testid="consent-banner-root"]';

export interface HydratedPage {
	recoverableErrors: unknown[];
	unmount: () => Promise<void>;
}

export interface StreamedPage {
	doc: Document;
	timeline: string[];
	mark: (label: string) => void;
	finish: () => Promise<void>;
	hasBanner: () => boolean;
	hydrate: (element: ReactElement) => Promise<HydratedPage>;
	hydrateNow: (element: ReactElement) => HydratedPage;
	serverErrors: unknown[];
	dispose: () => void;
}

const wait = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

type Read = ReadableStreamReadResult<string>;

const readWithin = async function readWithin(
	reader: ReadableStreamDefaultReader<string>,
	pending: { read?: Promise<Read> },
	ms: number
): Promise<Read | 'idle'> {
	pending.read ??= reader.read();
	const idle = async () => {
		await wait(ms);
		return 'idle' as const;
	};
	const result = await Promise.race([pending.read, idle()]);
	if (result !== 'idle') {
		pending.read = undefined;
	}
	return result;
};

const tracked = function tracked(
	recoverableErrors: unknown[],
	root: () => ReturnType<typeof hydrateRoot> | undefined
): HydratedPage {
	return {
		recoverableErrors,
		unmount: async () => {
			await act(() => {
				root()?.unmount();
			});
		},
	};
};

export const streamPage = async function streamPage(
	element: ReactElement
): Promise<StreamedPage> {
	const frame = document.createElement('iframe');
	document.body.append(frame);
	const doc = frame.contentDocument as Document;
	doc.open();
	const serverErrors: unknown[] = [];
	const stream = await renderToReadableStream(element, {
		onError: (error) => {
			serverErrors.push(error);
		},
	});
	const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
	const pending: { read?: Promise<Read> } = {};
	const timeline: string[] = [];
	const markups: string[] = [];
	const visibleBanner = () => {
		const banner = doc.querySelector(BANNER);
		return banner && !banner.closest('[hidden]') ? banner : null;
	};
	let last = '';
	const observe = () => {
		const html = visibleBanner()?.outerHTML.replace(/\?ref=[^"]*/gu, '');
		let entry = 'none';
		if (html) {
			if (!markups.includes(html)) {
				markups.push(html);
			}
			entry = `banner:${markups.indexOf(html) + 1}`;
		}
		if (entry !== last) {
			timeline.push(entry);
			last = entry;
		}
	};
	const progress = { done: false };
	const write = (result: Read) => {
		if (result.done) {
			progress.done = true;
			doc.close();
			return;
		}
		doc.write(result.value);
		observe();
	};
	const revealed = async () => {
		const started = performance.now();
		while (doc.querySelector('[hidden][id^="S:"]')) {
			if (performance.now() - started > 3000) {
				throw new Error('a streamed boundary was never revealed');
			}
			// oxlint-disable-next-line no-await-in-loop -- Polls the page between frames.
			await wait(16);
		}
		observe();
	};
	const Observer = frame.contentWindow?.MutationObserver ?? MutationObserver;
	const observer = new Observer(observe);
	observer.observe(doc, { attributes: true, childList: true, subtree: true });

	while (!progress.done) {
		// oxlint-disable-next-line no-await-in-loop -- A stream is read in order.
		const result = await readWithin(reader, pending, 30);
		if (result === 'idle') {
			break;
		}
		write(result);
	}

	return {
		dispose: () => {
			observer.disconnect();
			frame.remove();
		},
		doc,
		async finish() {
			while (!progress.done) {
				// oxlint-disable-next-line no-await-in-loop -- A stream is read in order.
				const result = await (pending.read ?? reader.read());
				pending.read = undefined;
				write(result);
			}
			await revealed();
		},
		hasBanner: () => visibleBanner() !== null,
		async hydrate(app) {
			const recoverableErrors: unknown[] = [];
			let root: ReturnType<typeof hydrateRoot> | undefined;
			await act(() => {
				root = hydrateRoot(doc, app, {
					onRecoverableError: (error) => recoverableErrors.push(error),
				});
			});
			return tracked(recoverableErrors, () => root);
		},
		hydrateNow(app) {
			const recoverableErrors: unknown[] = [];
			const root = hydrateRoot(doc, app, {
				onRecoverableError: (error) => recoverableErrors.push(error),
			});
			return tracked(recoverableErrors, () => root);
		},
		mark: (label) => {
			timeline.push(`@${label}`);
			last = '';
			observe();
		},
		serverErrors,
		timeline,
	};
};

export interface Deferred<Value> {
	promise: Promise<Value>;
	resolve: (value: Value) => void;
	reject: (reason?: unknown) => void;
}

export const deferred = function deferred<Value>(): Deferred<Value> {
	const { promise, reject, resolve } = Promise.withResolvers<Value>();
	return { promise, reject, resolve };
};

export const fulfilledThenable = function fulfilledThenable<Value>(
	value: Value
): Promise<Value> {
	return Object.assign(Promise.resolve(value), {
		status: 'fulfilled',
		value,
	});
};
