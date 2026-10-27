'use client';

import type { ReactNode } from 'react';

import { useHasConsentPreferences, usePromptRequirement } from '~/hooks';

import { TriggerRoot } from './atoms/root';
import { TriggerToolbar } from './atoms/toolbar';
import type {
	ConsentDialogTriggerToolbarAction,
	ConsentDialogTriggerToolbarPreferences,
	ConsentDialogTriggerToolbarProps,
} from './types';

const EMPTY_ACTIONS: readonly ConsentDialogTriggerToolbarAction[] = [];
const DEFAULT_PREFERENCES: ConsentDialogTriggerToolbarPreferences = {};

export const ConsentDialogTriggerToolbar = ({
	actions = EMPTY_ACTIONS,
	preferences = DEFAULT_PREFERENCES,
	orientation = 'horizontal',
	defaultPosition = 'bottom-right',
	persistPosition = true,
	ariaLabel = 'Privacy controls',
	showWhen = 'always',
	size = 'md',
	className,
	style,
	noStyle = false,
	onPositionChange,
}: ConsentDialogTriggerToolbarProps): ReactNode => {
	const promptRequirement = usePromptRequirement();
	const hasConsentUI = useHasConsentPreferences();
	const promptSettled =
		showWhen !== 'after-prompt' || promptRequirement.kind === 'none';
	const showPreferences = hasConsentUI && showWhen !== 'never' && promptSettled;
	const visible = actions.length > 0 || showPreferences;

	return (
		<TriggerRoot
			defaultPosition={defaultPosition}
			onPositionChange={onPositionChange}
			persistPosition={persistPosition}
			visible={visible}
		>
			<TriggerToolbar
				actions={actions}
				ariaLabel={ariaLabel}
				className={className}
				noStyle={noStyle}
				orientation={orientation}
				preferences={preferences}
				showPreferences={showPreferences}
				size={size}
				style={style}
			/>
		</TriggerRoot>
	);
};

ConsentDialogTriggerToolbar.displayName = 'ConsentDialogTriggerToolbar';
