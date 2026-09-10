const _lerp = (source: number, target: number, rate: number): number => {
	return source + (target - source) * rate
}

type LerpProps = {
	source: number
	target: number
	rate: number
	frameDelta?: number
	targetFps?: number
}

const lerp = ({ source, target, rate, frameDelta, targetFps = 60 }: LerpProps): number => {
	if (typeof frameDelta === 'undefined') {
		return _lerp(source, target, rate)
	}

	const relativeDelta = frameDelta / (1 / targetFps)
	const smoothing = 1 - rate
	return _lerp(source, target, 1 - smoothing ** relativeDelta)
}

export { lerp }
