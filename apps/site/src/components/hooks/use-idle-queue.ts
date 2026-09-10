import { createIdleQueue, type IdleQueue } from '@thom/idle-queue'
import { useEffect, useRef } from 'react'

// oxlint-disable-next-line typescript/no-explicit-any -- Just a placeholder type for now
type ANYTHING = any
interface UseIdleQueueOptions {
	ensureTasksRun?: boolean
	defaultMinTaskTime?: number
	onError?: (error: Error) => void
}

const useIdleQueue = (options: UseIdleQueueOptions = {}) => {
	const queueRef = useRef<IdleQueue | null>(null)
	const { ensureTasksRun = true, defaultMinTaskTime = 0, onError } = options

	// Held in a ref so a new onError identity does not tear down the queue.
	const onErrorRef = useRef(onError)
	onErrorRef.current = onError

	useEffect(() => {
		// Create the queue when the component mounts
		queueRef.current = createIdleQueue({
			ensureTasksRun,
			minTaskTime: defaultMinTaskTime,
			onError: error => {
				onErrorRef.current?.(error instanceof Error ? error : new Error('Unknown error'))
			},
		})

		// Cleanup when component unmounts
		return () => {
			queueRef.current?.destroy()
			queueRef.current = null
		}
	}, [ensureTasksRun, defaultMinTaskTime])

	const safeExecute = <T extends (...args: ANYTHING[]) => ANYTHING>(operation: T): ReturnType<T> | undefined => {
		try {
			if (!queueRef.current) {
				throw new Error('Idle queue not initialized')
			}
			return operation()
		} catch (error) {
			onError?.(error instanceof Error ? error : new Error('Unknown error'))
		}
	}

	return {
		pushTask: (task: Parameters<IdleQueue['pushTask']>[0], options?: Parameters<IdleQueue['pushTask']>[1]) => {
			safeExecute(() => queueRef.current?.pushTask(task, options))
		},

		unshiftTask: (task: Parameters<IdleQueue['unshiftTask']>[0], options?: Parameters<IdleQueue['unshiftTask']>[1]) => {
			safeExecute(() => queueRef.current?.unshiftTask(task, options))
		},

		runTasksImmediately: () => {
			safeExecute(() => queueRef.current?.runTasksImmediately())
		},

		hasPendingTasks: () => {
			return safeExecute(() => queueRef.current?.hasPendingTasks()) ?? false
		},

		clearPendingTasks: () => {
			safeExecute(() => queueRef.current?.clearPendingTasks())
		},

		getState: () => {
			return safeExecute(() => queueRef.current?.getState())
		},
	}
}

export { useIdleQueue }
