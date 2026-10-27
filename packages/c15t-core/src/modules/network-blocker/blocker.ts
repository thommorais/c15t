import type { ConsentSnapshot } from '../../types';
import { installFetchPatch } from './patch-fetch';
import { installXhrPatch } from './patch-xhr';
import type {
	BlockedRequestInfo,
	NetworkBlockerHandle,
	NetworkBlockerOptions,
	NetworkBlockerRule,
	NetworkBlockerTools,
} from './types';

export const createNetworkBlockerWith = function createNetworkBlockerWith(
	options: NetworkBlockerOptions,
	tools: NetworkBlockerTools
): NetworkBlockerHandle {
	const { categoriesOf, declareOwners, forgetOwners, releaseHolds } = tools;
	const { kernel, onRequestBlocked } = options;
	const logBlocked = options.logBlockedRequests ?? true;
	let rules: NetworkBlockerRule[] = [...(options.rules ?? [])];
	const ownerSource = Symbol('network-blocker');
	const registerCategories = () => {
		kernel.set.registerConsentCategories(
			rules.flatMap((rule) => categoriesOf(rule.category))
		);
		declareOwners(kernel, rules, ownerSource);
	};
	registerCategories();
	let enabled = options.enabled !== false;
	let disposed = false;
	let snapshot: ConsentSnapshot = kernel.getSnapshot();

	let settled: Promise<void> | null = null;
	let settle: (() => void) | null = null;
	const consentPending = (): boolean =>
		!disposed &&
		enabled &&
		snapshot.policyPending &&
		snapshot.resolution.status !== 'failed';
	const whenSettled = (): Promise<void> | null => {
		if (!consentPending()) {
			return null;
		}
		settled ??= new Promise((resolve) => {
			settle = resolve;
		});
		return settled;
	};
	const releaseWaiting = (): void => {
		if (settle && !consentPending()) {
			settle();
			settle = null;
			settled = null;
		}
	};

	let lastVendors: unknown = snapshot.vendors;
	const declareMissingVendors = (next: ConsentSnapshot): void => {
		const declared = new Set(next.vendors?.declared.map((vendor) => vendor.id));
		if (rules.some((rule) => rule.vendor && !declared.has(rule.vendor))) {
			declareOwners(kernel, rules, ownerSource);
		}
	};

	const unsubscribe = kernel.subscribe((next) => {
		snapshot = next;
		releaseWaiting();
		if (next.vendors !== lastVendors) {
			lastVendors = next.vendors;
			declareMissingVendors(next);
		}
	});

	const hasBrowserAPIs =
		typeof window !== 'undefined' &&
		typeof XMLHttpRequest !== 'undefined' &&
		typeof window.fetch === 'function';

	if (!hasBrowserAPIs) {
		return {
			dispose() {
				unsubscribe();
				forgetOwners(kernel, ownerSource);
			},
			setEnabled(v) {
				enabled = v;
			},
			updateRules(next) {
				rules = [...next];
				registerCategories();
			},
		};
	}

	const notifyBlocked = function notifyBlocked(info: BlockedRequestInfo): void {
		if (logBlocked) {
			// oxlint-disable-next-line no-console -- user-configurable warning
			console.warn(
				`[c15t] blocked ${info.method} ${info.url}${
					info.rule?.id ? ` (rule: ${info.rule.id})` : ''
				}`
			);
		}
		if (onRequestBlocked) {
			try {
				onRequestBlocked(info);
			} catch {
			}
		}
	};

	const patchDeps = {
		getRules: () => rules,
		getSnapshot: () => snapshot,
		isEnabled: () => enabled,
		notifyBlocked,
		tools,
		whenSettled,
	};

	const replayHeld = options.hold ? options.hold.release() : releaseHolds();
	const uninstallFetch = installFetchPatch(patchDeps);
	const uninstallXhr = installXhrPatch(patchDeps);
	replayHeld();

	return {
		dispose() {
			disposed = true;
			releaseWaiting();
			unsubscribe();
			uninstallFetch();
			uninstallXhr();
			forgetOwners(kernel, ownerSource);
		},
		setEnabled(v) {
			enabled = v;
			releaseWaiting();
		},
		updateRules(next, hold) {
			rules = [...next];
			registerCategories();
			hold?.release()();
		},
	};
};
