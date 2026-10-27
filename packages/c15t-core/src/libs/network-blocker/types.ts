import type { ConsentState } from '../../consent/compliance';
import type { AllConsentNames } from '../../consent/consent-types';
import type { HasCondition } from '../has';

export interface NetworkBlockerRule {
	vendor?: string;
	vendorId?: number | string;
	iabPurposes?: number[];
	iabLegIntPurposes?: number[];
	iabSpecialFeatures?: number[];
	id?: string;

	domain: string;

	pathIncludes?: string;

	methods?: string[];

	category: HasCondition<AllConsentNames>;
}

export interface BlockedRequestInfo {
	method: string;

	url: string;

	rule?: NetworkBlockerRule;
}

export interface NetworkBlockerConfig {
	enabled?: boolean;

	initialDraft?: ConsentState;

	logBlockedRequests?: boolean;

	onRequestBlocked?: (info: BlockedRequestInfo) => void;

	rules: NetworkBlockerRule[];
}
