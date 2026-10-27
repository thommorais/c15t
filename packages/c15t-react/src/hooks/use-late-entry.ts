'use client';

import { isLateEntry } from '@c15t/ui/utils/late-entry';
import { useState } from 'react';

import { useIsHydrated } from './use-is-hydrated';

interface Entry {
	shown: boolean;
	late: boolean;
}

export const useLateEntry = function useLateEntry(shown: boolean): boolean {
	const clientRender = useIsHydrated();
	const decide = (): Entry => ({
		late: shown && clientRender && isLateEntry(),
		shown,
	});
	const [entry, setEntry] = useState(decide);
	if (entry.shown !== shown) {
		const next = decide();
		setEntry(next);
		return next.late;
	}
	return entry.late;
};
