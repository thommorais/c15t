import { clearOnRevocationOnDemand } from './on-demand-clear-on-revocation';
import { connectConsentSourceOnDemand } from './on-demand-consent-source';
import { loaderAndBlockerOnDemand } from './on-demand-loader-and-blocker';
import type { ConsentRuntimeModules } from './types';

export type OnDemandRuntimeModules = Pick<
	ConsentRuntimeModules,
	| 'connectConsentSource'
	| 'createClearOnRevocation'
	| 'createNetworkBlocker'
	| 'createScriptLoader'
>;

export const onDemandRuntimeModules: OnDemandRuntimeModules = {
	...loaderAndBlockerOnDemand,
	connectConsentSource: connectConsentSourceOnDemand,
	createClearOnRevocation: clearOnRevocationOnDemand,
};
