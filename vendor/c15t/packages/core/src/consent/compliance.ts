import type { AllConsentNames } from './consent-types';

export type ConsentState = Record<AllConsentNames, boolean>;

export interface NamespaceProps {
	namespace?: string;
}
