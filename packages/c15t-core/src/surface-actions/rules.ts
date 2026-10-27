import { deriveActiveUI } from '../derive-surface';
import type { ConsentKernel, ConsentSnapshot, KernelActiveUI } from '../types';

export const actions = new WeakMap<ConsentKernel, object>();

export const isOpen = (surface: KernelActiveUI): boolean =>
	surface === 'banner' || surface === 'dialog';

export const beginAction = (kernel: ConsentKernel): object => {
	const action = {};
	actions.set(kernel, action);
	return action;
};

export const hasConsentUI = (snapshot: ConsentSnapshot): boolean =>
	!snapshot.externalPermissions &&
	snapshot.resolution.status === 'matched' &&
	(snapshot.policyRule.prompt !== 'none' ||
		snapshot.policyRule.rights.length > 0);

export const hasConsentPreferences = (snapshot: ConsentSnapshot): boolean =>
	Boolean(snapshot.externalPermissions) || hasConsentUI(snapshot);

export const showConsentSurface = (
	kernel: ConsentKernel,
	surface: KernelActiveUI
): void => {
	beginAction(kernel);
	const snapshot = kernel.getSnapshot();
	kernel.set.activeUI(
		isOpen(surface) || snapshot.activeUI !== 'dialog'
			? surface
			: deriveActiveUI(snapshot)
	);
};
