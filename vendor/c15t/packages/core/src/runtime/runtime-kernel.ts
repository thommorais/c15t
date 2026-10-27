import { deepMergeTranslations } from '@c15t/translations';
import type { I18nConfig } from '@c15t/translations';

import type { AllConsentNames } from '../consent/consent-types';
import { createKernel } from '../kernel';
import type { InternalKernel } from '../kernel/internals';
import { hostExperiment, seedExperiment } from '../libs/experiment';
import { extractConsentNamesFromCondition } from '../libs/has';
import { isProductionBuild } from '../libs/is-production';
import { resolveVendors } from '../libs/vendors';
import type { User } from '../options/user';
import { disabledPolicyResolution } from '../policy';
import {
	defaultTranslationConfig,
	resolveLocalTranslations,
} from '../translations';
import type { ProviderTransportContext } from '../transports/mode';
import type {
	KernelConfig,
	KernelTranslations,
	KernelTransport,
	KernelUser,
	ResolvedVendor,
	TranslationsResponse,
} from '../types';
import { isIABConfigured } from './iab-options';
import type { ConsentRuntimeOptions } from './types';

const DEFAULT_TRANSLATIONS: KernelTranslations = {
	language: 'en',
	translations: defaultTranslationConfig.translations.en as never,
};

export const normalizeKernelUser = function normalizeKernelUser(
	user: User | KernelUser | undefined
): KernelUser | undefined {
	if (!user) {
		return undefined;
	}
	if ('externalId' in user) {
		return user;
	}
	const legacy = user as User;
	return {
		externalId: legacy.id,
		identityProvider: legacy.identityProvider,
	};
};

export const resolveRuntimeTranslations = function resolveRuntimeTranslations(
	i18n: Partial<I18nConfig> | undefined
): KernelTranslations | undefined {
	if (!(i18n?.messages || i18n?.locale)) {
		return undefined;
	}
	const language =
		i18n.locale ?? defaultTranslationConfig.defaultLanguage ?? 'en';
	const fallbackTranslations = defaultTranslationConfig.translations
		.en as TranslationsResponse;
	const base = (defaultTranslationConfig.translations[
		language as keyof typeof defaultTranslationConfig.translations
	] ?? fallbackTranslations) as TranslationsResponse;
	if (!i18n.messages) {
		return { language, translations: base };
	}
	const selected =
		i18n.messages[language] ?? i18n.messages.en ?? fallbackTranslations;
	return {
		language,
		translations: deepMergeTranslations(
			base as never,
			selected as never
		) as TranslationsResponse,
	};
};

export const hasResolvedPrefetch = function hasResolvedPrefetch(
	prefetch: KernelConfig | undefined
): boolean {
	return Boolean(
		prefetch?.initialPolicyResolution && prefetch.initialPolicyPending !== true
	);
};

const warnInDevelopment = function warnInDevelopment(
	...message: unknown[]
): void {
	if (!isProductionBuild()) {
		console.warn(...message);
	}
};

declare const process: { env: { NODE_ENV?: string } };

const runtimeOwner = function runtimeOwner(pkg: string): string {
	if (pkg === '@c15t/core') {
		return 'createConsentRuntime()';
	}
	if (pkg.startsWith('@c15t/browser')) {
		return 'init()';
	}
	if (pkg === '@c15t/vue') {
		return 'the c15tVue plugin';
	}
	return pkg === '@c15t/nextjs' || pkg === '@c15t/tanstack-start'
		? 'ConsentRoot'
		: 'ConsentProvider';
};

const requireTransportFactory = function requireTransportFactory(
	options: Pick<ConsentRuntimeOptions, 'mode' | 'pkg'>
) {
	if (typeof options.mode !== 'function') {
		let caller = options.pkg ?? '@c15t/core';
		try {
			if (process.env.NODE_ENV !== 'production') {
				caller = `${caller} ${runtimeOwner(caller)}`;
			}
		} catch {
		}
		throw new Error(
			`${caller}: \`mode\` is required. Use manifest() or hosted().`
		);
	}
	return options.mode;
};

