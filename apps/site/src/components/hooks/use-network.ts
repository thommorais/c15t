import { useWindowEvent } from '_/components/hooks/use-window-event'
import { useCallback, useEffect, useState } from 'react'

type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g'
type ConnectionType = 'bluetooth' | 'cellular' | 'ethernet' | 'wifi' | 'wimax' | 'none' | 'other' | 'unknown'

interface NetworkStatus {
	downlink?: number
	downlinkMax?: number
	effectiveType?: EffectiveType
	rtt?: number
	saveData?: boolean
	type?: ConnectionType
}

interface NetworkConnection extends NetworkStatus {
	addEventListener: (type: string, listener: EventListener) => void
	removeEventListener: (type: string, listener: EventListener) => void
}

interface NavigatorWithConnection extends Navigator {
	connection?: NetworkConnection
	mozConnection?: NetworkConnection
	webkitConnection?: NetworkConnection
}

function getConnection(): NetworkStatus {
	if (typeof navigator === 'undefined') {
		return {}
	}

	const nav = navigator as NavigatorWithConnection
	const connection = nav.connection || nav.mozConnection || nav.webkitConnection

	if (!connection) {
		return {}
	}

	return {
		downlink: connection.downlink,
		downlinkMax: connection.downlinkMax,
		effectiveType: connection.effectiveType,
		rtt: connection.rtt,
		saveData: connection.saveData,
		type: connection.type,
	}
}

interface NetworkState extends NetworkStatus {
	online: boolean
}

const useNetwork = (): NetworkState => {
	const [status, setStatus] = useState<NetworkState>({
		online: typeof navigator !== 'undefined' ? navigator.onLine : true,
	})

	const handleConnectionChange = useCallback(() => setStatus(current => ({ ...current, ...getConnection() })), [])

	useWindowEvent('online', () => setStatus({ online: true, ...getConnection() }))
	useWindowEvent('offline', () => setStatus({ online: false, ...getConnection() }))

	useEffect(() => {
		const nav = navigator as NavigatorWithConnection

		if (nav.connection) {
			setStatus({ online: nav.onLine, ...getConnection() })
			nav.connection.addEventListener('change', handleConnectionChange)
			return () => nav.connection?.removeEventListener('change', handleConnectionChange)
		}

		return undefined
	}, [handleConnectionChange])

	return status
}

export { useNetwork }
