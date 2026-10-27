import type { ConsentSnapshot } from '../../types';
import { evaluateBlock } from './decide';
import type {
	BlockedRequestInfo,
	NetworkBlockerRule,
	NetworkBlockerTools,
} from './types';
import { normalizeMethod, parseUrl } from './url';

export interface FetchPatchDeps {
	getRules: () => NetworkBlockerRule[];
	getSnapshot: () => ConsentSnapshot;
	isEnabled: () => boolean;
	notifyBlocked: (info: BlockedRequestInfo) => void;
	tools: Pick<NetworkBlockerTools, 'blockedResponse' | 'evaluate'>;
	whenSettled?: () => Promise<void> | null;
}

export const installFetchPatch = function installFetchPatch(
	deps: FetchPatchDeps
): () => void {
	const originalFetch = window.fetch.bind(window);

	const patchedFetch = function patchedFetch(
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response> {
		if (!deps.isEnabled()) {
			return originalFetch(input, init);
		}

		const method = normalizeMethod(
			init?.method ??
				(typeof Request !== 'undefined' && input instanceof Request
					? input.method
					: undefined)
		);
		const url = parseUrl(input as string | URL | Request);
		if (!url) {
			return originalFetch(input, init);
		}

		const decision = evaluateBlock(
			url,
			method,
			deps.getRules(),
			deps.getSnapshot(),
			deps.tools.evaluate
		);
		if (decision.shouldBlock) {
			const settled = deps.whenSettled?.();
			if (settled) {
				return settled.then(() => patchedFetch(input, init));
			}
			deps.notifyBlocked({
				method,
				rule: decision.rule,
				url: url.toString(),
			});
			return Promise.resolve(deps.tools.blockedResponse());
		}
		return originalFetch(input, init);
	};

	window.fetch = patchedFetch as typeof window.fetch;

	return () => {
		if (window.fetch === patchedFetch) {
			window.fetch = originalFetch;
		}
	};
};
