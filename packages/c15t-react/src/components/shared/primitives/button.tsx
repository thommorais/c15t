import type { AllConsentNames } from '@c15t/core';
import { EARLY_TAP_OPT_OUT } from '@c15t/core/surface-actions';
import { forwardRef as createForwardRef, useCallback } from 'react';
import type { FocusEvent, MouseEvent, PointerEvent } from 'react';

import { useIdleDialogWarming, warmDialogChunk } from '~/chunk-warming';
import {
	toSaveUISource,
	useConsentTracking,
} from '~/context/consent-tracking-context';
import { useConsentSaveAction } from '~/draft-context';
import { useSetActiveUI, useDismissNotice } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import type { CSSPropertiesWithVars, CSSVariables } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { Slot } from '../libs/slot';
import * as Button from '../ui/button';
import type { ButtonVariantsProps } from '../ui/button/button';
import type { ConsentButtonElement, ConsentButtonProps } from './button.types';

const NON_DOM_PROPS = [
	'primary',
	'secondary',
	'neutral',
	'consentAction',
	'isPrimary',
	'performDefaultAction',
] as const;

type ConsentActionThemeKey =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'dismiss'
	| 'save';

const EARLY_TAP_ACTIONS: Partial<Record<string, string>> = {
	'accept-consent': 'accept',
	'dismiss-notice': 'dismiss',
	'open-consent-dialog': 'customize',
	'reject-consent': 'reject',
};

const skipsEarlyTap = function skipsEarlyTap(params: {
	action: string;
	asChild: boolean | undefined;
	dataAction: unknown;
	ownsClick: boolean;
	performDefaultAction: boolean;
}): boolean {
	const { action, dataAction, ownsClick, performDefaultAction } = params;
	const replays =
		!ownsClick &&
		(performDefaultAction || action === 'open-consent-dialog') &&
		EARLY_TAP_ACTIONS[action] === dataAction;
	return (
		!replays &&
		(params.asChild === true ||
			Object.values(EARLY_TAP_ACTIONS).includes(String(dataAction)))
	);
};

const ownsClick = function ownsClick(params: {
	asChild: boolean | undefined;
	onClick: unknown;
	type: unknown;
}): boolean {
	return (
		params.onClick !== undefined ||
		params.asChild === true ||
		params.type === 'submit' ||
		params.type === 'reset'
	);
};

const renderedProp = function renderedProp(
	key: string,
	layers: readonly Readonly<Record<string, unknown>>[]
): unknown {
	let value: unknown;
	for (const layer of layers) {
		if (key in layer) {
			value = layer[key];
		}
	}
	return value;
};

const resolveConsentButtonStyle = function resolveConsentButtonStyle(params: {
	consentAction?: ConsentActionThemeKey;
	isPrimary?: boolean;
	theme?: ReturnType<typeof useTheme>['theme'];
	variant?: ButtonVariantsProps['variant'];
	mode?: ButtonVariantsProps['mode'];
}) {
	if (params.variant || params.mode) {
		return {
			mode: params.mode ?? 'stroke',
			variant: params.variant ?? 'neutral',
		};
	}

	const consentActions = params.theme?.consentActions;
	const themedAction =
		params.consentAction && params.consentAction !== 'save'
			? consentActions?.[params.consentAction]
			: undefined;
	const layers = [
		themedAction,
		params.isPrimary ? consentActions?.primary : undefined,
		consentActions?.default,
		{
			mode: 'stroke' as const,
			variant: params.isPrimary ? ('primary' as const) : ('neutral' as const),
		},
	];

	return {
		mode: layers.find((layer) => layer?.mode)?.mode ?? 'stroke',
		variant: layers.find((layer) => layer?.variant)?.variant ?? 'neutral',
	};
};

export const ConsentButton = createForwardRef<
	ConsentButtonElement,
	ConsentButtonProps &
		ButtonVariantsProps & {
			consentAction?: ConsentActionThemeKey;
			isPrimary?: boolean;
			action:
				| 'accept-consent'
				| 'reject-consent'
				| 'custom-consent'
				| 'open-consent-dialog'
				| 'set-consent'
				| 'dismiss-notice';
			category?: AllConsentNames;
			closeConsentDialog?: boolean;
			closeConsentBanner?: boolean;
			performDefaultAction?: boolean;
		}
