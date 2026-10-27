'use client';

import { getTextDirection, setupTextDirection } from '@c15t/ui/utils';
import { useEffect, useMemo } from 'react';

export const useTextDirection = function useTextDirection(language?: string) {
	const textDirection = useMemo(() => getTextDirection(language), [language]);

	useEffect(() => setupTextDirection(language), [language]);

	return textDirection;
};
