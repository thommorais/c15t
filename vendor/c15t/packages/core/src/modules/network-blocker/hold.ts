import type { NetworkBlockerRule } from './types';

export const XHR_REQUEST = Symbol('c15t-xhr-request');

export interface XhrStash {
	[XHR_REQUEST]?: { method: string; sync: boolean; url: string };
}

export const stashXhr = function stashXhr(
	xhr: XMLHttpRequest,
	method: string,
	url: string | URL,
	async: unknown
): void {
	(xhr as XMLHttpRequest & XhrStash)[XHR_REQUEST] = {
		method: method ? method.toUpperCase() : 'GET',
		sync: async === false,
		url: String(url),
	};
};

export const blockedResponse = function blockedResponse(): Response {
	return new Response(null, {
		status: 451,
		statusText: 'Request blocked by consent',
	});
};

export const failBlockedXhr = function failBlockedXhr(
	xhr: XMLHttpRequest
): void {
	xhr.abort();
	const event =
		typeof ProgressEvent === 'undefined'
			? ({ type: 'error' } as Event)
			: new ProgressEvent('error');
	// oxlint-disable-next-line typescript/no-explicit-any -- spec-typed XHR
	if (typeof (xhr as any).onerror === 'function') {
		// oxlint-disable-next-line typescript/no-explicit-any -- spec-typed XHR
		(xhr as any).onerror(event);
	}
	xhr.dispatchEvent(event);
};

export interface NetworkHold {
	block: () => void;
	fail: () => void;
	readonly held: boolean;
	release: () => () => void;
}

interface Owner {
	rules: readonly NetworkBlockerRule[];
	failed?: boolean;
}

interface Held {
	block: () => void;
	input: RequestInfo | URL;
	method: string | undefined;
	replay: () => void;
}

interface Hold {
	owners: Set<Owner>;
	queue: Held[];
	restore: () => void;
}

let active: Hold | null = null;

const sendNothing = (): void => undefined;

export const NOT_HELD: NetworkHold = {
	block: sendNothing,
	fail: sendNothing,
	held: false,
	release: () => sendNothing,
};

const replayAll = (queue: Held[]) => () => {
	for (const held of queue) {
		held.replay();
	}
};

export const releaseNetworkRequests =
	function releaseNetworkRequests(): () => void {
		const hold = active;
		active = null;
		hold?.restore();
		return replayAll(hold?.queue.splice(0) ?? []);
	};

const SEND = 0;
const HOLD = 1;
const BLOCK = 2;

const matches = function matches(
	hold: Hold,
	input: RequestInfo | URL,
	method = 'GET'
): number {
	let url: URL;
	try {
		url = new URL(
			input instanceof Request ? input.url : String(input),
			window.location.href
		);
	} catch {
		return SEND;
	}
	const host = url.hostname.toLowerCase();
	const verb = method.toUpperCase();
	let found = SEND;
	for (const owner of hold.owners) {
		for (const rule of owner.rules) {
			const domain = rule.domain.trim().toLowerCase();
			if (
				domain &&
				(host === domain || host.endsWith(`.${domain}`)) &&
				(typeof rule.pathIncludes !== 'string' ||
					url.pathname.includes(rule.pathIncludes)) &&
				(!rule.methods?.length ||
					rule.methods.some((allowed) => allowed.toUpperCase() === verb))
			) {
				if (owner.failed) {
					return BLOCK;
				}
				found = HOLD;
			}
		}
	}
	return found;
};

const blockUnmatched = function blockUnmatched(hold: Hold): void {
	if (hold.owners.size === 0 && active === hold) {
		active = null;
		hold.restore();
	}
	for (const held of hold.queue.splice(0)) {
		if (active === hold && matches(hold, held.input, held.method) === HOLD) {
			hold.queue.push(held);
		} else {
			held.block();
		}
	}
};

