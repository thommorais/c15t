'use client';

import type { ConsentKernel } from '@c15t/core';
import { createDevTools } from '@c15t/dev-tools';
import type {
	DevToolsInstance,
	DevToolsOptions,
	DevToolsPosition,
	DevToolsTab,
} from '@c15t/dev-tools';
import {
	createElement,
	forwardRef,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from 'react';
import type {
	CSSProperties,
	ForwardedRef,
	HTMLAttributes,
	ReactElement,
	RefCallback,
} from 'react';

import { TriggerToolbar } from './components/panel-trigger/atoms/toolbar';
import { registerTriggerToolbar } from './components/panel-trigger/toolbar-loader';
import { KernelContext, ProviderServicesContext } from './context';
import { publishDevToolsLauncher } from './devtools-launcher';
import { useIsHydrated } from './hooks/use-is-hydrated';

export interface ConsentDevToolsProps extends Omit<
	DevToolsOptions,
	'container' | 'kernel'
> {
	disabled?: boolean;
}

export type C15TDevToolsProps = ConsentDevToolsProps;

export type DevToolsProps = ConsentDevToolsProps;

const requireKernel = (kernel: ConsentKernel | null): ConsentKernel => {
	if (!kernel) {
		throw new Error(
			'c15t: DevTools must be rendered inside <ConsentProvider> from @c15t/react.'
		);
	}
	return kernel;
};

const useStableConsentCategories = (
	getter: DevToolsOptions['getConsentCategories'],
	disabled: boolean
): DevToolsOptions['getConsentCategories'] => {
	const isClient = useIsHydrated();
	const latestGetter = useRef(getter);
	useLayoutEffect(() => {
		latestGetter.current = getter;
	}, [getter]);
	const categoryKey =
		isClient && !disabled && getter
			? JSON.stringify([...new Set(getter())].sort())
			: undefined;
	return useMemo(() => {
		if (categoryKey === undefined) {
			return undefined;
		}
		const categories = JSON.parse(categoryKey) as ReturnType<
			NonNullable<typeof getter>
		>;
		return () => latestGetter.current?.() ?? categories;
	}, [categoryKey]);
};

const useStableServices = (
	clearRecords: DevToolsOptions['clearRecords'],
	getPresentation: DevToolsOptions['getPresentation']
) => {
	const latest = useRef({ clearRecords, getPresentation });
	useLayoutEffect(() => {
		latest.current = { clearRecords, getPresentation };
	}, [clearRecords, getPresentation]);
	const hasClear = clearRecords !== undefined;
	const hasPresentation = getPresentation !== undefined;
	return useMemo(
		() => ({
			clearRecords: hasClear
				? () => latest.current.clearRecords?.()
				: undefined,
			getPresentation: hasPresentation
				? () => latest.current.getPresentation?.()
				: undefined,
		}),
		[hasClear, hasPresentation]
	);
};

export const ConsentDevTools = ({
	disabled = false,
	clearRecords,
	getPresentation,
	defaultOpen,
	defaultTab,
	getConsentCategories,
	maxEvents,
	position,
	shadow,
}: ConsentDevToolsProps): null => {
	const services = useContext(ProviderServicesContext);
	const stableServices = useStableServices(
		clearRecords ?? services?.clearRecords,
		getPresentation ?? services?.getPresentation
	);
	const contextKernel = useContext(KernelContext);
	const kernel = disabled ? null : requireKernel(contextKernel);
	const getDisplayedCategories = useStableConsentCategories(
		getConsentCategories ?? services?.getConsentCategories,
		disabled
	);

	useEffect(() => {
		registerTriggerToolbar(TriggerToolbar);
	}, []);

	useEffect(() => {
		if (!kernel) {
			return;
		}

		const devTools = createDevTools({
			...stableServices,
			defaultOpen,
			defaultTab,
			getConsentCategories: getDisplayedCategories,
			kernel,
			maxEvents,
			position,
			shadow,
		});
		const withdrawLauncher = publishDevToolsLauncher(kernel, devTools);
		return () => {
			withdrawLauncher();
			devTools.destroy();
		};
	}, [
		defaultOpen,
		defaultTab,
		getDisplayedCategories,
		stableServices,
		kernel,
		maxEvents,
		position,
		shadow,
	]);

	return null;
};

export const DevTools = ConsentDevTools;

export const C15TDevTools = ConsentDevTools;

export interface C15tTanStackDevtoolsPanelProps
	extends
		HTMLAttributes<HTMLDivElement>,
		Pick<
			DevToolsOptions,
			| 'defaultTab'
			| 'maxEvents'
			| 'getConsentCategories'
			| 'getPresentation'
			| 'clearRecords'
		> {
	disabled?: boolean;
	theme?: TanStackDevtoolsTheme;
}

export type TanStackDevtoolsTheme = 'light' | 'dark';

export interface TanStackDevtoolsPluginProps {
	theme?: TanStackDevtoolsTheme;
}

export interface TanStackDevtoolsPlugin {
	id?: string;
	name: string;
	defaultOpen?: boolean;
	render: (
		element: HTMLElement,
		props?: TanStackDevtoolsPluginProps | TanStackDevtoolsTheme
	) => ReactElement;
}

export interface C15tDevtoolsPluginOptions extends C15tTanStackDevtoolsPanelProps {
	id?: string;
	name?: string;
	defaultOpen?: boolean;
}

const EMBEDDED_PANEL_STYLE = {
	height: '100%',
	minHeight: 0,
	width: '100%',
} as const;

const assignRef = (
	ref: ForwardedRef<HTMLDivElement>,
	value: HTMLDivElement | null
): ReturnType<RefCallback<HTMLDivElement>> => {
	if (typeof ref === 'function') {
		return ref(value);
	} else if (ref) {
		ref.current = value;
	}
};

export const C15tTanStackDevtoolsPanel = forwardRef<
	HTMLDivElement,
	C15tTanStackDevtoolsPanelProps
>(
	// oxlint-disable-next-line prefer-arrow-callback -- A named function gives the forwarded component a display name.
	function C15tTanStackDevtoolsPanel(
		{
			disabled = false,
			clearRecords,
			getPresentation,
			defaultTab,
			getConsentCategories,
			maxEvents,
			style,
			theme,
			...containerProps
		},
		forwardedRef
	) {
		const services = useContext(ProviderServicesContext);
		const stableServices = useStableServices(
			clearRecords ?? services?.clearRecords,
			getPresentation ?? services?.getPresentation
		);
		const contextKernel = useContext(KernelContext);
		const kernel = disabled ? null : requireKernel(contextKernel);
		const getDisplayedCategories = useStableConsentCategories(
			getConsentCategories ?? services?.getConsentCategories,
			disabled
		);
		const containerRef = useRef<HTMLDivElement | null>(null);
		const setContainerRef = useCallback(
			(value: HTMLDivElement | null) => {
				containerRef.current = value;
				const cleanup = assignRef(forwardedRef, value);
				if (typeof cleanup === 'function') {
					return () => {
						containerRef.current = null;
						cleanup();
					};
				}
			},
			[forwardedRef]
		);

		useLayoutEffect(() => {
			const container = containerRef.current;
			if (!kernel || !container) {
				return;
			}

			const devTools = createDevTools({
				...stableServices,
				container,
				defaultTab,
				embedded: true,
				getConsentCategories: getDisplayedCategories,
				kernel,
				maxEvents,
			});

			return () => devTools.destroy();
		}, [defaultTab, getDisplayedCategories, stableServices, kernel, maxEvents]);

		const schemeStyle = theme
			? ({ '--c15t-dev-tools-color-scheme': theme } as CSSProperties)
			: undefined;

		return (
			<div
				{...containerProps}
				ref={setContainerRef}
				style={{ ...EMBEDDED_PANEL_STYLE, ...schemeStyle, ...style }}
			/>
		);
	}
);

export const c15tDevtools = (
	options: C15tDevtoolsPluginOptions = {}
): TanStackDevtoolsPlugin => {
	const {
		id = 'c15t',
		name = 'c15t',
		defaultOpen = false,
		...panelProps
	} = options;

	return {
		defaultOpen,
		id,
		name,
		render: (_element, props) =>
			createElement(C15tTanStackDevtoolsPanel, {
				...panelProps,
				theme:
					(typeof props === 'string' ? props : props?.theme) ??
					panelProps.theme,
			}),
	};
};

export const c15tDevtoolsPlugin = c15tDevtools;

export type {
	DevToolsInstance,
	DevToolsOptions,
	DevToolsPosition,
	DevToolsTab,
};
