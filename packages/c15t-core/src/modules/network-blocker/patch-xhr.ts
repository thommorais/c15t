import type { ConsentSnapshot } from '../../types';
import { evaluateBlock } from './decide';
import type { XHR_REQUEST, XhrStash } from './hold';
import type {
	BlockedRequestInfo,
	NetworkBlockerRule,
	NetworkBlockerTools,
} from './types';
import { parseUrl } from './url';

export interface XhrPatchDeps {
	getRules: () => NetworkBlockerRule[];
	getSnapshot: () => ConsentSnapshot;
	isEnabled: () => boolean;
	notifyBlocked: (info: BlockedRequestInfo) => void;
	tools: Pick<
		NetworkBlockerTools,
		'evaluate' | 'failBlockedXhr' | 'stashXhr' | 'xhrRequest'
	>;
	whenSettled?: () => Promise<void> | null;
}

export const installXhrPatch = function installXhrPatch(
	deps: XhrPatchDeps
): () => void {
	const { evaluate, failBlockedXhr, stashXhr, xhrRequest } = deps.tools;
	const originalOpen = XMLHttpRequest.prototype.open;
	const originalSend = XMLHttpRequest.prototype.send;

	const patchedOpen = function patchedOpen(
		this: XMLHttpRequest,
		method: string,
		url: string | URL,
		...rest: unknown[]
	) {
		stashXhr(this, method, url, rest[0]);
		// oxlint-disable-next-line typescript/no-explicit-any -- pass-through to native impl
		return (originalOpen as any).call(this, method, url, ...rest);
	} as typeof XMLHttpRequest.prototype.open;

	const patchedSend = function patchedSend(
		this: XMLHttpRequest & XhrStash,
		body?: Document | XMLHttpRequestBodyInit | null
	) {
		if (!deps.isEnabled()) {
			return originalSend.call(this, body as never);
		}
		const request = this[xhrRequest as typeof XHR_REQUEST];
		const method = request?.method ?? 'GET';
		const url = parseUrl(request?.url ?? '');
		if (!url) {
			return originalSend.call(this, body as never);
		}

		const decision = evaluateBlock(
			url,
			method,
			deps.getRules(),
			deps.getSnapshot(),
			evaluate
		);
		if (!decision.shouldBlock) {
			return originalSend.call(this, body as never);
		}
		const settled = request?.sync ? null : deps.whenSettled?.();
		if (settled) {
			void (async () => {
				await settled;
				patchedSend.call(this, body);
			})();
			return;
		}

		deps.notifyBlocked({
			method,
			rule: decision.rule,
			url: url.toString(),
		});
		failBlockedXhr(this);
	} as typeof XMLHttpRequest.prototype.send;

	XMLHttpRequest.prototype.open = patchedOpen;
	XMLHttpRequest.prototype.send = patchedSend;

	return () => {
		if (XMLHttpRequest.prototype.open === patchedOpen) {
			XMLHttpRequest.prototype.open = originalOpen;
		}
		if (XMLHttpRequest.prototype.send === patchedSend) {
			XMLHttpRequest.prototype.send = originalSend;
		}
	};
};
