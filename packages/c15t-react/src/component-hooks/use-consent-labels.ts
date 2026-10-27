'use client';

import type { PreferenceControl, PresentationAction } from '@c15t/core';
import {
	resolveActionLabels,
	resolvePreferenceControlLabels,
} from '@c15t/core';
import { useMemo } from 'react';

import { useTranslations } from './use-translations';

export interface ConsentLabels {
	actions: Record<PresentationAction, string>;
	preferenceControls: Record<PreferenceControl, string>;
}

export const useConsentLabels = function useConsentLabels(): ConsentLabels {
	const translations = useTranslations();
	return useMemo(
		() => ({
			actions: resolveActionLabels(translations),
			preferenceControls: resolvePreferenceControlLabels(translations),
		}),
		[translations]
	);
};
