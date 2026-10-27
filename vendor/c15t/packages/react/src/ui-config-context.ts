'use client';

import type {
	ConsentExperiment,
	ConsentPresentation,
	LegalLinks,
} from '@c15t/core';
import { createContext, useContext } from 'react';

import type { DialogPreload } from '~/chunk-warming';
import type { ReactComponentSlots } from '~/types/slots';
import type { Theme } from '~/types/theme';

export interface V3UIConfigValue {
	components?: ReactComponentSlots;
	presentation?: ConsentPresentation;
	experiment?: ConsentExperiment;
	theme?: Theme;
	legalLinks?: LegalLinks;
	preloadDialog?: DialogPreload;
	nonce?: string;
	styles?: boolean;
}

export const V3UIConfigContext = createContext<V3UIConfigValue>({});
V3UIConfigContext.displayName = 'C15tV3UIConfigContext';

export const useUIConfig = function useUIConfig() {
	return useContext(V3UIConfigContext);
};
