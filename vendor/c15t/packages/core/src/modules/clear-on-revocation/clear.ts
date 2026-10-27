import type { OptionalConsentCategory } from '../../consent-record/types';
import { clearTargets } from './targets';
import type {
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
	ClearOnRevocationTools,
} from './types';

export const createClearOnRevocationWith = (
	options: ClearOnRevocationOptions,
	tools: ClearOnRevocationTools
): ClearOnRevocationHandle => {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return {
			dispose() {
			},
		};
	}
	const { kernel, config, storageConfig } = options;
	const { gateState, storageKey } = tools;
	const protectedKeys = new Set([
		...tools.protectedStorageKeys,
		'c15t-iab-authority-v1',
		'euconsent-v2',
	]);
	for (const key of [storageKey, storageConfig?.storageKey || storageKey]) {
		for (const resolved of Object.values(
			tools.resolveStorageKeys({ storageKey: key })
		)) {
			if (resolved) {
				protectedKeys.add(resolved);
			}
		}
		protectedKeys.add(`${key}-privacy`);
	}
	const previous = new Map<OptionalConsentCategory, boolean>();
	const reconcile = (): void => {
		const snapshot = kernel.getSnapshot();
		if (snapshot.policyPending) {
			return;
		}
		const { effectivePermissions } = gateState(snapshot);
		for (const category of tools.optionalConsentCategories) {
			const targets = config[category];
			if (!targets) {
				continue;
			}
			const granted = effectivePermissions[category] === true;
			const wasGranted = previous.get(category);
			previous.set(category, granted);
			if (!granted && wasGranted !== false) {
				clearTargets(targets, protectedKeys);
			}
		}
	};
	const unsubscribe = kernel.subscribe(reconcile);
	reconcile();
	return { dispose: unsubscribe };
};
