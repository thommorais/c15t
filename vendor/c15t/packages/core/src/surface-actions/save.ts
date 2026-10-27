import { deriveActiveUI } from '../derive-surface';
import type { ConsentKernel, SaveResult } from '../types';
import { actions, beginAction, isOpen } from './rules';

const settleSurface = (kernel: ConsentKernel): void => {
	const snapshot = kernel.getSnapshot();
	const next = deriveActiveUI(snapshot);
	if (snapshot.activeUI !== next) {
		kernel.set.activeUI(next);
	}
};

export const saveConsentSurface = (
	kernel: ConsentKernel,
	save: () => Promise<SaveResult>,
	canClose?: () => boolean
): Promise<SaveResult> => {
	const action = beginAction(kernel);
	const before = kernel.getSnapshot();
	const surface = before.activeUI;
	const pending = save();
	if (!isOpen(surface)) {
		return pending;
	}
	const after = kernel.getSnapshot();
	if (
		after.explicitChoice !== before.explicitChoice ||
		after.vendorChoice !== before.vendorChoice ||
		after.noticeDismissal !== before.noticeDismissal
	) {
		if (actions.get(kernel) === action) {
			settleSurface(kernel);
		}
		return pending;
	}
	return pending.then((result) => {
		if (
			result.ok &&
			actions.get(kernel) === action &&
			kernel.getSnapshot().activeUI === surface &&
			(!canClose || canClose())
		) {
			settleSurface(kernel);
		}
		return result;
	});
};
