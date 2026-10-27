import { createConnection } from '@thom/pb/realtime'
import { createContext, useContext, useMemo } from 'react'
import { createAuthAdapter } from '../adapters/pocketbase/auth-adapter'
import { client } from '../adapters/pocketbase/client'
import { type ConsentRecord, createConsentsLive } from '../adapters/pocketbase/consents-live'
import type { Consent } from '../core/domain/consent'
import type { AuthPort } from '../core/ports/auth'
import type { Live } from '../core/ports/live'

type Container = {
	readonly auth: AuthPort
	readonly live: {
		readonly consents: Live<ConsentRecord, Consent, void>
	}
}

const createContainer = (): Container => {
	const connection = createConnection(client.realtime)

	return {
		auth: createAuthAdapter(),
		live: {
			consents: createConsentsLive({ client, connection }),
		},
	}
}

const ContainerContext = createContext<Container | undefined>(undefined)

type ProviderProps = {
	readonly container?: Container
	readonly children: React.ReactNode
}

const ContainerProvider = ({ container, children }: ProviderProps) => {
	const value = useMemo(() => container ?? createContainer(), [container])

	return <ContainerContext.Provider value={value}>{children}</ContainerContext.Provider>
}

const useContainer = (): Container => {
	const container = useContext(ContainerContext)

	if (!container) {
		throw new Error('useContainer must be used inside a ContainerProvider')
	}

	return container
}

export { ContainerProvider, createContainer, useContainer }
export type { Container }
