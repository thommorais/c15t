import type { extractConsentNamesFromCondition } from '../../libs/has';
import type {
	BlockedRequestInfo,
	NetworkBlockerConfig,
	NetworkBlockerRule,
} from '../../libs/network-blocker/types';
import type {
	declareOwnedVendors,
	forgetOwnedVendors,
} from '../../libs/vendors';
import type { ConsentKernel } from '../../types';
import type { evaluateConsent } from '../has';
import type {
	blockedResponse,
	failBlockedXhr,
	NetworkHold,
	releaseNetworkRequests,
	stashXhr,
	XHR_REQUEST,
} from './hold';

export type { BlockedRequestInfo, NetworkBlockerConfig, NetworkBlockerRule };

export interface NetworkBlockerOptions extends Omit<
	NetworkBlockerConfig,
	'initialDraft'
> {
	kernel: ConsentKernel;
	hold?: NetworkHold;
}

export interface NetworkBlockerHandle {
	dispose: () => void;
	updateRules: (next: NetworkBlockerRule[], hold?: NetworkHold) => void;
	setEnabled: (enabled: boolean) => void;
}

export interface BlockDecision {
	shouldBlock: boolean;
	rule?: NetworkBlockerRule;
}

export interface NetworkBlockerTools {
	blockedResponse: typeof blockedResponse;
	categoriesOf: typeof extractConsentNamesFromCondition;
	declareOwners: typeof declareOwnedVendors;
	evaluate: typeof evaluateConsent;
	failBlockedXhr: typeof failBlockedXhr;
	forgetOwners: typeof forgetOwnedVendors;
	releaseHolds: typeof releaseNetworkRequests;
	stashXhr: typeof stashXhr;
	xhrRequest: typeof XHR_REQUEST;
}
