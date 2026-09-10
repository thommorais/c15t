import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect } from 'react'

const Counter = ({ target, suffix }: { target: number; suffix?: string }) => {
	const count = useMotionValue(0)
	const rounded = useTransform(() => Math.round(count.get()))

	useEffect(() => {
		const controls = animate(count, target, { duration: 0.72 })
		return () => controls.stop()
	}, [count, target])

	return (
		<>
			<motion.span>{rounded}</motion.span>
			{suffix ? ` ${suffix}` : null}
		</>
	)
}

export { Counter }
