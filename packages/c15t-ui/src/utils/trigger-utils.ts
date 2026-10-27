export type CornerPosition =
	| 'bottom-right'
	| 'top-right'
	| 'bottom-left'
	| 'top-left';

export interface DragState {
	isDragging: boolean;
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
}

export interface TriggerConfig {
	defaultPosition: CornerPosition;
	offset: number;
	persistPosition: boolean;
	storageKey: string;
}

export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
	defaultPosition: 'bottom-right',
	offset: 20,
	persistPosition: true,
	storageKey: 'c15t-trigger-position',
};

export const DRAG_THRESHOLD = 30;

export const VELOCITY_THRESHOLD = 0.15;

export const calculateNearestCorner = function calculateNearestCorner(
	x: number,
	y: number,
	viewportWidth: number,
	viewportHeight: number
): CornerPosition {
	const isRight = x > viewportWidth / 2;
	const isBottom = y > viewportHeight / 2;

	if (isBottom && isRight) {
		return 'bottom-right';
	}
	if (isBottom && !isRight) {
		return 'bottom-left';
	}
	if (!isBottom && isRight) {
		return 'top-right';
	}
	return 'top-left';
};

export const calculateCornerFromDrag = function calculateCornerFromDrag(
	currentCorner: CornerPosition,
	dragX: number,
	dragY: number,
	options: {
		threshold?: number;
		velocityX?: number;
		velocityY?: number;
	} = {}
): CornerPosition {
	const { threshold = DRAG_THRESHOLD, velocityX = 0, velocityY = 0 } = options;

	const absDragX = Math.abs(dragX);
	const absDragY = Math.abs(dragY);
	const absVelocityX = Math.abs(velocityX);
	const absVelocityY = Math.abs(velocityY);

	const hasVelocityX = absVelocityX >= VELOCITY_THRESHOLD;
	const hasVelocityY = absVelocityY >= VELOCITY_THRESHOLD;

	const velocityDistanceThreshold = 10;

	const shouldMoveX =
		absDragX >= threshold ||
		(hasVelocityX && absDragX >= velocityDistanceThreshold);
	const shouldMoveY =
		absDragY >= threshold ||
		(hasVelocityY && absDragY >= velocityDistanceThreshold);

	if (!shouldMoveX && !shouldMoveY) {
		return currentCorner;
	}

	const isCurrentlyBottom = currentCorner.includes('bottom');
	const isCurrentlyRight = currentCorner.includes('right');

	let isBottom = isCurrentlyBottom;
	let isRight = isCurrentlyRight;

	if (shouldMoveX) {
		isRight = dragX > 0;
	}

	if (shouldMoveY) {
		isBottom = dragY > 0;
	}

	if (isBottom && isRight) {
		return 'bottom-right';
	}
	if (isBottom && !isRight) {
		return 'bottom-left';
	}
	if (!isBottom && isRight) {
		return 'top-right';
	}
	return 'top-left';
};

export const getCornerStyles = function getCornerStyles(
	corner: CornerPosition,
	offset = 16
): Record<string, string | undefined> {
	const styles: Record<string, string | undefined> = {};

	if (corner.includes('bottom')) {
		styles.bottom = `${offset}px`;
		styles.top = undefined;
	} else {
		styles.top = `${offset}px`;
		styles.bottom = undefined;
	}

	if (corner.includes('right')) {
		styles.right = `${offset}px`;
		styles.left = undefined;
	} else {
		styles.left = `${offset}px`;
		styles.right = undefined;
	}

	return styles;
};

export const persistPosition = function persistPosition(
	corner: CornerPosition,
	storageKey: string = DEFAULT_TRIGGER_CONFIG.storageKey
): void {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(storageKey, corner);
		}
	} catch {
	}
};

export const getPersistedPosition = function getPersistedPosition(
	storageKey: string = DEFAULT_TRIGGER_CONFIG.storageKey
): CornerPosition | null {
	try {
		if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem(storageKey);
			if (
				stored === 'bottom-right' ||
				stored === 'top-right' ||
				stored === 'bottom-left' ||
				stored === 'top-left'
			) {
				return stored;
			}
		}
	} catch {
	}
	return null;
};

export const createInitialDragState =
	function createInitialDragState(): DragState {
		return {
			currentX: 0,
			currentY: 0,
			isDragging: false,
			startX: 0,
			startY: 0,
		};
	};

export const calculateDragOffset = function calculateDragOffset(
	dragState: DragState
): {
	x: number;
	y: number;
} {
	if (!dragState.isDragging) {
		return { x: 0, y: 0 };
	}
	return {
		x: dragState.currentX - dragState.startX,
		y: dragState.currentY - dragState.startY,
	};
};
