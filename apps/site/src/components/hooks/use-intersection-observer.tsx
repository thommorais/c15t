import { useEffect, useRef, useState } from 'react'

type State = {
	isIntersecting: boolean
	entry?: IntersectionObserverEntry
}

type UseIntersectionObserverOptions = {
	root?: Element | Document | null
	rootMargin?: string
	threshold?: number | number[]
	freezeOnceVisible?: boolean
	onChange?: (isIntersecting: boolean, entry: IntersectionObserverEntry) => void
	initialIsIntersecting?: boolean
}

type IntersectionReturn = [(node?: Element | null) => void, boolean, IntersectionObserverEntry | undefined] & {
	ref: (node?: Element | null) => void
	isIntersecting: boolean
	entry?: IntersectionObserverEntry
}

const normalizeThresholds = (thresholds: number | readonly number[]): number[] => {
	if (typeof thresholds === 'number') {
		return [thresholds]
	}
	return Array.from(thresholds) as number[]
}

const checkIntersecting = (entry: IntersectionObserverEntry, thresholds: number[]): boolean => {
	return entry.isIntersecting && thresholds.some(threshold => entry.intersectionRatio >= threshold)
}

const useIntersectionObserver = ({
	threshold = 0,
	root = null,
	rootMargin = '0%',
	freezeOnceVisible = false,
	initialIsIntersecting = false,
	onChange,
}: UseIntersectionObserverOptions = {}): IntersectionReturn => {
	const [ref, setRef] = useState<Element | null>(null)

	const [state, setState] = useState<State>(() => ({
		isIntersecting: initialIsIntersecting,
		entry: undefined,
	}))

	const callbackRef = useRef<UseIntersectionObserverOptions['onChange']>(null)

	callbackRef.current = onChange

	const frozen = state.entry?.isIntersecting && freezeOnceVisible

	useEffect(() => {
		if (!ref) return

		// Ensure the browser supports the Intersection Observer API
		if (!('IntersectionObserver' in window)) return

		if (frozen) return

		let unobserve: (() => void) | undefined

		const observer = new IntersectionObserver(
			(entries: IntersectionObserverEntry[]): void => {
				const thresholds = normalizeThresholds(observer.thresholds)

				for (const entry of entries) {
					const isIntersecting = checkIntersecting(entry, thresholds)

					setState({ isIntersecting, entry })

					if (callbackRef.current) {
						callbackRef.current(isIntersecting, entry)
					}

					if (isIntersecting && freezeOnceVisible && unobserve) {
						unobserve()
						unobserve = undefined
					}
				}
			},
			{ threshold, root, rootMargin },
		)

		observer.observe(ref)

		return () => {
			observer.disconnect()
		}
	}, [ref, threshold, root, rootMargin, frozen, freezeOnceVisible])

	// ensures that if the observed element changes, the intersection observer is reinitialized
	const prevRef = useRef<Element | null>(null)

	useEffect(() => {
		if (!ref && state.entry?.target && !freezeOnceVisible && !frozen && prevRef.current !== state.entry.target) {
			prevRef.current = state.entry.target
			setState({ isIntersecting: initialIsIntersecting, entry: undefined })
		}
	}, [ref, state.entry, freezeOnceVisible, frozen, initialIsIntersecting])

	const result = [setRef, !!state.isIntersecting, state.entry] as IntersectionReturn

	// Support object destructuring, by adding the specific values.
	result.ref = result[0]
	result.isIntersecting = result[1]
	result.entry = result[2]

	return result
}

export { useIntersectionObserver }
