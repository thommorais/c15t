import { useEffect } from 'react'

const useWindowEvent = <K extends string>(
	type: K,
	listener: K extends keyof WindowEventMap
		? (this: Window, ev: WindowEventMap[K]) => void
		: (this: Window, ev: CustomEvent) => void,
	options?: boolean | AddEventListenerOptions,
) => {
	useEffect(() => {
		if (typeof type === 'string') {
			window.addEventListener(type, listener as EventListener, options)
			return () => window.removeEventListener(type, listener as EventListener, options)
		}
	}, [type, listener, options])
}

export { useWindowEvent }
