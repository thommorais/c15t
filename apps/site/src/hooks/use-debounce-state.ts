import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'

type UseDebouncedStateOptions = {
	leading?: boolean
}

type UseDebouncedStateReturnValue<T> = [T, (newValue: SetStateAction<T>) => void]

const useDebouncedState = <T = unknown>(
	defaultValue: T,
	wait: number,
	options: UseDebouncedStateOptions = { leading: false },
): UseDebouncedStateReturnValue<T> => {
	const [value, setValue] = useState(defaultValue)
	const timeoutRef = useRef<number | null>(null)
	const leadingRef = useRef(true)

	const clearTimeout = useCallback(() => {
		window.clearTimeout(timeoutRef.current || 0)
	}, [])

	useEffect(() => clearTimeout, [clearTimeout])

	const debouncedSetValue = useCallback(
		(newValue: SetStateAction<T>) => {
			clearTimeout()
			if (leadingRef.current && options.leading) {
				setValue(newValue)
			} else {
				timeoutRef.current = window.setTimeout(() => {
					leadingRef.current = true
					setValue(newValue)
				}, wait)
			}
			leadingRef.current = false
		},
		[options.leading, clearTimeout, wait],
	)

	return [value, debouncedSetValue] as const
}

export { useDebouncedState }
