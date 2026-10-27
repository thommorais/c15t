import { persistenceTools } from '../tools';
import { createRecordStore } from '../writer/store';

export * from '../writer/encode';

export {
	clearStoredConsentRecords,
	encodeClearEpoch,
	writeStoredClearEpoch,
} from '../clear';

export const {
	clearStoredVendorChoice,
	writeStoredConsentEnvelope,
	writeStoredNoticeDismissal,
	writeStoredVendorChoice,
} = createRecordStore(persistenceTools);
