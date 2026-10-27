'use client';

import {
	allConsentNames,
	getEffectiveGateState,
	has,
	isVendorDenied,
} from '@c15t/core';
import type {
	AllConsentNames,
	ConsentKernel,
	ConsentSnapshot,
} from '@c15t/core';
import type {
	IframeBlockerHandle,
	IframeBlockerOptions,
} from '@c15t/core/modules/iframe-blocker';
import { useEffect, useRef, useState } from 'react';

import { useRequiredKernel } from './shared';

const loadIframeBlockerModule = () =>
	import('@c15t/core/modules/iframe-blocker');

export interface UseIframeBlockerOptions {
	disableAutomaticBlocking?: boolean;
}

export const useIframeBlocker = function useIframeBlocker(
	options: UseIframeBlockerOptions = {}
): IframeBlockerHandle {
	const kernel = useRequiredKernel();
	const handleRef = useRef<IframeBlockerHandle | null>(null);

	const [handle, setHandle] = useState<IframeBlockerHandle>(() => ({
		dispose() {
			handleRef.current?.dispose();
			handleRef.current = null;
		},
		processAllIframes() {
			handleRef.current?.processAllIframes();
		},
	}));
	void setHandle;

	useEffect(() => {
		let disposed = false;
		void (async () => {
			const { createIframeBlocker } = await loadIframeBlockerModule();
			if (disposed) {
				return;
			}
			const created = createIframeBlocker({
				disableAutomaticBlocking: options.disableAutomaticBlocking,
				kernel,
			});
			handleRef.current = created;
		})();

		return () => {
			disposed = true;
			handleRef.current?.dispose();
			handleRef.current = null;
		};
	}, [kernel, options.disableAutomaticBlocking]);

	return handle;
};

const GATED_IFRAME = 'iframe[data-category], iframe[data-vendor]';

const PAUSED_ATTRIBUTE = 'data-c15t-paused';

const isIframe = function isIframe(node: Node): node is HTMLIFrameElement {
	try {
		return (
			node.nodeType === 1 &&
			(node as Element).tagName.toUpperCase() === 'IFRAME'
		);
	} catch {
		return false;
	}
};

const isVendorTurnedOff = function isVendorTurnedOff(
	snapshot: ConsentSnapshot,
	vendor: string
): boolean {
	if (!snapshot.vendorChoice?.denied.includes(vendor)) {
		return false;
	}
	const declared = snapshot.vendors?.declared.some(
		(entry) => entry.id === vendor
	);
	return declared ? isVendorDenied(snapshot, vendor) : true;
};

const isClearlyAllowed = function isClearlyAllowed(
	iframe: HTMLIFrameElement,
	kernel: ConsentKernel
): boolean {
	const snapshot = kernel.getSnapshot();
	const category = iframe.getAttribute('data-category');
	if (category !== null) {
		if (!allConsentNames.includes(category as AllConsentNames)) {
			return false;
		}
		const { effectivePermissions } = getEffectiveGateState(snapshot);
		if (!has(category as AllConsentNames, effectivePermissions)) {
			return false;
		}
	}
	const vendor = iframe.getAttribute('data-vendor');
	if (!vendor || snapshot.model === 'iab') {
		return true;
	}
	return !isVendorTurnedOff(snapshot, vendor);
};

const holdIframe = function holdIframe(
	iframe: HTMLIFrameElement,
	kernel: ConsentKernel
): void {
	const src = iframe.getAttribute('src');
	if (!(src && iframe.matches(GATED_IFRAME))) {
		return;
	}
	if (isClearlyAllowed(iframe, kernel)) {
		return;
	}
	if (!iframe.hasAttribute('data-src')) {
		iframe.setAttribute('data-src', src);
	}
	iframe.removeAttribute('src');
	iframe.setAttribute(PAUSED_ATTRIBUTE, '');
};

const isGatedIframe = function isGatedIframe(
	iframe: HTMLIFrameElement
): boolean {
	try {
		return iframe.matches(GATED_IFRAME);
	} catch {
		return false;
	}
};

const collectIframes = function collectIframes(
	mutations: MutationRecord[]
): HTMLIFrameElement[] {
	const found = new Set<HTMLIFrameElement>();
	for (const mutation of mutations) {
		if (mutation.type === 'attributes' && isIframe(mutation.target)) {
			found.add(mutation.target);
		}
		for (const node of Array.from(mutation.addedNodes)) {
			if (isIframe(node)) {
				found.add(node);
				continue;
			}
			try {
				if (node.nodeType === 1) {
					for (const iframe of Array.from(
						(node as Element).querySelectorAll('iframe')
					)) {
						found.add(iframe);
					}
				}
			} catch {
			}
		}
	}
	return [...found].filter(isGatedIframe);
};

export const watchGatedIframes = function watchGatedIframes(
	kernel: ConsentKernel,
	onFound: () => void
): () => void {
	if (typeof document === 'undefined' || !document.body) {
		onFound();
		return () => {
		};
	}
	if (document.querySelector(GATED_IFRAME)) {
		onFound();
	}
	const observer = new MutationObserver((mutations) => {
		const iframes = collectIframes(mutations);
		if (iframes.length === 0) {
			return;
		}
		for (const iframe of iframes) {
			try {
				holdIframe(iframe, kernel);
			} catch {
			}
		}
		onFound();
	});
	observer.observe(document.body, {
		attributeFilter: ['data-category', 'data-vendor', 'src'],
		attributes: true,
		childList: true,
		subtree: true,
	});
	return () => observer.disconnect();
};

export const createIframeBlockerOnDemand =
	function createIframeBlockerOnDemand({
		disableAutomaticBlocking,
		kernel,
	}: IframeBlockerOptions): IframeBlockerHandle {
		let disposed = false;
		let blocker: IframeBlockerHandle | null = null;
		let loading = false;
		let stopWatching = () => {
		};
		const load = () => {
			if (loading) {
				return;
			}
			loading = true;
			void (async () => {
				let loaded: Awaited<ReturnType<typeof loadIframeBlockerModule>>;
				try {
					loaded = await loadIframeBlockerModule();
				} catch {
					loading = false;
					return;
				}
				if (disposed) {
					return;
				}
				stopWatching();
				blocker = loaded.createIframeBlocker({
					disableAutomaticBlocking,
					kernel,
				});
			})();
		};
		if (disableAutomaticBlocking) {
			load();
		} else {
			stopWatching = watchGatedIframes(kernel, load);
		}
		return {
			dispose() {
				disposed = true;
				stopWatching();
				blocker?.dispose();
				blocker = null;
			},
			processAllIframes() {
				blocker?.processAllIframes();
			},
		};
	};

export type { IframeBlockerHandle };
