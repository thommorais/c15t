'use client';

import type { PromptPosition, PromptVariant } from '@c15t/core';
import { createContext, useContext } from 'react';

export interface ConsentBannerSurface {
	variant: PromptVariant;
	position: PromptPosition;
	positionSource: 'host' | 'default';
	blocking: boolean;
}

export const DEFAULT_CONSENT_BANNER_SURFACE: ConsentBannerSurface = {
	blocking: false,
	position: 'bottom-left',
	positionSource: 'default',
	variant: 'floating',
};

export const ConsentBannerSurfaceContext = createContext<ConsentBannerSurface>(
	DEFAULT_CONSENT_BANNER_SURFACE
);

export const useConsentBannerSurface =
	function useConsentBannerSurface(): ConsentBannerSurface {
		return useContext(ConsentBannerSurfaceContext);
	};
