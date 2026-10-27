'use client';

import type { AllConsentNames } from '@c15t/core';
import type { RuntimeGPPOptions } from '@c15t/core/runtime';
import { createGPP } from '@c15t/iab/gpp';
import { useContext, useEffect } from 'react';

import { KernelContext } from './context';

export type ConsentGPPProps = RuntimeGPPOptions;

export const ConsentGPP = ({
	cmpId,
	mspaMode,
	optOutCategories,
	tcf,
	usApproach,
	usFallback,
}: ConsentGPPProps): null => {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error(
			'c15t: ConsentGPP must be rendered inside <ConsentProvider> from @c15t/react.'
		);
	}
	const categories = optOutCategories?.join(',');

	useEffect(() => {
		let handle: ReturnType<typeof createGPP> | null = null;
		try {
			handle = createGPP({
				cmpId,
				kernel,
				mspaMode,
				optOutCategories: categories?.split(',') as
					| AllConsentNames[]
					| undefined,
				tcf,
				usApproach,
				usFallback,
			});
		} catch (error) {
			// oxlint-disable-next-line no-console -- Integration diagnostic.
			console.error('c15t: GPP was not installed.', error);
		}
		return () => handle?.dispose();
	}, [categories, cmpId, kernel, mspaMode, tcf, usApproach, usFallback]);

	return null;
};
