'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useConsentDialogTrigger } from '~/component-hooks/use-panel-trigger';
import { useBranding } from '~/hooks';
import { useIsHydrated } from '~/hooks/use-is-hydrated';

import { FIRST_PAINT_SHEETS } from '../../shared/first-paint-sheets';
import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import type { CornerPosition, TriggerVisibility } from '../types';
import { useDraggable } from '../use-draggable';
import type { UseDraggableReturn } from '../use-draggable';

export interface TriggerContextValue {
	corner: CornerPosition;
	isDragging: boolean;
	isSnapping: boolean;
	wasDragged: () => boolean;
	handlers: UseDraggableReturn['handlers'];
	dragStyle: React.CSSProperties;
	branding: string;
	openDialog: () => void;
	isVisible: boolean;
}

const TriggerContext = createContext<TriggerContextValue | null>(null);

export const useTriggerContext =
	function useTriggerContext(): TriggerContextValue {
		const context = useContext(TriggerContext);
		if (!context) {
			throw new Error(
				'ConsentDialogTrigger components must be used within a ConsentDialogTrigger.Root'
			);
		}
		return context;
	};

export interface TriggerRootProps {
	children: ReactNode;

	defaultPosition?: CornerPosition;

	persistPosition?: boolean;

	showWhen?: TriggerVisibility;

	visible?: boolean;

	onPositionChange?: (position: CornerPosition) => void;

	onClick?: () => void;
}

export const TriggerRoot = ({
	children,
	defaultPosition = 'bottom-right',
	persistPosition: shouldPersist = true,
	showWhen = 'always',
	visible,
	onPositionChange,
	onClick,
}: TriggerRootProps): ReactNode => {
	const branding = useBranding() ?? 'c15t';
	const { isVisible: computedVisible, openDialog } = useConsentDialogTrigger({
		onClick,
		showWhen,
	});
	const isVisible = visible ?? computedVisible;

	const { corner, isDragging, isSnapping, wasDragged, handlers, dragStyle } =
		useDraggable({
			defaultPosition,
			onPositionChange,
			persistPosition: shouldPersist,
		});

	const mounted = useIsHydrated();
	const sheetsReady = useSurfaceSheetsReady(FIRST_PAINT_SHEETS);

	const contextValue = useMemo<TriggerContextValue>(
		() => ({
			branding,
			corner,
			dragStyle,
			handlers,
			isDragging,
			isSnapping,
			isVisible,
			openDialog,
			wasDragged,
		}),
		[
			branding,
			corner,
			dragStyle,
			handlers,
			isDragging,
			isSnapping,
			isVisible,
			openDialog,
			wasDragged,
		]
	);

	if (!mounted || !isVisible || !sheetsReady) {
		return null;
	}

	return createPortal(
		<TriggerContext.Provider value={contextValue}>
			<SurfaceStyles sheets={FIRST_PAINT_SHEETS} />
			{children}
		</TriggerContext.Provider>,
		document.body
	);
};

TriggerRoot.displayName = 'ConsentDialogTrigger.Root';

export { TriggerContext };
