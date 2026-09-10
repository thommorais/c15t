import { tv } from '_/lib/third-party/tv'
import type { SVGProps } from 'react'
import type { IconName } from './icon-names'

const iconClasses = tv({
	base: '',
})

function Icon({
	name,
	size = 16,
	className,
	...props
}: SVGProps<SVGSVGElement> & {
	name: IconName
	size?: number | string
}) {
	return (
		<svg
			height={size}
			width={size}
			className={iconClasses({ class: [className] })}
			{...props}
			aria-hidden
			data-slot='icon'
		>
			<use href={`#${name}`} />
		</svg>
	)
}

export type { IconName }

export { Icon }
