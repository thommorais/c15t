import type { AllConsentNames } from '../consent/consent-types';
import type { ConsentKernel, ConsentSnapshot, SaveUISource } from '../types';
import {
	EARLY_TAP_ROOT,
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from './early-tap-script';
import type { EarlyConsentTap, EarlyConsentTapQueue } from './early-tap-script';
import { showConsentSurface } from './rules';
import { saveConsentSurface } from './save';

const LEAVE_TIMEOUT_MS = 3000;

const pickTap = (
	taps: readonly EarlyConsentTap[]
): EarlyConsentTap | undefined =>
	taps.findLast((tap) => tap.action !== 'customize') ?? taps.at(-1);

const stillApplies = (
	tap: EarlyConsentTap,
	snapshot: ConsentSnapshot
): boolean =>
	snapshot.resolution.status === 'matched' &&
	!snapshot.externalPermissions &&
	snapshot.model !== 'iab' &&
	(tap.model === null ||
		tap.model === snapshot.policyRule.model ||
		tap.model === snapshot.model) &&
	(tap.prompt === null || tap.prompt === snapshot.policyRule.prompt);

const unhide = (view: Window): void => {
	view.document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
};

const unhideWhenGone = (kernel: ConsentKernel, view: Window): void => {
	const roots = [...view.document.querySelectorAll(EARLY_TAP_ROOT)];
	const deadline = Date.now() + LEAVE_TIMEOUT_MS;
	const check = () => {
		if (
			kernel.getSnapshot().activeUI === 'banner' ||
			roots.every((root) => !root.isConnected) ||
			Date.now() > deadline
		) {
			unhide(view);
			return;
		}
		view.requestAnimationFrame(check);
	};
	view.requestAnimationFrame(check);
};

const apply = (
	kernel: ConsentKernel,
	tap: EarlyConsentTap,
	view: Window,
	options: EarlyConsentTapReplayOptions
): void => {
	if (!stillApplies(tap, kernel.getSnapshot())) {
		unhide(view);
		return;
	}
	if (tap.action === 'customize') {
		showConsentSurface(kernel, 'dialog');
		unhide(view);
		return;
	}
	if (tap.action === 'dismiss') {
		void kernel.commands.dismissNotice({ actionAt: tap.at });
	} else {
		void saveConsentSurface(kernel, () =>
			kernel.commands.save(tap.action === 'accept' ? 'all' : 'none', {
				actionAt: tap.at,
				categories: options.categories?.(),
				uiSource: options.uiSource ?? 'banner',
			})
		);
	}
	unhideWhenGone(kernel, view);
};

export interface EarlyConsentTapReplayOptions {
	started: () => boolean;
	categories?: () => readonly AllConsentNames[] | undefined;
	view?: Window | null;
	uiSource?: SaveUISource;
}

export const replayEarlyConsentTaps = (
	kernel: ConsentKernel,
	options: EarlyConsentTapReplayOptions
): (() => void) => {
	const view = options.view ?? window;
	const host = view as unknown as Record<string, EarlyConsentTapQueue>;
	const queue = host[EARLY_TAPS_WINDOW_KEY];
	host[EARLY_TAPS_WINDOW_KEY] = {};
	queue?.stop?.();
	const taps = queue?.taps ?? [];
	const tap = pickTap(taps);
	if (!tap) {
		unhide(view);
		return () => undefined;
	}
	const stops: (() => void)[] = [];
	const settle = () => {
		if (stops.length === 0 || !options.started()) {
			return;
		}
		const { policyPending, resolution } = kernel.getSnapshot();
		if (policyPending) {
			if (resolution.status === 'failed') {
				unhide(view);
			}
			return;
		}
		for (const stop of stops.splice(0)) {
			stop();
		}
		apply(kernel, tap, view, options);
	};
	const recheck = () => queueMicrotask(settle);
	stops.push(
		kernel.subscribe(recheck),
		kernel.events.on('init:applied', recheck)
	);
	settle();
	return () => {
		if (stops.length > 0) {
			for (const stop of stops.splice(0)) {
				stop();
			}
			host[EARLY_TAPS_WINDOW_KEY] = { taps };
		}
	};
};
