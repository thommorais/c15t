import { cIC, rIC, type IdleDeadline } from './idle-callback'
import { queueMicrotask } from './queue-microtask'

const DEFAULT_MIN_TASK_TIME = 0

/** The state captured when a task was queued, passed to it when it runs. */
export interface TaskState {
	time: number
	visibilityState: DocumentVisibilityState
}

export type Task = (state: TaskState) => void

export interface TaskOptions {
	minTaskTime?: number
}

export interface IdleQueueOptions extends TaskOptions {
	/**
	 * Flush pending tasks when the page is hidden or unloaded, so queued work
	 * is not lost when the user leaves.
	 */
	ensureTasksRun?: boolean
	/** Reports a task that threw, instead of letting it halt the queue. */
	onError?: (error: unknown, state: TaskState) => void
}

interface QueuedTask {
	state: TaskState
	task: Task
	minTaskTime: number
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

// Safari historically dropped work queued during `visibilitychange`, so it also
// needs the `beforeunload` flush.
const isSafari = () => isBrowser() && /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent)

const shouldYield = (deadline: IdleDeadline | undefined, minTaskTime: number): boolean =>
	!!deadline && deadline.timeRemaining() <= minTaskTime

const createTaskState = (): TaskState => ({
	time: Date.now(),
	visibilityState: isBrowser() ? document.visibilityState : 'visible',
})

/**
 * A queue that runs tasks while the browser is idle.
 *
 * Tasks run in FIFO order, yielding back to the browser when the idle deadline
 * runs short, and resuming on the next idle period.
 */
export const createIdleQueue = (options: IdleQueueOptions = {}) => {
	const { ensureTasksRun = false, minTaskTime: defaultMinTaskTime = DEFAULT_MIN_TASK_TIME, onError } = options

	let taskQueue: QueuedTask[] = []
	let idleCallbackHandle: number | null = null
	let isProcessing = false
	let currentState: TaskState | null = null
	let isDestroyed = false

	const cancelScheduledRun = () => {
		if (idleCallbackHandle !== null) {
			cIC(idleCallbackHandle)
			idleCallbackHandle = null
		}
	}

	const runTasks = (deadline?: IdleDeadline) => {
		cancelScheduledRun()

		if (isProcessing) {
			return
		}

		isProcessing = true

		try {
			while (taskQueue.length > 0 && !shouldYield(deadline, taskQueue[0]?.minTaskTime ?? 0)) {
				const nextTask = taskQueue.shift()

				if (!nextTask) {
					break
				}

				currentState = nextTask.state

				try {
					nextTask.task(nextTask.state)
				} catch (error) {
					// One failing task must not strand the rest of the queue.
					if (onError) {
						onError(error, nextTask.state)
					} else {
						setTimeout(() => {
							throw error
						}, 0)
					}
				} finally {
					currentState = null
				}
			}
		} finally {
			isProcessing = false
		}

		if (taskQueue.length > 0) {
			scheduleTasksToRun()
		}
	}

	const scheduleTasksToRun = () => {
		if (isDestroyed) {
			return
		}

		if (ensureTasksRun && isBrowser() && document.visibilityState === 'hidden') {
			queueMicrotask(() => runTasks())
		} else if (idleCallbackHandle === null) {
			idleCallbackHandle = rIC(runTasks)
		}
	}

	const enqueue = (task: Task, taskOptions: TaskOptions = {}, position: 'start' | 'end') => {
		if (isDestroyed) {
			return
		}

		const { minTaskTime = defaultMinTaskTime } = taskOptions
		const queued: QueuedTask = { state: createTaskState(), task, minTaskTime }

		if (position === 'start') {
			taskQueue.unshift(queued)
		} else {
			taskQueue.push(queued)
		}

		scheduleTasksToRun()
	}

	const runTasksImmediately = () => {
		runTasks()
	}

	const onVisibilityChange = () => {
		if (document.visibilityState === 'hidden') {
			runTasksImmediately()
		}
	}

	const listensForUnload = ensureTasksRun && isBrowser()
	const needsBeforeUnload = listensForUnload && isSafari()

	if (listensForUnload) {
		addEventListener('visibilitychange', onVisibilityChange, true)

		if (needsBeforeUnload) {
			addEventListener('beforeunload', runTasksImmediately, true)
		}
	}

	return {
		/** Queues a task to run after those already pending. */
		pushTask: (task: Task, taskOptions?: TaskOptions) => {
			enqueue(task, taskOptions, 'end')
		},

		/** Queues a task to run before those already pending. */
		unshiftTask: (task: Task, taskOptions?: TaskOptions) => {
			enqueue(task, taskOptions, 'start')
		},

		/** Runs every pending task now, ignoring the idle deadline. */
		runTasksImmediately,

		hasPendingTasks: () => taskQueue.length > 0,

		clearPendingTasks: () => {
			taskQueue = []
			cancelScheduledRun()
		},

		/** The state of the task currently running, or `null` between tasks. */
		getState: () => currentState,

		/** Drops pending tasks and detaches listeners. The queue is unusable after. */
		destroy: () => {
			isDestroyed = true
			taskQueue = []
			cancelScheduledRun()

			if (listensForUnload) {
				removeEventListener('visibilitychange', onVisibilityChange, true)

				if (needsBeforeUnload) {
					removeEventListener('beforeunload', runTasksImmediately, true)
				}
			}
		},
	}
}

export type IdleQueue = ReturnType<typeof createIdleQueue>
