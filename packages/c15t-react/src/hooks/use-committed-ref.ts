'use client';

import { useInsertionEffect, useRef } from 'react';

export const useCommittedRef = function useCommittedRef<Value>(value: Value): {
	readonly current: Value;
} {
	const ref = useRef(value);
	useInsertionEffect(() => {
		ref.current = value;
	}, [value]);
	return ref;
};
