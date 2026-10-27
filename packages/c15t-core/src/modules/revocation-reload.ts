import type {
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	Unsubscribe,
} from '../types';
import { evaluateConsent } from './has';

export interface RevocationReloadOptions {
	kernel: ConsentKernel;
	isEnabled?: () => boolean;
	getOnBeforeReload?: () =>
		| ((payload: { preferences: ConsentState }) => void)
		| undefined;
	reload?: () => void;
}

const reloadWindow = function reloadWindow(): void {
	window.location.reload();
};

const hasRevokedCategory = function hasRevokedCategory(
	before: Readonly<ConsentState>,
	after: Readonly<ConsentState>
): boolean {
	for (const [category, granted] of Object.entries(before)) {
		if (
			category !== 'necessary' &&
			granted &&
			after[category as keyof ConsentState] === false
		) {
			return true;
		}
	}
	return false;
};

export const hasRevokedPermission = function hasRevokedPermission(
	before: ConsentSnapshot,
	after: ConsentSnapshot
): boolean {
	if (
		hasRevokedCategory(before.effectivePermissions, after.effectivePermissions)
	) {
		return true;
	}
	if (after.model === 'iab' || after.vendorChoice === before.vendorChoice) {
		return false;
	}
	const now = Date.now();
	for (const vendor of after.vendors?.declared ?? []) {
		const target = { category: vendor.category, vendor: vendor.id };
		try {
			if (
				evaluateConsent(target, before, now) &&
				!evaluateConsent(target, after, now)
			) {
				return true;
			}
		} catch {
		}
	}
	return false;
};

export const watchRevocationReload = function watchRevocationReload({
	kernel,
	isEnabled = () => true,
	getOnBeforeReload,
	reload = reloadWindow,
}: RevocationReloadOptions): Unsubscribe {
	let savesInFlight = 0;
	let saveStartSnapshot: ConsentSnapshot | null = null;
	let revoked = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const onRecorded = ({ snapshot }: { snapshot: ConsentSnapshot }) => {
		if (
			saveStartSnapshot &&
			hasRevokedPermission(saveStartSnapshot, snapshot)
		) {
			revoked = true;
		}
	};

	const scheduleReload = () => {
		if (savesInFlight > 0 || !revoked || timer !== null) {
			return;
		}
		if (typeof window === 'undefined' || !isEnabled()) {
			revoked = false;
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			const preferences = kernel.getSnapshot().effectivePermissions;
			revoked = false;
			getOnBeforeReload?.()?.({ preferences: { ...preferences } });
			reload();
		}, 0);
	};

	const subscriptions = [
		kernel.events.on('command:save:started', () => {
			savesInFlight += 1;
			saveStartSnapshot = kernel.getSnapshot();
		}),
		kernel.events.on('choice:recorded', onRecorded),
		kernel.events.on('vendors:recorded', onRecorded),
		kernel.events.on('command:save:completed', () => {
			savesInFlight = Math.max(0, savesInFlight - 1);
			scheduleReload();
		}),
		kernel.events.on('permissions:changed', ({ previous, snapshot }) => {
			if (
				snapshot.externalPermissions &&
				hasRevokedCategory(previous, snapshot.effectivePermissions)
			) {
				revoked = true;
				scheduleReload();
			}
		}),
	];

	return () => {
		for (const unsubscribe of subscriptions) {
			unsubscribe();
		}
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};
};