const joinHold = function joinHold(
	hold: Hold,
	rules: readonly NetworkBlockerRule[]
): NetworkHold {
	const owner: Owner = { rules };
	hold.owners.add(owner);
	return {
		block() {
			if (active === hold && hold.owners.delete(owner)) {
				blockUnmatched(hold);
			}
		},
		fail() {
			if (active === hold && hold.owners.has(owner)) {
				owner.failed = true;
				blockUnmatched(hold);
			}
		},
		get held() {
			return active === hold && hold.owners.has(owner);
		},
		release() {
			if (active !== hold || !hold.owners.delete(owner)) {
				return sendNothing;
			}
			if (hold.owners.size === 0) {
				return releaseNetworkRequests();
			}
			return replayAll(hold.queue.splice(0));
		},
	};
};

export const holdNetworkRequests = function holdNetworkRequests(
	rules: readonly NetworkBlockerRule[]
): NetworkHold {
	if (
		typeof window === 'undefined' ||
		typeof window.fetch !== 'function' ||
		typeof XMLHttpRequest === 'undefined'
	) {
		return NOT_HELD;
	}
	if (active) {
		return joinHold(active, rules);
	}
	const originalFetch = window.fetch;
	const proto = XMLHttpRequest.prototype;
	const { open: originalOpen, send: originalSend } = proto;

	const heldFetch = function heldFetch(
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response> {
		const hold = active;
		const method =
			init?.method ?? (input instanceof Request ? input.method : undefined);
		const match = hold ? matches(hold, input, method) : SEND;
		if (match === BLOCK) {
			return Promise.resolve(blockedResponse());
		}
		if (hold && match) {
			return new Promise((resolve) => {
				hold.queue.push({
					block: () => resolve(blockedResponse()),
					input,
					method,
					replay: () => resolve(window.fetch(input, init)),
				});
			});
		}
		return originalFetch.call(window, input, init);
	};

	const heldOpen = function heldOpen(
		this: XMLHttpRequest,
		method: string,
		url: string | URL,
		...rest: unknown[]
	) {
		stashXhr(this, method, url, rest[0]);
		// oxlint-disable-next-line typescript/no-explicit-any -- pass-through to native impl
		return (originalOpen as any).call(this, method, url, ...rest);
	} as typeof proto.open;

	const heldSend = function heldSend(
		this: XMLHttpRequest & XhrStash,
		body?: Document | XMLHttpRequestBodyInit | null
	) {
		const hold = active;
		const request = this[XHR_REQUEST];
		const match =
			hold && request ? matches(hold, request.url, request.method) : SEND;
		if (hold && request && match) {
			if (request.sync) {
				throw new DOMException('Request blocked by consent', 'NetworkError');
			}
			if (match === BLOCK) {
				failBlockedXhr(this);
				return;
			}
			hold.queue.push({
				block: () => failBlockedXhr(this),
				input: request.url,
				method: request.method,
				replay: () => XMLHttpRequest.prototype.send.call(this, body),
			});
			return;
		}
		return originalSend.call(this, body as never);
	} as typeof proto.send;

	window.fetch = heldFetch as typeof window.fetch;
	proto.open = heldOpen;
	proto.send = heldSend;

	const hold: Hold = {
		owners: new Set(),
		queue: [],
		restore() {
			if (window.fetch === heldFetch) {
				window.fetch = originalFetch;
			}
			if (proto.open === heldOpen) {
				proto.open = originalOpen;
			}
			if (proto.send === heldSend) {
				proto.send = originalSend;
			}
		},
	};
	active = hold;
	return joinHold(hold, rules);
};

export const blockHeldRequests = function blockHeldRequests(
	rules: readonly NetworkBlockerRule[]
): void {
	const hold = active;
	if (!hold) {
		return;
	}
	const dropped = new Set(rules);
	for (const owner of [...hold.owners]) {
		if (owner.rules.every((rule) => dropped.has(rule))) {
			hold.owners.delete(owner);
		}
	}
	blockUnmatched(hold);
};
