import { describe, expect, it, vi } from 'vitest'
import { wait } from './async'

describe('wait', () => {
	it('resolves after the given delay', async () => {
		vi.useFakeTimers()
		try {
			const pending = wait(1000)
			let settled = false
			void pending.then(() => {
				settled = true
			})

			await vi.advanceTimersByTimeAsync(999)
			expect(settled).toBe(false)

			await vi.advanceTimersByTimeAsync(1)
			await pending
			expect(settled).toBe(true)
		} finally {
			vi.useRealTimers()
		}
	})
})
