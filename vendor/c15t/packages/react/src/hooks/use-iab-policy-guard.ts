import { IABUnavailableError, policyNeedsIAB } from '@c15t/core';
import { useContext } from 'react';

import { IABContext } from '~/context/iab-context-value';
import { useKernelSelector } from '~/kernel-selector';

const IAB_PROVIDER_LOADED = Symbol.for('c15t.react.iab-provider');

export const markIABProviderLoaded = function markIABProviderLoaded(): void {
	(globalThis as Record<symbol, unknown>)[IAB_PROVIDER_LOADED] = true;
};

export const missingIABProviderError =
	function missingIABProviderError(): IABUnavailableError {
		return new IABUnavailableError(
			'no <IABProvider> is mounted',
			"Wrap your IAB consent UI in <IABProvider> from '@c15t/react/iab' (or 'c15t/react/iab')"
		);
	};

export const useIABPolicyGuard = function useIABPolicyGuard(): void {
	const iab = useContext(IABContext);
	const needsIAB = useKernelSelector(policyNeedsIAB);
	if (
		needsIAB &&
		iab === null &&
		(globalThis as Record<symbol, unknown>)[IAB_PROVIDER_LOADED] !== true
	) {
		throw missingIABProviderError();
	}
};
