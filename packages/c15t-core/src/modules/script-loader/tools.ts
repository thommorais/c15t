import { extractConsentNamesFromCondition } from '../../libs/has';
import {
	declareOwnedVendors,
	forgetOwnedVendors,
	isValidVendorId,
} from '../../libs/vendors';
import {
	deniedVendorIds,
	evaluateConsent,
	getEffectiveGateState,
	has,
} from '../has';
import type { ScriptLoaderTools } from './types';

export const scriptLoaderTools: ScriptLoaderTools = {
	categoriesOf: extractConsentNamesFromCondition,
	declareOwners: declareOwnedVendors,
	deniedVendors: deniedVendorIds,
	evaluate: evaluateConsent,
	forgetOwners: forgetOwnedVendors,
	gateState: getEffectiveGateState,
	has,
	isVendorId: isValidVendorId,
};
