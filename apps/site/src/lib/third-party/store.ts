import { ENVS } from '_/constants'
import type { StoreApi, UseBoundStore } from 'zustand'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

type WithSelectors<S> = S extends { getState: () => infer T } ? S & { use: { [K in keyof T]: () => T[K] } } : never

const createStoreSelectors = <S extends UseBoundStore<StoreApi<object>>>(_store: S) => {
	const store = _store as WithSelectors<typeof _store>
	store.use = {}
	for (const k of Object.keys(store.getState())) {
		// oxlint-disable-next-line typescript/no-explicit-any -- here should be allowed
		;(store.use as any)[k] = () => store(s => s[k as keyof typeof s])
	}

	return store
}

type DevToolsType = typeof devtools

const conditionalDevtools: DevToolsType = ENVS.IS_DEV ? devtools : ((config => config) as DevToolsType)

export { create, conditionalDevtools, createStoreSelectors }
