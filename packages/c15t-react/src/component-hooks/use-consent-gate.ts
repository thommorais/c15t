'use client';

import type { AllConsentNames, Translations } from '@c15t/core';
import { useCallback, useEffect, useMemo } from 'react';

import { useRegisterConsentCategories, useSetActiveUI } from '../hooks';
import { useIsHydrated } from '../hooks/use-is-hydrated';
import { useCategoryAllowed, useKernelSelector } from '../kernel-selector';
import { useTranslations } from './use-translations';

export type ConsentGateState =
	| 'granted'
	| 'pending'
	| 'denied'
	| 'policy-blocked';

export interface UseConsentGateResult {
	state: ConsentGateState;
	categoryTitle: string;
	title: string | undefined;
	actionLabel: string | undefined;
	policyBlockedMessage: string;
	requestConsent: () => void;
}

export const DEFAULT_POLICY_BLOCKED_MESSAGE =
	"This content is unavailable under your region's consent policy.";

export const resolveConsentGateCopy = function resolveConsentGateCopy(
	translations: Translations,
	category: AllConsentNames
): Omit<UseConsentGateResult, 'state' | 'requestConsent'> {
	const { consentGate, consentTypes } = translations;
	const categoryTitle =
		consentTypes?.[category as keyof typeof consentTypes]?.title ?? category;
	return {
		actionLabel: consentGate?.actionButton?.replace(
			'{category}',
			categoryTitle
		),
		categoryTitle,
		policyBlockedMessage:
			consentGate?.policyBlocked ?? DEFAULT_POLICY_BLOCKED_MESSAGE,
		title: consentGate?.title
			? consentGate.title.replace('{category}', categoryTitle)
			: undefined,
	};
};

export const useConsentGate = function useConsentGate(
	category: AllConsentNames
): UseConsentGateResult {
	const isAllowed = useCategoryAllowed(category);
	const isHydrated = useIsHydrated();
	const isPolicyBlocked = useKernelSelector(
		(snap) =>
			snap.policyRule.scopeMode === 'strict' &&
			category !== 'necessary' &&
			!(snap.policyRule.scope as readonly string[]).includes('*') &&
			!snap.policyRule.scope.includes(category)
	);
	const registerConsentCategories = useRegisterConsentCategories();
	const setActiveUI = useSetActiveUI();
	const translations = useTranslations();

	useEffect(() => {
		registerConsentCategories([category]);
	}, [category, registerConsentCategories]);

	const copy = useMemo(
		() => resolveConsentGateCopy(translations, category),
		[translations, category]
	);

	const requestConsent = useCallback(() => {
		setActiveUI('dialog');
	}, [setActiveUI]);

	let state: ConsentGateState;
	if (isAllowed) {
		state = isHydrated ? 'granted' : 'pending';
	} else {
		state = isPolicyBlocked ? 'policy-blocked' : 'denied';
	}

	return useMemo(
		() => ({ ...copy, requestConsent, state }),
		[copy, requestConsent, state]
	);
};
