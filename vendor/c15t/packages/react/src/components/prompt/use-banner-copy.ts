'use client';

import { resolvePromptCopy } from '@c15t/core';
import { useMemo } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { usePolicyRule } from '~/hooks';

export const useBannerCopy = function useBannerCopy(): {
	title: string;
	description: string;
	prompt: 'choice' | 'notice' | 'none';
} {
	const translations = useTranslations();
	const { prompt } = usePolicyRule();
	return useMemo(
		() => ({ ...resolvePromptCopy(translations, prompt), prompt }),
		[translations, prompt]
	);
};