export const inferConsentCategories = function inferConsentCategories(
	options: Pick<ConsentRuntimeOptions, 'networkBlocker' | 'scripts'>,
	vendors: readonly Pick<ResolvedVendor, 'category'>[] = []
): AllConsentNames[] {
	return [
		...(options.scripts ?? []),
		...(options.networkBlocker ? (options.networkBlocker.rules ?? []) : []),
		...vendors,
	].flatMap((declaration) =>
		extractConsentNamesFromCondition(declaration.category)
	);
};

// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
export const createRuntimeKernel = function createRuntimeKernel(
	options: ConsentRuntimeOptions,
	wrapTransport?: (transport: KernelTransport) => KernelTransport
): InternalKernel {
	const enabled = options.enabled ?? true;
	const {
		experiment: serverExperiment,
		journey: _serverJourney,
		...prefetch
	} = options.prefetch ?? {};
	const i18nTranslations =
		resolveRuntimeTranslations(options.i18n) ?? DEFAULT_TRANSLATIONS;

	const transportContext: ProviderTransportContext = {
		consentCategories: options.consentCategories,
		gppEnabled:
			enabled &&
			!options.consentSource &&
			Boolean(options.gpp) &&
			options.loadGPP !== undefined,
		iabEnabled: isIABConfigured(options.iab),
		policyRules: options.policyRules,
		prefetch,
		translations: i18nTranslations,
		translationsFor: (language) =>
			resolveLocalTranslations(language, options.i18n?.messages),
	};
	const built = requireTransportFactory(options)(transportContext);
	const transport = wrapTransport ? wrapTransport(built) : built;

	const integrations = [
		...(options.scripts ?? []),
		...(options.networkBlocker ? (options.networkBlocker.rules ?? []) : []),
	];
	const declaredVendors = resolveVendors({
		config: options.vendors,
		existing: prefetch.initialVendors?.declared,
		onWarn: warnInDevelopment,
		owners: integrations,
	});
	const vendorListVersion = prefetch.initialVendors?.listVersion ?? null;
	const experimentSeed = enabled
		? seedExperiment(
				hostExperiment(options.experiment, { experiment: serverExperiment }),
				prefetch.initialExperiment,
				hasResolvedPrefetch(options.prefetch)
			)
		: {};

	return createKernel({
		...prefetch,
		consentCategories: options.consentCategories,
		inferredConsentCategories: inferConsentCategories(options, declaredVendors),
		initialExperiment: experimentSeed.initialExperiment,
		initialExperimentPending: experimentSeed.initialExperimentPending,
		initialExternalPermissions:
			enabled && options.consentSource ? {} : undefined,
		initialIab:
			prefetch.initialIab?.gvlReference &&
			options.iab &&
			options.iab.vendors?.length
				? {
						...prefetch.initialIab,
						gvlReference: {
							...prefetch.initialIab.gvlReference,
							summary: undefined,
						},
					}
				: prefetch.initialIab,
		initialOverrides: {
			...(prefetch.initialOverrides ?? {}),
			...(options.overrides ?? {}),
		},
		initialPolicyPending: options.consentSource
			? false
			: (prefetch.initialPolicyPending ??
				(enabled && !prefetch.initialPolicyResolution)),
		initialPolicyResolution: enabled
			? prefetch.initialPolicyResolution
			: disabledPolicyResolution(),
		initialRecords:
			enabled && !options.consentSource ? prefetch.initialRecords : undefined,
		initialTranslations: prefetch.initialTranslations ?? i18nTranslations,
		initialUser: normalizeKernelUser(options.user) ?? prefetch.initialUser,
		initialVendors:
			declaredVendors.length > 0 || vendorListVersion !== null
				? { declared: declaredVendors, listVersion: vendorListVersion }
				: undefined,
		now:
			prefetch.now ??
			prefetch.initialRecords?.now ??
			(prefetch.initialRecords ? undefined : 0),
		translationOverrides: options.i18n?.messages,
		transport,
	});
};
