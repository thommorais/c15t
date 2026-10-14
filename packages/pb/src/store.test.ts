import { act, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { create } from './store'

describe('a store', () => {
	it('starts from a copy of the initial state', () => {
		const initial = { count: 0, label: 'a' }
		const useStore = create(initial)

		useStore.setState('count', 1)

		expect(useStore.getState()).toEqual({ count: 1, label: 'a' })
		expect(initial.count).toBe(0)
	})

	it('tells listeners which key changed', () => {
		const useStore = create({ count: 0, label: 'a' })
		const listener = vi.fn()
		useStore.subscribe(listener)

		useStore.setState('label', 'b')

		expect(listener).toHaveBeenCalledExactlyOnceWith({ count: 0, label: 'b' }, 'label')
	})

	it('stays quiet when the value is the same', () => {
		const useStore = create({ count: 0 })
		const listener = vi.fn()
		useStore.subscribe(listener)

		useStore.setState('count', 0)

		expect(listener).not.toHaveBeenCalled()
	})

	it('stops telling a listener that unsubscribed', () => {
		const useStore = create({ count: 0 })
		const listener = vi.fn()
		const unsubscribe = useStore.subscribe(listener)

		unsubscribe()
		useStore.setState('count', 1)

		expect(listener).not.toHaveBeenCalled()
	})

	it('writes every key before telling listeners about any of them', () => {
		const useStore = create({ count: 0, label: 'a', done: false })
		const seen: unknown[] = []
		useStore.subscribe((state, key) => seen.push([key, { ...state }]))

		useStore.assign({ count: 1, label: 'a', done: true })

		expect(seen).toEqual([
			['count', { count: 1, label: 'a', done: true }],
			['done', { count: 1, label: 'a', done: true }],
		])
	})
})

describe('a store hook', () => {
	const counted = <TResult>(read: () => TResult) => {
		const renders = { count: 0 }

		const view = renderHook(() => {
			renders.count += 1
			return read()
		})

		return { ...view, renders }
	}

	it('reads the current value of a key', () => {
		const useStore = create({ count: 3, label: 'a' })

		const { result } = renderHook(() => useStore().count)

		expect(result.current).toBe(3)
	})

	it('re-renders a reader when its key changes', () => {
		const useStore = create({ count: 0, label: 'a' })
		const { result, renders } = counted(() => useStore().count)

		act(() => useStore.setState('count', 1))

		expect(result.current).toBe(1)
		expect(renders.count).toBe(2)
	})

	it('leaves a reader alone when another key changes', () => {
		const useStore = create({ count: 0, label: 'a' })
		const { renders } = counted(() => useStore().count)

		act(() => useStore.setState('label', 'b'))

		expect(renders.count).toBe(1)
	})

	it('leaves a component alone when it read nothing', () => {
		const useStore = create({ count: 0, label: 'a' })
		const { renders } = counted(() => {
			useStore()
		})

		act(() => useStore.assign({ count: 1, label: 'b' }))

		expect(renders.count).toBe(1)
	})

	it('leaves a reader alone when its key is set to the same value', () => {
		const useStore = create({ count: 0 })
		const { renders } = counted(() => useStore().count)

		act(() => useStore.setState('count', 0))

		expect(renders.count).toBe(1)
	})

	it('renders once for several keys written together', () => {
		const useStore = create({ count: 0, label: 'a' })
		const { result, renders } = counted(() => {
			const store = useStore()
			return `${store.count}${store.label}`
		})

		act(() => useStore.assign({ count: 1, label: 'b' }))

		expect(result.current).toBe('1b')
		expect(renders.count).toBe(2)
	})

	it('starts following a key the first time it is read', () => {
		const useStore = create({ count: 0, label: 'a' })
		const { result, rerender, renders } = renderHookWithProps(useStore)

		act(() => useStore.setState('label', 'b'))
		expect(renders.count).toBe(1)

		rerender({ withLabel: true })
		act(() => useStore.setState('label', 'c'))

		expect(result.current).toBe('0c')
	})

	it('catches a change made between render and subscription', () => {
		const useStore = create({ count: 0 })

		const { result } = renderHook(() => {
			const { count } = useStore()

			useLayoutEffect(() => {
				useStore.setState('count', 7)
			}, [])

			return count
		})

		expect(result.current).toBe(7)
	})

	it('writes through the returned object', () => {
		const useStore = create({ count: 0 })
		const { result } = renderHook(() => useStore())

		act(() => {
			result.current.count = 4
		})

		expect(useStore.getState().count).toBe(4)
	})

	it('keeps separate stores apart', () => {
		const useFirst = create({ count: 0 })
		const useSecond = create({ count: 0 })
		const { renders } = counted(() => useFirst().count)

		act(() => useSecond.setState('count', 1))

		expect(renders.count).toBe(1)
	})
})

const renderHookWithProps = (useStore: ReturnType<typeof create<{ count: number; label: string }>>) => {
	const renders = { count: 0 }

	const view = renderHook(
		({ withLabel }) => {
			renders.count += 1
			const store = useStore()

			return withLabel ? `${store.count}${store.label}` : `${store.count}`
		},
		{ initialProps: { withLabel: false } },
	)

	return { ...view, renders }
}
