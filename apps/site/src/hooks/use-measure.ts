import { type RefObject, useCallback, useRef, useState } from 'react'

const useMeasure = () => {
	const [dimensions, setDimensions] = useState<{ width: null | number; height: null | number }>({
		width: null,
		height: null,
	})

	const previousObserver = useRef<ResizeObserver>(null)

	const customRef = useCallback((node: RefObject<HTMLDivElement>['current']) => {
		if (previousObserver.current) {
			previousObserver.current.disconnect()
			previousObserver.current = null
		}

		if (node?.nodeType === Node.ELEMENT_NODE) {
			const observer = new ResizeObserver(([entry]) => {
				if (entry?.borderBoxSize) {
					if (entry.borderBoxSize[0]) {
						const { inlineSize: width, blockSize: height } = entry.borderBoxSize[0]
						setDimensions({ width, height })
					} else {
						setDimensions({ width: null, height: null })
					}
				}
			})

			observer.observe(node)
			previousObserver.current = observer
		}
	}, [])

	return [customRef, dimensions] as [
		(node: RefObject<HTMLDivElement>['current']) => void,
		{
			width: null | number
			height: null | number
		},
	]
}

export { useMeasure }
