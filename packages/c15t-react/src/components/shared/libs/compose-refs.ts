import { useMemo } from 'react';
import type { Ref, RefCallback } from 'react';

export const composeRefs = function composeRefs<ElementType>(
	...refs: (Ref<ElementType> | undefined)[]
): RefCallback<ElementType> {
	return (node) => {
		for (const ref of refs) {
			if (typeof ref === 'function') {
				ref(node);
				continue;
			}

			if (ref && 'current' in ref) {
				ref.current = node;
			}
		}
	};
};

export const useComposedRefs = function useComposedRefs<ElementType>(
	first: Ref<ElementType> | undefined,
	second: Ref<ElementType> | undefined
): RefCallback<ElementType> {
	return useMemo(() => composeRefs(first, second), [first, second]);
};
