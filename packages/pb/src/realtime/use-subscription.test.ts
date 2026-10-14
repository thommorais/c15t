import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSubscription } from './use-subscription'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

const deferred = <T>() => {
	const handle = {} as { resolve: (value: T) => void; reject: (error: Error) => void; promise: Promise<T> }

	handle.promise = new Promise<T>((resolve, reject) => {
		handle.resolve = resolve
		handle.reject = reject
	})

	return handle
}

describe('useSubscription', () => {
	it('opens on mount and closes on unmount', async () => {
		const close = vi.fn(async () => {})
		const open = vi.fn(async () => close)

		const { unmount } = renderHook(() => useSubscription(open, []))
		await flush()

		expect(open).toHaveBeenCalledOnce()
		expect(close).not.toHaveBeenCalled()

		unmount()
		await flush()

		expect(close).toHaveBeenCalledOnce()
	})

	it('closes a subscription that only opened after the unmount', async () => {
		const close = vi.fn(async () => {})
		const opening = deferred<() => Promise<void>>()

		const { unmount } = renderHook(() => useSubscription(() => opening.promise, []))
		unmount()
		opening.resolve(close)
		await flush()

		expect(close).toHaveBeenCalledOnce()
	})

	it('reopens when a dependency changes', async () => {
		const closes = [vi.fn(async () => {}), vi.fn(async () => {})]
		const open = vi.fn(async () => closes[open.mock.calls.length - 1]!)

		const { rerender } = renderHook(({ topic }) => useSubscription(open, [topic]), {
			initialProps: { topic: 'a' },
		})
		await flush()

		rerender({ topic: 'b' })
		await flush()

		expect(open).toHaveBeenCalledTimes(2)
		expect(closes[0]).toHaveBeenCalledOnce()
		expect(closes[1]).not.toHaveBeenCalled()
	})

	it('keeps the subscription across renders that change nothing', async () => {
		const open = vi.fn(async () => async () => {})

		const { rerender } = renderHook(({ topic }) => useSubscription(open, [topic]), {
			initialProps: { topic: 'a' },
		})
		rerender({ topic: 'a' })
		await flush()

		expect(open).toHaveBeenCalledOnce()
	})

	it('does nothing when there is no subscription to open', async () => {
		const { unmount } = renderHook(() => useSubscription(() => undefined, []))

		unmount()
		await flush()
	})

	it('handles a subscription that fails to open, without waiting for the unmount', async () => {
		const opening = Promise.reject<() => Promise<void>>(new Error('refused'))
		const handled = vi.spyOn(opening, 'catch')

		const { unmount } = renderHook(() => useSubscription(() => opening, []))

		expect(handled).toHaveBeenCalledOnce()

		unmount()
		await flush()
	})
})
