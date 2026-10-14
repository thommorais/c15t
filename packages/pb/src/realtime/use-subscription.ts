import { useEffect } from 'react'
import type { Unsubscribe } from '../client'

const noop = () => {}

type Open = () => Promise<Unsubscribe> | undefined

const useSubscription = (open: Open, deps: readonly unknown[]): void => {
	useEffect(() => {
		const opened = open()?.catch(noop)

		return () => {
			void opened?.then(unsubscribe => unsubscribe?.()).catch(noop)
		}
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, deps)
}

export { useSubscription }