>(
	(
		{
			asChild,
			className: forwardedClassName,
			style,
			noStyle,
			action,
			slotKey,
			baseClassName,
			variant,
			mode,
			size = 'small',
			consentAction,
			isPrimary,
			onClick: forwardedOnClick,
			onFocus: forwardedOnFocus,
			onPointerEnter: forwardedOnPointerEnter,
			closeConsentBanner = false,
			closeConsentDialog = false,
			performDefaultAction = true,
			category,
			...props
		},
		ref
	) => {
		const saveKernelConsents = useConsentSaveAction();
		const { uiSource: trackedUISource } = useConsentTracking();
		const saveConsents = useCallback(
			(input?: Parameters<typeof saveKernelConsents>[0]) =>
				saveKernelConsents(input, toSaveUISource(trackedUISource)),
			[saveKernelConsents, trackedUISource]
		);
		const setActiveUI = useSetActiveUI();
		const dismissNotice = useDismissNotice();
		const { noStyle: contextNoStyle, theme } = useTheme();
		const { components } = useUIConfig();
		const resolvedButtonStyle = resolveConsentButtonStyle({
			consentAction,
			isPrimary,
			mode,
			theme,
			variant,
		});

		const defaultSlotKey =
			resolvedButtonStyle.variant === 'primary'
				? 'button.primary'
				: 'button.secondary';

		const slotProps = getSlotProps(components, slotKey ?? defaultSlotKey);
		const buttonStyleProps = mergeSlotProps(slotProps, {
			baseClassName: [
				Button.buttonVariants({
					mode: resolvedButtonStyle.mode,
					size,
					variant: resolvedButtonStyle.variant,
				}).root(),
				baseClassName,
			],
			className: forwardedClassName,
			noStyle: contextNoStyle || noStyle,
			style: {
				...(style as CSSPropertiesWithVars<CSSVariables>),
			},
		});

		if (!category && action === 'set-consent') {
			throw new Error('Category is required for set-consent action');
		}

		const buttonClick = useCallback(
			(e: MouseEvent<HTMLButtonElement>) => {
				forwardedOnClick?.(e);
				if (e.defaultPrevented) {
					return;
				}
				const actionSavesConsent =
					action === 'accept-consent' ||
					action === 'reject-consent' ||
					action === 'custom-consent';
				if ((closeConsentBanner || closeConsentDialog) && !actionSavesConsent) {
					setActiveUI('none');
				}

				if (action === 'open-consent-dialog') {
					setActiveUI('dialog');
				}

				if (performDefaultAction && action !== 'open-consent-dialog') {
					switch (action) {
						case 'accept-consent':
							saveConsents('all');
							break;
						case 'reject-consent':
							saveConsents('none');
							break;
						case 'custom-consent':
							void saveConsents();
							break;
						case 'dismiss-notice':
							void dismissNotice();
							break;
						case 'set-consent':
							if (!category) {
								throw new Error('Category is required for set-consent action');
							}

							void saveConsents({ [category]: true });
							break;
						default:
							break;
					}
				}
			},
			[
				closeConsentBanner,
				closeConsentDialog,
				forwardedOnClick,
				saveConsents,
				setActiveUI,
				action,
				category,
				dismissNotice,
				performDefaultAction,
			]
		);

		const opensDialog = action === 'open-consent-dialog';
		useIdleDialogWarming(opensDialog);
		const onFocus = forwardedOnFocus ?? buttonStyleProps.onFocus;
		const onPointerEnter =
			forwardedOnPointerEnter ?? buttonStyleProps.onPointerEnter;
		const buttonFocus = useCallback(
			(event: FocusEvent<HTMLButtonElement>) => {
				onFocus?.(event);
				if (opensDialog) {
					warmDialogChunk();
				}
			},
			[onFocus, opensDialog]
		);
		const buttonPointerEnter = useCallback(
			(event: PointerEvent<HTMLButtonElement>) => {
				onPointerEnter?.(event);
				if (opensDialog) {
					warmDialogChunk();
				}
			},
			[onPointerEnter, opensDialog]
		);

		const Comp = asChild ? Slot : 'button';

		const domProps = Object.fromEntries(
			Object.entries(props).filter(
				([key]) =>
					!NON_DOM_PROPS.includes(key as (typeof NON_DOM_PROPS)[number])
			)
		);

		const isStyled = !(contextNoStyle || noStyle);

		const ownProps = {
			'data-action': consentAction,
			type: asChild ? undefined : ('button' as const),
		};
		const renderedLayers = [ownProps, buttonStyleProps, domProps];
		const earlyTapOptOut = skipsEarlyTap({
			action,
			asChild,
			dataAction: renderedProp('data-action', renderedLayers),
			ownsClick: ownsClick({
				asChild,
				onClick: forwardedOnClick,
				type: renderedProp('type', renderedLayers),
			}),
			performDefaultAction,
		})
			? { [EARLY_TAP_OPT_OUT]: 'off' }
			: undefined;

		return (
			<Comp
				ref={ref}
				data-variant={isStyled ? resolvedButtonStyle.variant : undefined}
				data-mode={isStyled ? resolvedButtonStyle.mode : undefined}
				data-size={isStyled ? size : undefined}
				{...ownProps}
				{...buttonStyleProps}
				onClick={buttonClick}
				onFocus={buttonFocus}
				onPointerEnter={buttonPointerEnter}
				{...domProps}
				{...earlyTapOptOut}
			/>
		);
	}
);

ConsentButton.displayName = 'ConsentButton';
