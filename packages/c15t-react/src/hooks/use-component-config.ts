'use client';

import type { UIOptions } from '@c15t/ui/theme';

import { useReducedMotion } from './use-reduced-motion';
import { useTheme } from './use-theme';

export type ComponentConfig = Pick<
	UIOptions,
	'noStyle' | 'disableAnimation' | 'scrollLock' | 'trapFocus'
>;

export type ResolvedComponentConfig = Required<ComponentConfig>;

export const useComponentConfig = function useComponentConfig(
	localOverrides?: ComponentConfig
): ResolvedComponentConfig {
	const globalTheme = useTheme();
	const prefersReducedMotion = useReducedMotion();

	return {
		disableAnimation:
			localOverrides?.disableAnimation ??
			globalTheme.disableAnimation ??
			prefersReducedMotion,
		noStyle: localOverrides?.noStyle ?? globalTheme.noStyle ?? false,
		scrollLock: localOverrides?.scrollLock ?? globalTheme.scrollLock ?? false,
		trapFocus: localOverrides?.trapFocus ?? globalTheme.trapFocus ?? true,
	};
};
