import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdleQueue } from './idle-queue'

type Listener = (event?: unknown) => void

let listeners: Record<string, Listener[]>
let visibilityState: DocumentVisibilityState

/**
 * Stubs just enough DOM for the queue: an idle callback that runs on a timer,
 * a document whose visibility we control, and listener bookkeeping so we can
 * assert the queue detaches on destroy.
 */
const setupDom = ({ userAgent = 'Mozilla/5.0 (Chrome)' } = {}) => {
	listeners = {}
	visibilityState = 'visible'

	vi.stubGlobal('document', {
		get visibilityState() {
			return visibilityState
		},
		createTextNode: () => ({ data: '' }),
	})

	vi.stubGlobal('window', { navigator: { userAgent } })
	vi.stubGlobal('navigator', { userAgent })

	vi.stubGlobal('addEventListener', (type: string, fn: Listener) => {
		listeners[type] ??= []
		listeners[type].push(fn)
	})

	vi.stubGlobal('removeEventListener', (type: string, fn: Listener) => {
		listeners[type] = (listeners[type] ?? []).filter(l => l !== fn)
	})

	// Drive idle callbacks off timers so tests stay deterministic.
	vi.stubGlobal('requestIdleCallback', undefined)
	vi.stubGlobal('cancelIdleCallback', undefined)
}

const flushIdle = async () => {
	await vi.advanceTimersByTimeAsync(1)
}

beforeEach(() => {
	vi.useFakeTimers()
	setupDom()
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe('createIdleQueue', () => {
	it('runs a queued task once the browser goes idle', async () => {
		const queue = createIdleQueue()
		const task = vi.fn()

		queue.pushTask(task)
		expect(task).not.toHaveBeenCalled()

		await flushIdle()
		expect(task).toHaveBeenCalledTimes(1)
	})

	it('runs tasks in FIFO order', async () => {
		const queue = createIdleQueue()
		const order: number[] = []

		queue.pushTask(() => order.push(1))
		queue.pushTask(() => order.push(2))
		await flushIdle()

		expect(order).toEqual([1, 2])
	})

	it('runs an unshifted task first', async () => {
		const queue = createIdleQueue()
		const order: string[] = []

		queue.pushTask(() => order.push('pushed'))
		queue.unshiftTask(() => order.push('unshifted'))
		await flushIdle()

		expect(order).toEqual(['unshifted', 'pushed'])
	})

	it('passes the state captured at queue time', async () => {
		const queue = createIdleQueue()
		const task = vi.fn()

		queue.pushTask(task)
		await flushIdle()

		expect(task).toHaveBeenCalledWith(expect.objectContaining({ visibilityState: 'visible' }))
		expect(typeof task.mock.calls[0]?.[0].time).toBe('number')
	})

	it('reports pending work', async () => {
		const queue = createIdleQueue()

		queue.pushTask(() => {})
		expect(queue.hasPendingTasks()).toBe(true)

		await flushIdle()
		expect(queue.hasPendingTasks()).toBe(false)
	})

	it('drops pending tasks when cleared', async () => {
		const queue = createIdleQueue()
		const task = vi.fn()

		queue.pushTask(task)
		queue.clearPendingTasks()
		await flushIdle()

		expect(task).not.toHaveBeenCalled()
		expect(queue.hasPendingTasks()).toBe(false)
	})

	it('runs tasks synchronously on demand', () => {
		const queue = createIdleQueue()
		const task = vi.fn()

		queue.pushTask(task)
		queue.runTasksImmediately()

		expect(task).toHaveBeenCalledTimes(1)
	})

	it('exposes the running task state, and null between tasks', () => {
		const queue = createIdleQueue()
		let seen: unknown = 'unset'

		queue.pushTask(() => {
			seen = queue.getState()
		})
		queue.runTasksImmediately()

		expect(seen).toMatchObject({ visibilityState: 'visible' })
		expect(queue.getState()).toBeNull()
	})

	// The original let a throwing task escape runTasks, leaving isProcessing
	// stuck true so the queue never ran again.
	it('keeps running after a task throws', () => {
		const onError = vi.fn()
		const queue = createIdleQueue({ onError })
		const after = vi.fn()

		queue.pushTask(() => {
			throw new Error('bad task')
		})
		queue.pushTask(after)
		queue.runTasksImmediately()

		expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything())
		expect(after).toHaveBeenCalledTimes(1)
		expect(queue.hasPendingTasks()).toBe(false)
	})

	it('clears currentState after a task throws', () => {
		const queue = createIdleQueue({ onError: () => {} })

		queue.pushTask(() => {
			throw new Error('bad task')
		})
		queue.runTasksImmediately()

		expect(queue.getState()).toBeNull()
	})

	it('yields when the deadline runs short and resumes later', async () => {
		// A budget below minTaskTime means the queue must yield immediately.
		vi.stubGlobal(
			'requestIdleCallback',
			(cb: (d: IdleDeadline) => void) =>
				setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 5 } as IdleDeadline), 0) as unknown as number,
		)
		vi.stubGlobal('cancelIdleCallback', (h: number) => clearTimeout(h))

		const queue = createIdleQueue()
		const task = vi.fn()

		queue.pushTask(task, { minTaskTime: 10 })
		await flushIdle()

		expect(task).not.toHaveBeenCalled()
		expect(queue.hasPendingTasks()).toBe(true)
	})

	it('honours a default minTaskTime from the queue options', async () => {
		vi.stubGlobal(
			'requestIdleCallback',
			(cb: (d: IdleDeadline) => void) =>
				setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 5 } as IdleDeadline), 0) as unknown as number,
		)
		vi.stubGlobal('cancelIdleCallback', (h: number) => clearTimeout(h))

		const queue = createIdleQueue({ minTaskTime: 10 })
		const task = vi.fn()

		queue.pushTask(task)
		await flushIdle()

		expect(task).not.toHaveBeenCalled()
	})
})

