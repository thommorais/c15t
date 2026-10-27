'use client';

import { getTextDirection } from '@c15t/ui/utils';

import { useTranslationLanguage } from '~/kernel-selector';

export const useConsentTextDirection = function useConsentTextDirection() {
	return getTextDirection(useTranslationLanguage());
};
