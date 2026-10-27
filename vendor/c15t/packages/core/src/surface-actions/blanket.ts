import type { ConsentKernel, SaveResult } from '../types';
import { saveIABConsentSurface } from './iab-save';
import { saveConsentSurface } from './save';

export interface ConsentSurfaceIAB {
	acceptAll: () => void;
	rejectAll: () => void;
	save: () => Promise<void>;
}

export const saveConsentBlanket = (
	kernel: ConsentKernel,
	choice: 'all' | 'none',
	iab?: ConsentSurfaceIAB | null
): Promise<SaveResult> => {
	const snapshot = kernel.getSnapshot();
	if (snapshot.policyRule.model !== 'iab' || snapshot.iab?.enabled === false) {
		return saveConsentSurface(kernel, () => kernel.commands.save(choice));
	}
	return iab
		? saveIABConsentSurface(kernel, () => {
				iab[choice === 'all' ? 'acceptAll' : 'rejectAll']();
				return iab.save();
			})
		: Promise.resolve({ ok: false });
};
