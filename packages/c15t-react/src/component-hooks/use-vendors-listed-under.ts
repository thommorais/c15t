'use client';

import type { AllConsentNames, ResolvedVendor } from '@c15t/core';
import { deniedVendorIds, vendorsListedUnder } from '@c15t/core';
import { useMemo } from 'react';

import { useDeclaredVendors, useVendorChoice } from '~/hooks';

export const useVendorsListedUnder = function useVendorsListedUnder(
	category: AllConsentNames
): ResolvedVendor[] {
	const declared = useDeclaredVendors();
	const vendorChoice = useVendorChoice();
	return useMemo(
		() =>
			vendorsListedUnder(
				declared,
				category,
				deniedVendorIds({
					vendorChoice,
					vendors: { declared, listVersion: null },
				})
			),
		[declared, category, vendorChoice]
	);
};
