import type { ConsentSubject } from '../consent-record/types';
import type { InternalKernel } from './internals';

export const subjectAfterClear = function subjectAfterClear(
	subject: ConsentSubject | null | undefined
): ConsentSubject | null {
	return subject?.subjectId ? { subjectId: subject.subjectId } : null;
};

export const clearKernelRecords = function clearKernelRecords(
	kernel: Pick<InternalKernel, 'events' | 'getSnapshot' | 'hydrate'>,
	now?: number
): void {
	kernel.hydrate({
		choice: null,
		noticeDismissal: null,
		now,
		subject: subjectAfterClear(kernel.getSnapshot().subject),
		vendorChoice: null,
	});
	kernel.events.emit({ type: 'records:cleared' });
};
