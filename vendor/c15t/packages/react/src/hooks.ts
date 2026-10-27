import type {
	AllConsentNames,
	ConsentKernel,
	ConsentPresentation,
	ExperimentAssignment,
	PromptPresentation,
	PreferencesPresentation,
	ConsentSnapshot,
	ConsentState,
	KernelActiveUI,
	KernelBranding,
	KernelIABState,
	KernelModel,
	KernelOverrides,
	KernelTranslations,
	KernelUser,
	LocationResponse,
	PolicyScopeMode,
	ResolvedVendor,
	VendorChoice,
} from '@c15t/core';
import {
	applyExperimentAssignment,
	applyExperimentTheme,
	isVendorAllowed,
} from '@c15t/core';
import {
	hasConsentPreferences,
	hasConsentUI,
	showConsentSurface,
} from '@c15t/core/surface-actions';
import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

import { ProviderServicesContext } from './context';
import {
	useGateSelector,
	useKernel,
	useKernelSelector,
	useServerSnapshot,
} from './kernel-selector';
import type { Theme } from './types/theme';
import { useUIConfig } from './ui-config-context';

export const useSnapshot = function useSnapshot(): ConsentSnapshot {
	const kernel = useKernel();
	const serverSnapshot = useServerSnapshot(kernel);
	return useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => kernel.getSnapshot(),
		serverSnapshot as () => ConsentSnapshot
	);
};

export const useConsent = function useConsent(
	category: AllConsentNames
): boolean {
	return useKernelSelector((snap) => snap.effectivePermissions[category]);
};

export const useConsents = function useConsents(): Readonly<ConsentState> {
	return useKernelSelector((snap) => snap.effectivePermissions);
};

export const useOverrides = function useOverrides(): Readonly<KernelOverrides> {
	return useKernelSelector((snap) => snap.overrides);
};

export const useUser = function useUser(): Readonly<KernelUser> | null {
	return useKernelSelector((snap) => snap.user);
};

export const useLocation =
	function useLocation(): Readonly<LocationResponse> | null {
		return useKernelSelector((snap) => snap.location);
	};

export const useTranslations =
	function useTranslations(): Readonly<KernelTranslations> | null {
		return useKernelSelector((snap) => snap.translations);
	};

export const useBranding = function useBranding(): KernelBranding | null {
	return useKernelSelector((snap) => snap.branding);
};

export const useHasConsentPolicy = function useHasConsentPolicy(): boolean {
	return useKernelSelector((snap) => snap.resolution.status === 'matched');
};

export const useHasConsentUI = function useHasConsentUI(): boolean {
	return useKernelSelector(hasConsentUI);
};

export const useHasConsentPreferences =
	function useHasConsentPreferences(): boolean {
		return useKernelSelector(hasConsentPreferences);
	};

export const useModel = function useModel(): KernelModel | null {
	return useKernelSelector((snap) =>
		snap.resolution.status === 'matched' ? snap.model : null
	);
};

export const useActiveUI = function useActiveUI(): KernelActiveUI {
	return useKernelSelector((snap) => snap.activeUI);
};

export const usePolicyCategories =
	function usePolicyCategories(): readonly AllConsentNames[] {
		return useKernelSelector((snap) => snap.policyRule.scope);
	};

export const usePolicyScopeMode =
	function usePolicyScopeMode(): PolicyScopeMode {
		return useKernelSelector((snap) => snap.policyRule.scopeMode);
	};

export const useIABSnapshot =
	function useIABSnapshot(): Readonly<KernelIABState> | null {
		return useKernelSelector((snap) => snap.iab);
	};

export const useIABEnabled = function useIABEnabled(): boolean {
	return useKernelSelector((snap) => snap.iab?.enabled ?? false);
};

export const useVendorConsent = function useVendorConsent(
	vendorId: string | number
): boolean {
	const key = String(vendorId);
	return useKernelSelector((snap) => snap.iab?.vendorConsents[key] ?? false);
};

export const usePurposeConsent = function usePurposeConsent(
	purposeId: number
): boolean {
	return useKernelSelector(
		(snap) => snap.iab?.purposeConsents[purposeId] ?? false
	);
};

export const useSpecialFeatureOptIn = function useSpecialFeatureOptIn(
	featureId: number
): boolean {
	return useKernelSelector(
		(snap) => snap.iab?.specialFeatureOptIns[featureId] ?? false
	);
};

export const useTCString = function useTCString(): string | null {
	return useKernelSelector((snap) => snap.iab?.tcString ?? null);
};

const NO_VENDORS: readonly ResolvedVendor[] = [];

export const useDeclaredVendors =
	function useDeclaredVendors(): readonly ResolvedVendor[] {
		return useKernelSelector((snap) =>
			snap.model === 'iab' ? NO_VENDORS : (snap.vendors?.declared ?? NO_VENDORS)
		);
	};

export const useVendorChoice =
	function useVendorChoice(): Readonly<VendorChoice> | null {
		return useKernelSelector((snap) => snap.vendorChoice);
	};

