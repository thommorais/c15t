import { useCallback, useSyncExternalStore } from 'react'
import type { Session } from '../core/domain/session'
import type { Credentials } from '../core/ports/auth'
import { useContainer } from './container'

const useSession = (): Session => {
	const { auth } = useContainer()

	return useSyncExternalStore(auth.subscribe, auth.current, auth.current)
}

const useSignIn = () => {
	const { auth } = useContainer()

	return useCallback((credentials: Credentials) => auth.signIn(credentials), [auth])
}

const useSignOut = () => {
	const { auth } = useContainer()

	return useCallback(() => auth.signOut(), [auth])
}

export { useSession, useSignIn, useSignOut }
