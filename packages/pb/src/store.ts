import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

type Listener<TState> = (state: Readonly<TState>, key: keyof TState) => void

type SetState<TState> = <TKey extends keyof TState>(key: TKey, value: TState[TKey]) => void

type Store<TState> = {
	(): TState
	readonly getState: () => Readonly<TState>
	readonly setState: SetState<TState>
	readonly assign: (next: Partial<TState>) => void
	readonly subscribe: (listener: Listener<TState>) => () => void
}

const create = <TState extends object>(initial: TState): Store<TState> => {
	const state = { ...initial }
	const listeners = new Set<Listener<TState>>()
	const versions = new Map<keyof TState, number>()

	const versionOf = (key: keyof TState): number => versions.get(key) ?? 0

	const getState = (): Readonly<TState> => state

	const subscribe = (listener: Listener<TState>) => {
		listeners.add(listener)

		return () => {
			listeners.delete(listener)
		}
	}

	const assign = (next: Partial<TState>): void => {
		const changed = (Object.keys(next) as (keyof TState)[]).filter(key => !Object.is(state[key], next[key]))

		Object.assign(state, next)

		for (const key of changed) versions.set(key, versionOf(key) + 1)

		for (const key of changed) {
			for (const listener of listeners) listener(state, key)
		}
	}

	const setState: SetState<TState> = (key, value) => assign({ [key]: value } as unknown as Partial<TState>)

	const useStore = (): TState => {
		'use no memo'

		const [tracked] = useState(() => new Map<keyof TState, number>())

		const getSnapshot = useCallback(
			() => [...tracked].reduce((moves, [key, since]) => moves + versionOf(key) - since, 0),
			[tracked],
		)

		useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

		return useMemo(
			() =>
				new Proxy({} as TState, {
					get: (_, property) => {
						const key = property as keyof TState

						if (!tracked.has(key)) tracked.set(key, versionOf(key))

						return state[key]
					},
					set: (_, property, value) => {
						const key = property as keyof TState

						setState(key, value as TState[typeof key])

						return true
					},
				}),
			[tracked],
		)
	}

	return Object.assign(useStore, { getState, setState, assign, subscribe })
}

export { create }
export type { Listener, Store }
