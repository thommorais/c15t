import type { IABHandle, CreateIABOptions } from '@c15t/iab';
import { createContext } from 'react';

export interface IABContextValue {
	handle: IABHandle | null;
	filtered?: boolean;
	customVendors?: CreateIABOptions['customVendors'];
	run?: (action: (handle: IABHandle) => void | Promise<void>) => Promise<void>;
	tab: 'purposes' | 'vendors';
	setTab: (tab: 'purposes' | 'vendors') => void;
}

export const IABContext = createContext<IABContextValue | null>(null);
IABContext.displayName = 'C15tIABContext';
