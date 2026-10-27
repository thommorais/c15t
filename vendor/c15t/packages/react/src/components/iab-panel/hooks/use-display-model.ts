'use client';

import { resolveIABDialogDisplayModel } from '@c15t/iab/headless';
import type { HeadlessIABDialogDisplayModel } from '@c15t/iab/headless';
import { useMemo } from 'react';

import { useIAB } from '~/iab-context';

export type IABDisplayModel = HeadlessIABDialogDisplayModel;

export const useIABDisplayModel =
	function useIABDisplayModel(): IABDisplayModel {
		const iabState = useIAB();

		return useMemo(() => resolveIABDialogDisplayModel(iabState), [iabState]);
	};
