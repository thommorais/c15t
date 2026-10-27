'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { ComponentProps, FC, ReactNode } from 'react';

import { useDevToolsLauncherAvailable } from '~/devtools-launcher';

import { TriggerButton } from './atoms/button';
import type { TriggerButtonProps } from './atoms/button';
import { TriggerIcon } from './atoms/icon';
import type { TriggerIconProps } from './atoms/icon';
import { TriggerRoot, useTriggerContext } from './atoms/root';
import type { TriggerRootProps } from './atoms/root';
import { TriggerText } from './atoms/text';
import type { TriggerTextProps } from './atoms/text';
import { getTriggerToolbar, loadTriggerToolbar } from './toolbar-loader';
import type { TriggerToolbarComponent } from './toolbar-loader';
import type {
	ConsentDialogTriggerProps,
	ConsentDialogTriggerToolbarAction,
} from './types';

const EMPTY_ACTIONS: readonly ConsentDialogTriggerToolbarAction[] = [];

type DevToolsToolbarProps = ComponentProps<TriggerToolbarComponent> & {
	fallback: ReactNode;
};

const DevToolsToolbar = ({ fallback, ...props }: DevToolsToolbarProps) => {
	const [loaded, setLoaded] = useState<TriggerToolbarComponent | undefined>(
		undefined
	);
	const toolbar = loaded ?? getTriggerToolbar();
	useEffect(() => {
		if (toolbar) {
			return;
		}
		let active = true;
		const load = async () => {
			try {
				const component = await loadTriggerToolbar();
				if (active) {
					setLoaded(() => component);
				}
			} catch {
			}
		};
		void load();
		return () => {
			active = false;
		};
	}, [toolbar]);
	return toolbar ? createElement(toolbar, props) : fallback;
};

const ConsentDialogTriggerComponent = ({
	icon = 'branding',
	defaultPosition = 'bottom-right',
	persistPosition = true,
	ariaLabel = 'Open privacy settings',
	showWhen = 'always',
	size = 'md',
	className,
	noStyle,
	onClick,
	onPositionChange,
}: ConsentDialogTriggerProps): ReactNode => {
	const hostsDevTools = useDevToolsLauncherAvailable();
	const preferences = useMemo(
		() => ({ className, icon, label: ariaLabel }),
		[ariaLabel, className, icon]
	);

	const button = (
		<TriggerButton
			size={size}
			ariaLabel={ariaLabel}
			className={className}
			noStyle={noStyle}
		>
			<TriggerIcon
				icon={icon}
				noStyle={noStyle}
			/>
		</TriggerButton>
	);

	return (
		<TriggerRoot
			defaultPosition={defaultPosition}
			persistPosition={persistPosition}
			showWhen={showWhen}
			onClick={onClick}
			onPositionChange={onPositionChange}
		>
			{hostsDevTools ? (
				<DevToolsToolbar
					actions={EMPTY_ACTIONS}
					fallback={button}
					noStyle={noStyle}
					preferences={preferences}
					size={size}
				/>
			) : (
				button
			)}
		</TriggerRoot>
	);
};

ConsentDialogTriggerComponent.displayName = 'ConsentDialogTrigger';

export interface ConsentDialogTriggerCompound extends FC<ConsentDialogTriggerProps> {
	Root: typeof TriggerRoot;
	Button: typeof TriggerButton;
	Icon: typeof TriggerIcon;
	Text: typeof TriggerText;
}

export const ConsentDialogTrigger = Object.assign(
	ConsentDialogTriggerComponent,
	{
		Button: TriggerButton,
		Icon: TriggerIcon,
		Root: TriggerRoot,
		Text: TriggerText,
	}
) as ConsentDialogTriggerCompound;

export type {
	TriggerButtonProps,
	TriggerIconProps,
	TriggerRootProps,
	TriggerTextProps,
};
export {
	TriggerButton,
	TriggerIcon,
	TriggerRoot,
	TriggerText,
	useTriggerContext,
};
