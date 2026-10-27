'use client';

import { processGVLForDialog } from '@c15t/iab/headless';
import type { HeadlessIABDialogData } from '@c15t/iab/headless';
import { useMemo } from 'react';

import { useTranslations } from '~/hooks';
import { useIAB } from '~/iab-context';

export type GVLData = HeadlessIABDialogData;

export const useGVLData = function useGVLData(): GVLData {
	const iabState = useIAB();
	const language = useTranslations()?.language;

	return useMemo(
		() => processGVLForDialog(iabState && { ...iabState, language }),
		[iabState, language]
	);
};
