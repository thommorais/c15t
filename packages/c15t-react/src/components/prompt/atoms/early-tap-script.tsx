'use client';

import {
	EARLY_CONSENT_TAP_SCRIPT,
	replayEarlyConsentTaps,
} from '@c15t/core/surface-actions';
import {
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';

import { ProviderServicesContext } from '~/context';
import {
	toSaveUISource,
	useConsentTracking,
} from '~/context/consent-tracking-context';
import { useCommittedRef } from '~/hooks/use-committed-ref';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';

const useBrowserLayoutEffect =
	typeof document === 'undefined' ? useEffect : useLayoutEffect;

export const EarlyTapScript = () => {
	const { nonce } = useUIConfig();
	const hydrated = useIsHydrated();
	// oxlint-disable-next-line react/hook-use-state -- Read once, at mount.
	const [serverRendered] = useState(!hydrated);
	const kernel = useKernel();
	const uiSource = toSaveUISource(useConsentTracking().uiSource);
	const services = useCommittedRef(useContext(ProviderServicesContext));
	const script = useRef<HTMLScriptElement>(null);
	const view = useRef<Window | null>(null);
	useBrowserLayoutEffect(() => {
		view.current = script.current?.ownerDocument.defaultView ?? null;
	}, []);
	useEffect(
		() =>
			replayEarlyConsentTaps(kernel, {
				categories: () => services.current?.getConsentCategories(),
				started: () => services.current?.isStarted() ?? true,
				uiSource,
				view: view.current,
			}),
		[kernel, services, uiSource]
	);
	if (!serverRendered) {
		return null;
	}
	return (
		<script
			ref={script}
			nonce={nonce}
			// oxlint-disable-next-line react/no-danger -- c15t's own build-time script.
			dangerouslySetInnerHTML={{ __html: EARLY_CONSENT_TAP_SCRIPT }}
		/>
	);
};
