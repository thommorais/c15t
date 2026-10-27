import type { PolicyRule } from '@c15t/schema/types';

import type { AllConsentNames } from '../consent/consent-types';
import type { HostedModeOptions as HostedModeDataOptions } from '../modes';
import type { SSRInitialData } from '../options/ssr';
import type {
	KernelConfig,
	KernelTranslations,
	KernelTransport,
} from '../types';
import type { RememberedDecisionInputs } from './decision-inputs';
import { createHostedTransport } from './hosted';
import { hostedFactories } from './hosted-modes';

export interface ProviderTransportContext {
	consentCategories?: AllConsentNames[];
	policyRules?: PolicyRule[];
	iabEnabled?: boolean;
	gppEnabled?: boolean;
	prefetch: KernelConfig;
	pendingPrefetch?: PromiseLike<Partial<KernelConfig> | undefined>;
	translations: KernelTranslations;
	translationsFor?: (language: string) => KernelTranslations | undefined;
}

export type ProviderTransportKind =
	| 'hosted'
	| 'manifest'
	| 'offline'
	| 'custom';

export interface ProviderTransportFactory {
	(context: ProviderTransportContext): KernelTransport;
	readonly kind: ProviderTransportKind;
}

export interface HostedModeOptions extends HostedModeDataOptions {
	backendURL: string;
	domain?: string;
	fetch?: typeof globalThis.fetch;
	headers?: Record<string, string>;
	initURL?: string;
	assertDecisionInputs?: boolean;
	initialData?: Promise<SSRInitialData | undefined>;
	decisionInputs?: RememberedDecisionInputs;
}

export type HostedModeFactory = ProviderTransportFactory &
	Readonly<HostedModeOptions> & {
		readonly kind: 'hosted';
		readonly type: 'hosted';
	};

export const hosted = function hosted(
	options: HostedModeOptions
): HostedModeFactory {
	const settings: HostedModeOptions = {
		...options,
		headers: options.headers && { ...options.headers },
	};
	if (settings.headers === undefined) {
		delete settings.headers;
	}
	const mode = Object.assign(
		() =>
			createHostedTransport({
				assertDecisionInputs:
					settings.assertDecisionInputs ?? settings.initURL !== undefined,
				backendURL: settings.backendURL,
				decisionInputs: settings.decisionInputs,
				domain: settings.domain,
				fetch: settings.fetch,
				headers: settings.headers && { ...settings.headers },
				initURL: settings.initURL,
				initialData: settings.initialData,
			}),
		settings,
		{ kind: 'hosted' as const, type: 'hosted' as const }
	);
	hostedFactories.add(mode);
	return mode;
};

export { custom } from './custom';
