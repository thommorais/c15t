import type {
	PolicyResolution,
	PolicyRule,
	TranslationsResponse,
} from '@c15t/schema/types';
import {
	recommendedPolicyRules,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@c15t/schema/types';

import { warnNoConsentRecordsInDevelopment } from '../libs/no-records-warning';
import type { OfflineModeOptions as OfflineModeDataOptions } from '../modes';
import type {
	InitContext,
	KernelBranding,
	KernelTranslations,
	KernelTransport,
	SavePayload,
	SaveResult,
} from '../types';
import type { TransportInitResponse } from './init-output';
import type { ProviderTransportFactory } from './mode';

export interface OfflineKernelTransport extends KernelTransport {
	init: (ctx: InitContext) => Promise<TransportInitResponse>;
	save: (payload: SavePayload) => Promise<SaveResult>;
}

export interface OfflineTransportOptions {
	policyRules?: PolicyRule[];

	translations?: KernelTranslations | TranslationsResponse;

	defaultLanguage?: string;

	translationsFor?: (language: string) => KernelTranslations | undefined;

	detectedLanguage?: string;

	branding?: KernelBranding;

	iabEnabled?: boolean;

	acknowledgeNoRecords?: boolean;
}

const normalizeTranslations = function normalizeTranslations(
	input: KernelTranslations | TranslationsResponse | undefined,
	defaultLanguage: string
): KernelTranslations {
	if (!input) {
		return {
			language: defaultLanguage,
			translations: {} as TranslationsResponse,
		};
	}
	if (
		typeof input === 'object' &&
		'language' in input &&
		'translations' in input
	) {
		return input;
	}
	return {
		language: defaultLanguage,
		translations: input as TranslationsResponse,
	};
};

const createOfflineTranslationSelector =
	function createOfflineTranslationSelector(
		translations: KernelTranslations,
		translationsFor: OfflineTransportOptions['translationsFor'],
		readDetectedLanguage: () => string | undefined
	): (requested: string | undefined) => KernelTranslations {
		let choseAnother = false;
		return (requested) => {
			if (!requested) {
				return translations;
			}
			if (!translationsFor) {
				return { ...translations, language: requested };
			}
			if (!choseAnother && requested === readDetectedLanguage()) {
				return translations;
			}
			choseAnother = true;
			return translationsFor(requested) ?? translations;
		};
	};

export const createOfflineTransport = function createOfflineTransport(
	options: OfflineTransportOptions = {}
): OfflineKernelTransport {
	const defaultLanguage = options.defaultLanguage ?? 'en';
	const branding: KernelBranding = options.branding ?? 'c15t';
	const iabEnabled = options.iabEnabled === true;
	const translations = normalizeTranslations(
		options.translations,
		defaultLanguage
	);
	const rules =
		options.policyRules ?? recommendedPolicyRules({ iab: iabEnabled });
	const selectTranslations = createOfflineTranslationSelector(
		translations,
		options.translationsFor,
		() => options.detectedLanguage
	);

	return {
		init(ctx: InitContext): Promise<TransportInitResponse> {
			const country = ctx.overrides.country ?? null;
			const region = ctx.overrides.region ?? null;

			const resolution: PolicyResolution = resolvePolicyRules({
				countryCode: country,
				iabEnabled,
				regionCode: region,
				rules,
			});

			const resolvedTranslations = selectTranslations(ctx.overrides.language);

			const response: TransportInitResponse = {
				branding,
				location: {
					countryCode: country,
					regionCode: region,
				},
				policyResolution: writePolicyResolutionWire(resolution),
				translations: resolvedTranslations,
			};
			return Promise.resolve(response);
		},

		save(payload: SavePayload): Promise<SaveResult> {
			warnNoConsentRecordsInDevelopment(options.acknowledgeNoRecords);
			return Promise.resolve({ ok: true, subjectId: payload.subjectId });
		},

	};
};

export interface OfflineModeOptions extends OfflineModeDataOptions {
	policyRules?: PolicyRule[];
}

export type OfflineModeFactory = ProviderTransportFactory &
	Readonly<OfflineModeOptions> & {
		readonly kind: 'offline';
		readonly type: 'offline';
	};

export const local = function local(
	options: OfflineModeOptions = {}
): OfflineModeFactory {
	const settings: OfflineModeOptions = {};
	if (options.policyRules !== undefined) {
		settings.policyRules = options.policyRules;
	}
	if (options.acknowledgeNoRecords !== undefined) {
		settings.acknowledgeNoRecords = options.acknowledgeNoRecords;
	}
	return Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]): KernelTransport => {
			warnNoConsentRecordsInDevelopment(settings.acknowledgeNoRecords);
			const rules =
				settings.policyRules ??
				recommendedPolicyRules({ iab: context.iabEnabled });
			const selectTranslations = createOfflineTranslationSelector(
				context.translations,
				context.translationsFor,
				() => context.prefetch.initialOverrides?.language
			);
			return {
				init: ({ overrides }: InitContext) => {
					const countryCode = overrides.country ?? null;
					const regionCode = overrides.region ?? null;
					return Promise.resolve({
						location: { countryCode, regionCode },
						policyResolution: writePolicyResolutionWire(
							resolvePolicyRules({
								countryCode,
								iabEnabled: context.iabEnabled,
								regionCode,
								rules,
							})
						),
						translations: selectTranslations(overrides.language),
					});
				},
			};
		},
		settings,
		{ kind: 'offline' as const, type: 'offline' as const }
	);
};

export const offline = local;
