const isServerSide = () => typeof window === 'undefined'

/**
 * Evaluated per call rather than at module load, so it stays correct across
 * SSR hydration and in tests that stub the DOM after import.
 */
const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

const isMobile = () => {
	if (isServerSide()) {
		return false
	}

	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
}

const updateBodyCustomProp = (propName: string, propValue: string) => {
	requestAnimationFrame(() => {
		document.body.style.setProperty(propName, propValue)
	})
}

export { isBrowser, isMobile, isServerSide, updateBodyCustomProp }
