import type { AllConsentNames } from '../../consent/consent-types';
import { allConsentNames } from '../../consent/consent-types';
import type { ConsentSnapshot, ConsentState } from '../../types';
import { deniedVendorIds, getEffectiveGateState, has } from '../has';

export interface ReconcilePass {
	consents: ConsentState;
	vendorDenied: ReadonlySet<string> | null;
	storedDenied: ReadonlySet<string> | null;
	declared: ReadonlySet<string>;
	isIabMode: boolean;
}

export const buildReconcilePass = function buildReconcilePass(
	snapshot: ConsentSnapshot
): ReconcilePass {
	const stored = snapshot.vendorChoice?.denied;
	return {
		consents: getEffectiveGateState(snapshot).effectivePermissions,
		declared: new Set(snapshot.vendors?.declared.map((vendor) => vendor.id)),
		isIabMode: snapshot.model === 'iab',
		storedDenied: stored && stored.length > 0 ? new Set(stored) : null,
		vendorDenied: deniedVendorIds(snapshot),
	};
};

export const determineVendor = function determineVendor(
	iframe: HTMLIFrameElement
): string | undefined {
	const raw = iframe.getAttribute('data-vendor');
	return raw ? raw : undefined;
};

export const determineCategory = function determineCategory(
	iframe: HTMLIFrameElement
): AllConsentNames | null | undefined {
	const raw = iframe.getAttribute('data-category');
	if (raw === null) {
		return undefined;
	}
	if (!allConsentNames.includes(raw as AllConsentNames)) {
		return null;
	}
	return raw as AllConsentNames;
};

export const PAUSED_ATTRIBUTE = 'data-c15t-paused';

const restoreSource = function restoreSource(iframe: HTMLIFrameElement): void {
	const dataSrc = iframe.getAttribute('data-src');
	if (!dataSrc) {
		return;
	}
	let source: URL;
	try {
		source = new URL(dataSrc, iframe.ownerDocument.baseURI);
	} catch {
		return;
	}
	if (source.protocol !== 'http:' && source.protocol !== 'https:') {
		return;
	}
	iframe.setAttribute('src', source.href);
	iframe.removeAttribute('data-src');
	iframe.removeAttribute(PAUSED_ATTRIBUTE);
};

export const reconcileIframe = function reconcileIframe(
	iframe: HTMLIFrameElement,
	pass: ReconcilePass
): void {
	const category = determineCategory(iframe);
	const vendor = determineVendor(iframe);
	if (category === undefined && vendor === undefined) {
		if (iframe.getAttribute(PAUSED_ATTRIBUTE) !== null) {
			restoreSource(iframe);
		}
		return;
	}

	let categoryAllowed = true;
	if (category === null) {
		// oxlint-disable-next-line no-console -- config bug the site owner must fix
		console.warn(
			`[c15t] iframe-blocker: invalid data-category "${iframe.getAttribute(
				'data-category'
			)}". Must be one of: ${allConsentNames.join(', ')}. The iframe stays blocked.`
		);
		categoryAllowed = false;
	} else if (category) {
		categoryAllowed = has(category, pass.consents);
	}
	const denied =
		category !== undefined ||
		(vendor !== undefined && pass.declared.has(vendor))
			? pass.vendorDenied
			: pass.storedDenied;
	const vendorAllowed =
		vendor === undefined ||
		pass.isIabMode ||
		denied === null ||
		!denied.has(vendor);
	const allowed = categoryAllowed && vendorAllowed;
	const dataSrc = iframe.getAttribute('data-src');

	if (allowed) {
		if (dataSrc && !iframe.getAttribute('src')) {
			restoreSource(iframe);
		}
		return;
	}

	const src = iframe.getAttribute('src');
	if (!src) {
		return;
	}
	if (!dataSrc) {
		iframe.setAttribute('data-src', src);
	}
	iframe.removeAttribute('src');
	iframe.setAttribute(PAUSED_ATTRIBUTE, '');
};

export const reconcileIframeSafely = function reconcileIframeSafely(
	iframe: HTMLIFrameElement,
	pass: ReconcilePass
): void {
	try {
		reconcileIframe(iframe, pass);
	} catch {
	}
};

export const reconcileAllIframes = function reconcileAllIframes(
	snapshot: ConsentSnapshot
): void {
	const iframes = document.querySelectorAll('iframe');
	const pass = buildReconcilePass(snapshot);
	for (const iframe of Array.from(iframes) as HTMLIFrameElement[]) {
		reconcileIframeSafely(iframe, pass);
	}
};