export const useVendorAllowed = function useVendorAllowed(
	vendorId: string
): boolean {
	return useGateSelector((snap, now) => isVendorAllowed(snap, vendorId, now));
};

export const useRegisterConsentCategories =
	function useRegisterConsentCategories() {
		return useKernel().set.registerConsentCategories;
	};

export const useSetOverrides = function useSetOverrides(): (
	input: KernelOverrides
) => void {
	const kernel = useKernel();
	return kernel.set.overrides;
};

export const useSetLanguage = function useSetLanguage(): (
	code: string
) => void {
	const kernel = useKernel();
	const services = useContext(ProviderServicesContext);
	return useCallback(
		(code: string) => {
			if (services) {
				services.setLanguage(code);
				return;
			}
			if (code === kernel.getSnapshot().overrides.language) {
				return;
			}
			kernel.set.language(code);
			void kernel.commands.init();
		},
		[kernel, services]
	);
};

export const useSetActiveUI = function useSetActiveUI(): (
	ui: KernelActiveUI
) => void {
	const kernel = useKernel();
	return useCallback(
		(ui: KernelActiveUI) => showConsentSurface(kernel, ui),
		[kernel]
	);
};

export const useSaveConsents =
	function useSaveConsents(): ConsentKernel['commands']['save'] {
		const kernel = useKernel();
		return kernel.commands.save;
	};

export const useSubscribeToConsentChanges =
	function useSubscribeToConsentChanges(): (
		listener: (state: ConsentState) => void
	) => () => void {
		const kernel = useKernel();
		return useCallback(
			(listener: (state: ConsentState) => void) =>
				kernel.events.on('permissions:changed', ({ snapshot }) =>
					listener(snapshot.effectivePermissions)
				),
			[kernel]
		);
	};

export const useIdentify =
	function useIdentify(): ConsentKernel['commands']['identify'] {
		const kernel = useKernel();
		return kernel.commands.identify;
	};

export const useInit = function useInit(): ConsentKernel['commands']['init'] {
	const kernel = useKernel();
	return kernel.commands.init;
};

export const useExplicitChoice =
	function useExplicitChoice(): ConsentSnapshot['explicitChoice'] {
		return useKernelSelector((snapshot) => snapshot.explicitChoice);
	};

export const useEffectivePermissions =
	function useEffectivePermissions(): ConsentSnapshot['effectivePermissions'] {
		return useKernelSelector((snapshot) => snapshot.effectivePermissions);
	};

export const usePromptRequirement =
	function usePromptRequirement(): ConsentSnapshot['promptRequirement'] {
		return useKernelSelector((snapshot) => snapshot.promptRequirement);
	};

export const useNoticeDismissal =
	function useNoticeDismissal(): ConsentSnapshot['noticeDismissal'] {
		return useKernelSelector((snapshot) => snapshot.noticeDismissal);
	};

export const usePrivacySignals =
	function usePrivacySignals(): ConsentSnapshot['privacySignals'] {
		return useKernelSelector((snapshot) => snapshot.privacySignals);
	};

export const usePolicyResolution =
	function usePolicyResolution(): ConsentSnapshot['resolution'] {
		return useKernelSelector((snapshot) => snapshot.resolution);
	};

export const usePolicyRule =
	function usePolicyRule(): ConsentSnapshot['policyRule'] {
		return useKernelSelector((snapshot) => snapshot.policyRule);
	};

export const useRestrictions =
	function useRestrictions(): ConsentSnapshot['restrictions'] {
		return useKernelSelector((snapshot) => snapshot.restrictions);
	};

export const useDismissNotice =
	function useDismissNotice(): ConsentKernel['commands']['dismissNotice'] {
		return useKernel().commands.dismissNotice;
	};

export const useExperiment =
	function useExperiment(): Readonly<ExperimentAssignment> | null {
		return useKernelSelector((snapshot) => snapshot.experiment);
	};

export const useResolvedPresentation = function useResolvedPresentation():
	| ConsentPresentation
	| undefined {
	const { experiment, presentation } = useUIConfig();
	const assignment = useExperiment();
	return useMemo(
		() => applyExperimentAssignment(presentation, experiment, assignment),
		[presentation, experiment, assignment]
	);
};

export const useResolvedTheme = function useResolvedTheme(): Theme | undefined {
	const { experiment, theme } = useUIConfig();
	const assignment = useExperiment();
	return useMemo(
		() => applyExperimentTheme(theme, experiment, assignment),
		[theme, experiment, assignment]
	);
};

const EMPTY_PROMPT: PromptPresentation = {};
const EMPTY_PREFERENCES: PreferencesPresentation = {};
export const usePromptPresentation =
	function usePromptPresentation(): PromptPresentation {
		return useResolvedPresentation()?.prompt ?? EMPTY_PROMPT;
	};
export const usePreferencesPresentation =
	function usePreferencesPresentation(): PreferencesPresentation {
		return useResolvedPresentation()?.preferences ?? EMPTY_PREFERENCES;
	};