describe('ensureTasksRun', () => {
	it('attaches a visibilitychange listener only when enabled', () => {
		createIdleQueue({ ensureTasksRun: true })
		expect(listeners.visibilitychange).toHaveLength(1)

		listeners = {}
		createIdleQueue()
		expect(listeners.visibilitychange).toBeUndefined()
	})

	it('flushes pending tasks when the page is hidden', () => {
		const queue = createIdleQueue({ ensureTasksRun: true })
		const task = vi.fn()

		queue.pushTask(task)
		visibilityState = 'hidden'
		for (const listener of listeners.visibilitychange ?? []) {
			listener()
		}

		expect(task).toHaveBeenCalledTimes(1)
	})

	it('adds a beforeunload flush on Safari only', () => {
		setupDom({ userAgent: 'Mozilla/5.0 (Macintosh) Version/17.0 Safari/605.1.15' })
		createIdleQueue({ ensureTasksRun: true })
		expect(listeners.beforeunload).toHaveLength(1)

		setupDom({ userAgent: 'Mozilla/5.0 (Chrome)' })
		createIdleQueue({ ensureTasksRun: true })
		expect(listeners.beforeunload).toBeUndefined()
	})
})

describe('destroy', () => {
	it('detaches every listener it attached', () => {
		setupDom({ userAgent: 'Mozilla/5.0 (Macintosh) Version/17.0 Safari/605.1.15' })
		const queue = createIdleQueue({ ensureTasksRun: true })

		queue.destroy()

		expect(listeners.visibilitychange).toHaveLength(0)
		expect(listeners.beforeunload).toHaveLength(0)
	})

	it('drops pending tasks', async () => {
		const queue = createIdleQueue()
		const task = vi.fn()

		queue.pushTask(task)
		queue.destroy()
		await flushIdle()

		expect(task).not.toHaveBeenCalled()
	})

	// The original reset state after destroy but kept scheduling, so a task
	// pushed afterwards would run against a torn-down queue.
	it('ignores tasks pushed after destroy', async () => {
		const queue = createIdleQueue()
		const task = vi.fn()

		queue.destroy()
		queue.pushTask(task)
		await flushIdle()

		expect(task).not.toHaveBeenCalled()
		expect(queue.hasPendingTasks()).toBe(false)
	})
})
