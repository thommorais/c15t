import { afterEach, describe, expect, it, vi } from 'vitest'
import { queueMicrotask } from './queue-microtask'

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('queueMicrotask', () => {
	it('runs the callback asynchronously', async () => {
		const task = vi.fn()

		queueMicrotask(task)
		expect(task).not.toHaveBeenCalled()

		await Promise.resolve()
		await Promise.resolve()
		expect(task).toHaveBeenCalledTimes(1)
	})

	it('runs callbacks in order', async () => {
		const order: number[] = []

		queueMicrotask(() => order.push(1))
		queueMicrotask(() => order.push(2))

		await Promise.resolve()
		await Promise.resolve()
		expect(order).toEqual([1, 2])
	})

	// A throwing task used to become an unhandled *rejection*, which is easy to
	// miss. It is now rethrown on the macrotask queue, where it surfaces as a
	// normal uncaught error instead.
	it('surfaces a throwing task as an uncaught error, not a rejection', async () => {
		const onRejection = vi.fn()
		const onException = vi.fn()
		process.on('unhandledRejection', onRejection)
		process.prependListener('uncaughtException', onException)

		try {
			queueMicrotask(() => {
				throw new Error('task failed')
			})

			await new Promise(resolve => setTimeout(resolve, 5))
			expect(onRejection).not.toHaveBeenCalled()
			expect(onException).toHaveBeenCalledWith(expect.any(Error), expect.anything())
		} finally {
			process.off('unhandledRejection', onRejection)
			process.off('uncaughtException', onException)
		}
	})

	it('keeps running later tasks after one throws', async () => {
		const onException = vi.fn()
		process.prependListener('uncaughtException', onException)
		const after = vi.fn()

		try {
			queueMicrotask(() => {
				throw new Error('first fails')
			})
			queueMicrotask(after)

			await new Promise(resolve => setTimeout(resolve, 5))
			expect(after).toHaveBeenCalledTimes(1)
		} finally {
			process.off('uncaughtException', onException)
		}
	})
})
