import type {
	ExplicitChoice,
	NoticeDismissal,
} from '../../consent-record/types';
import type { VendorChoice } from '../../types';

export const choiceSinceEpoch = function choiceSinceEpoch(
	choice: ExplicitChoice | null,
	epoch: number,
	knowsClear: boolean
): ExplicitChoice | null {
	if (!choice || epoch <= 0) {
		return choice;
	}
	const entries = Object.entries(choice.categories).filter(
		([, decision]) =>
			decision &&
			(decision.confirmedAt > epoch ||
				(knowsClear && decision.confirmedAt === epoch))
	);
	if (entries.length === 0) {
		return null;
	}
	return entries.length === Object.keys(choice.categories).length
		? choice
		: { categories: Object.fromEntries(entries), version: 3 };
};

export const vendorChoiceSinceEpoch = function vendorChoiceSinceEpoch<
	RecordType extends VendorChoice,
>(record: RecordType | null, epoch: number): RecordType | null {
	return record && record.confirmedAt >= epoch ? record : null;
};

export const noticeSinceEpoch = function noticeSinceEpoch<
	RecordType extends NoticeDismissal,
>(record: RecordType | null, epoch: number): RecordType | null {
	return record && record.dismissedAt >= epoch ? record : null;
};
