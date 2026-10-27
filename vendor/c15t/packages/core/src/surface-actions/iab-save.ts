import type { ConsentKernel, SaveResult } from '../types';
import { actions, beginAction, isOpen } from './rules';

export const saveIABConsentSurface = async (
	kernel: ConsentKernel,
	save: () => Promise<void> | void
): Promise<SaveResult> => {
	const action = beginAction(kernel);
	const before = kernel.getSnapshot();
	const surface = before.activeUI;
	const open = isOpen(surface);
	let recorded = false;
	if (open) {
		kernel.set.activeUI('none');
	}
	try {
		await save();
	} finally {
		const after = kernel.getSnapshot();
		recorded = after.iab?.authority !== before.iab?.authority;
		if (
			open &&
			!recorded &&
			actions.get(kernel) === action &&
			after.activeUI === 'none'
		) {
			kernel.set.activeUI(surface);
		}
	}
	return { ok: recorded };
};
