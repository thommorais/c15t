import { isServerSide } from '_/lib/is-server-side'
import { useEffect, useLayoutEffect } from 'react'

// useLayoutEffect will show warning if used during ssr, e.g. with Next.js
// useIsomorphicEffect removes it by replacing useLayoutEffect with useEffect during ssr
const useIsomorphicEffect = isServerSide() ? useLayoutEffect : useEffect

export { useIsomorphicEffect }
