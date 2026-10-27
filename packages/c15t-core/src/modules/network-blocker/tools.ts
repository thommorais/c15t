import { extractConsentNamesFromCondition } from '../../libs/has';
import { declareOwnedVendors, forgetOwnedVendors } from '../../libs/vendors';
import { evaluateConsent } from '../has';
import {
	blockedResponse,
	failBlockedXhr,
	releaseNetworkRequests,
	stashXhr,
	XHR_REQUEST,
} from './hold';
import type { NetworkBlockerTools } from './types';

export const networkBlockerTools: NetworkBlockerTools = {
	blockedResponse,
	categoriesOf: extractConsentNamesFromCondition,
	declareOwners: declareOwnedVendors,
	evaluate: evaluateConsent,
	failBlockedXhr,
	forgetOwners: forgetOwnedVendors,
	releaseHolds: releaseNetworkRequests,
	stashXhr,
	xhrRequest: XHR_REQUEST,
};
