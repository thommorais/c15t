'use client';

import type { SaveUISource } from '@c15t/core';
import { createContext, useContext } from 'react';

export interface ConsentTrackingValue {
	uiSource?: string;
}

export const ConsentTrackingContext = createContext<ConsentTrackingValue>({});

export const useConsentTracking = () => useContext(ConsentTrackingContext);

export const toSaveUISource = function toSaveUISource(
	value: string | undefined
): SaveUISource | undefined {
	return value === 'banner' ||
		value === 'dialog' ||
		value === 'widget' ||
		value === 'none'
		? value
		: undefined;
};
