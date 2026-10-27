'use client';

import { useCallback } from 'react';

import {
	useActiveUI,
	useHasConsentPreferences,
	usePromptRequirement,
	useSetActiveUI,
} from '../hooks';

export type ConsentDialogTriggerVisibility =
	| 'always'
	| 'after-prompt'
	| 'never';
export interface UseConsentDialogTriggerOptions {
	showWhen?: ConsentDialogTriggerVisibility;
	onClick?: () => void;
}
export interface UseConsentDialogTriggerResult {
	isVisible: boolean;
	openDialog: () => void;
}

export const useConsentDialogTrigger = function useConsentDialogTrigger(
	options: UseConsentDialogTriggerOptions = {}
): UseConsentDialogTriggerResult {
	const { showWhen = 'always', onClick } = options;
	const setActiveUI = useSetActiveUI();
	const activeUI = useActiveUI();
	const promptRequirement = usePromptRequirement();
	const hasConsentUI = useHasConsentPreferences();
	const openDialog = useCallback(() => {
		onClick?.();
		setActiveUI('dialog');
	}, [onClick, setActiveUI]);
	const promptSettled =
		showWhen !== 'after-prompt' || promptRequirement.kind === 'none';
	return {
		isVisible:
			hasConsentUI &&
			showWhen !== 'never' &&
			activeUI !== 'dialog' &&
			promptSettled,
		openDialog,
	};
};
