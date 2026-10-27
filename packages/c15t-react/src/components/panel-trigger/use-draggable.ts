'use client';

import {
	calculateCornerFromDrag,
	createInitialDragState,
	getPersistedPosition,
	persistPosition as persistToStorage,
} from '@c15t/ui/utils/trigger-utils';
import type { CornerPosition, DragState } from '@c15t/ui/utils/trigger-utils';
import { useCallback, useRef, useState } from 'react';

export interface UseDraggableOptions {
	defaultPosition?: CornerPosition;

	persistPosition?: boolean;

	onPositionChange?: (position: CornerPosition) => void;
}

export interface UseDraggableReturn {
	corner: CornerPosition;

	isDragging: boolean;

	isSnapping: boolean;

	wasDragged: () => boolean;

	handlers: {
		onPointerDown: (e: React.PointerEvent) => void;
		onPointerMove: (e: React.PointerEvent) => void;
		onPointerUp: (e: React.PointerEvent) => void;
		onPointerCancel: (e: React.PointerEvent) => void;
	};

	dragStyle: React.CSSProperties;
}

export const useDraggable = function useDraggable(
	options: UseDraggableOptions = {}
): UseDraggableReturn {
	const {
		defaultPosition = 'bottom-right',
		persistPosition = true,
		onPositionChange,
	} = options;

	const [corner, setCorner] = useState<CornerPosition>(() => {
		if (persistPosition && typeof window !== 'undefined') {
			const persisted = getPersistedPosition();
			if (persisted) {
				return persisted;
			}
		}
		return defaultPosition;
	});

	const [dragState, setDragState] = useState<DragState>(createInitialDragState);
	const [isSnapping, setIsSnapping] = useState(false);

	const hasDraggedRef = useRef(false);
	const elementRef = useRef<HTMLElement | null>(null);
	const dragStartTimeRef = useRef<number>(0);

	const updateCorner = useCallback(
		(newCorner: CornerPosition) => {
			setCorner(newCorner);
			if (persistPosition) {
				persistToStorage(newCorner);
			}
			onPositionChange?.(newCorner);
		},
		[persistPosition, onPositionChange]
	);

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		if (e.button !== 0) {
			return;
		}

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		elementRef.current = e.target as HTMLElement;
		hasDraggedRef.current = false;
		dragStartTimeRef.current = Date.now();

		setDragState({
			currentX: e.clientX,
			currentY: e.clientY,
			isDragging: true,
			startX: e.clientX,
			startY: e.clientY,
		});

		setIsSnapping(false);
	}, []);

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		setDragState((prev: DragState) => {
			if (!prev.isDragging) {
				return prev;
			}

			const dx = Math.abs(e.clientX - prev.startX);
			const dy = Math.abs(e.clientY - prev.startY);
			if (dx > 5 || dy > 5) {
				hasDraggedRef.current = true;
			}

			return {
				...prev,
				currentX: e.clientX,
				currentY: e.clientY,
			};
		});
	}, []);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (elementRef.current) {
				elementRef.current.releasePointerCapture(e.pointerId);
			}

			setDragState((prev: DragState) => {
				if (!prev.isDragging) {
					return prev;
				}

				if (hasDraggedRef.current) {
					const dragX = e.clientX - prev.startX;
					const dragY = e.clientY - prev.startY;
					const dragDuration = Date.now() - dragStartTimeRef.current;

					const velocityX = dragDuration > 0 ? dragX / dragDuration : 0;
					const velocityY = dragDuration > 0 ? dragY / dragDuration : 0;

					const newCorner = calculateCornerFromDrag(corner, dragX, dragY, {
						velocityX,
						velocityY,
					});

					if (newCorner !== corner) {
						setIsSnapping(true);
						setTimeout(() => setIsSnapping(false), 300);
						updateCorner(newCorner);
					}
				}

				return createInitialDragState();
			});
		},
		[corner, updateCorner]
	);

	const handlePointerCancel = useCallback((e: React.PointerEvent) => {
		if (elementRef.current) {
			elementRef.current.releasePointerCapture(e.pointerId);
		}
		setDragState(createInitialDragState());
	}, []);

	const dragStyle: React.CSSProperties = dragState.isDragging
		? {
				transform: `translate(${dragState.currentX - dragState.startX}px, ${dragState.currentY - dragState.startY}px)`,
				transition: 'none',
			}
		: {};

	const wasDragged = useCallback(() => hasDraggedRef.current, []);

	return {
		corner,
		dragStyle,
		handlers: {
			onPointerCancel: handlePointerCancel,
			onPointerDown: handlePointerDown,
			onPointerMove: handlePointerMove,
			onPointerUp: handlePointerUp,
		},
		isDragging: dragState.isDragging,
		isSnapping,
		wasDragged,
	};
};
