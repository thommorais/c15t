import type { AllConsentNames } from '../../consent/consent-types';
import { declareOwnedVendors, forgetOwnedVendors } from '../../libs/vendors';
import type { VendorOwner } from '../../libs/vendors';
import {
	buildReconcilePass,
	determineCategory,
	determineVendor,
	reconcileAllIframes,
	reconcileIframeSafely,
} from './reconcile';
import type { IframeBlockerHandle, IframeBlockerOptions } from './types';

export type { IframeBlockerHandle, IframeBlockerOptions } from './types';

const isIframe = function isIframe(node: Node): node is HTMLIFrameElement {
	try {
		return (
			node.nodeType === 1 &&
			(node as Element).tagName?.toUpperCase() === 'IFRAME'
		);
	} catch {
		return false;
	}
};

const addIframes = function addIframes(
	node: Node,
	into: Set<HTMLIFrameElement>
): void {
	if (isIframe(node)) {
		into.add(node);
	}
	try {
		if (node.nodeType !== 1) {
			return;
		}
		for (const iframe of Array.from(
			(node as Element).querySelectorAll?.('iframe') ?? []
		)) {
			into.add(iframe);
		}
	} catch {
	}
};

interface IframeGate {
	category: AllConsentNames | null | undefined;
	isConnected: boolean;
	vendor: string | undefined;
}

const readGate = function readGate(
	iframe: HTMLIFrameElement
): IframeGate | null {
	try {
		return {
			category: determineCategory(iframe),
			isConnected: iframe.isConnected !== false,
			vendor: determineVendor(iframe),
		};
	} catch {
		return null;
	}
};

export const createIframeBlocker = function createIframeBlocker(
	options: IframeBlockerOptions
): IframeBlockerHandle {
	const { kernel } = options;
	const disableAuto = options.disableAutomaticBlocking === true;

	const hasDom =
		typeof document !== 'undefined' && typeof MutationObserver !== 'undefined';

	if (!hasDom) {
		const unsubscribe = kernel.subscribe(() => {
		});
		return {
			dispose() {
				unsubscribe();
			},
			processAllIframes() {
			},
		};
	}

	const ownerSource = Symbol('iframe-blocker');
	const framed = new Map<HTMLIFrameElement, VendorOwner>();
	const ownerKey = (owner: VendorOwner) =>
		`${owner.vendor}\u0000${JSON.stringify(owner.category)}`;
	const currentOwners = () => {
		const seen = new Map<string, VendorOwner>();
		for (const owner of framed.values()) {
			seen.set(ownerKey(owner), owner);
		}
		return [...seen.values()];
	};
	const registerIframes = (iframes: Iterable<HTMLIFrameElement>) => {
		const list = Array.from(iframes).flatMap((iframe) => {
			const gate = readGate(iframe);
			return gate ? [{ ...gate, iframe }] : [];
		});
		kernel.set.registerConsentCategories(
			list.flatMap(({ category }) => (category ? [category] : []))
		);
		const before = new Set(currentOwners().map(ownerKey));
		for (const { category, iframe, isConnected, vendor } of list) {
			if (vendor && category && isConnected) {
				framed.set(iframe, { category, vendor });
			} else {
				framed.delete(iframe);
			}
		}
		for (const iframe of [...framed.keys()]) {
			const gate = readGate(iframe);
			if (gate && !(gate.isConnected && gate.vendor && gate.category)) {
				framed.delete(iframe);
			}
		}
		const owners = currentOwners();
		const changed =
			owners.length !== before.size ||
			owners.some((owner) => !before.has(ownerKey(owner)));
		const declaredIds = new Set(
			kernel.getSnapshot().vendors?.declared.map((vendor) => vendor.id)
		);
		const missing = owners.some(
			(owner) => owner.vendor && !declaredIds.has(owner.vendor)
		);
		if (changed || missing) {
			declareOwnedVendors(kernel, owners, ownerSource);
		}
	};

	const observer = new MutationObserver((mutations) => {
		const iframes = new Set<HTMLIFrameElement>();
		for (const mutation of mutations) {
			if (mutation.type === 'attributes' && isIframe(mutation.target)) {
				iframes.add(mutation.target);
			}
			for (const node of Array.from(mutation.addedNodes)) {
				addIframes(node, iframes);
			}
			for (const node of Array.from(mutation.removedNodes ?? [])) {
				addIframes(node, iframes);
			}
		}
		if (iframes.size === 0) {
			return;
		}
		registerIframes(iframes);
		const pass = buildReconcilePass(kernel.getSnapshot());
		for (const iframe of iframes) {
			reconcileIframeSafely(iframe, pass);
		}
	});

	const processAll = function processAll(): void {
		registerIframes(
			document.querySelectorAll<HTMLIFrameElement>(
				'iframe[data-category], iframe[data-vendor]'
			)
		);
		reconcileAllIframes(kernel.getSnapshot());
	};

	if (!disableAuto) {
		processAll();
		const root = document.documentElement ?? document.body;
		if (root) {
			observer.observe(root, {
				attributeFilter: ['data-category', 'data-vendor'],
				attributes: true,
				childList: true,
				subtree: true,
			});
		}
	}

	let lastConsents: unknown = null;
	let lastPolicyCategories: unknown = null;
	let lastScopeMode: unknown = null;
	let lastVendorChoice: unknown = null;
	let lastVendors: unknown = null;
	let lastModel: unknown = null;
	const unsubscribe = kernel.subscribe((snapshot) => {
		if (disableAuto) {
			return;
		}
		if (
			snapshot.effectivePermissions === lastConsents &&
			snapshot.policyRule.scope === lastPolicyCategories &&
			snapshot.policyRule.scopeMode === lastScopeMode &&
			snapshot.vendorChoice === lastVendorChoice &&
			snapshot.vendors === lastVendors &&
			snapshot.model === lastModel
		) {
			return;
		}
		lastConsents = snapshot.effectivePermissions;
		lastPolicyCategories = snapshot.policyRule.scope;
		lastScopeMode = snapshot.policyRule.scopeMode;
		lastVendorChoice = snapshot.vendorChoice;
		lastVendors = snapshot.vendors;
		lastModel = snapshot.model;
		processAll();
	});

	return {
		dispose() {
			observer.disconnect();
			unsubscribe();
			forgetOwnedVendors(kernel, ownerSource);
		},
		processAllIframes: processAll,
	};
};
