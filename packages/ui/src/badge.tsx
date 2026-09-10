import { cn } from '@thom/libs/cn'
import type React from 'react'

const colors = {
	primary: 'bg-primary-500/10 text-primary-600 group-data-hover:bg-primary-500/20',
	secondary: 'bg-secondary-500/10 text-secondary-600 group-data-hover:bg-secondary-500/20',
	accent: 'bg-accent-500/10 text-accent-600 group-data-hover:bg-accent-500/20',
	success: 'bg-success-500/10 text-success-600 group-data-hover:bg-success-500/20',
	danger: 'bg-danger-500/10 text-danger-600 group-data-hover:bg-danger-500/20',
	warning: 'bg-warning-400/15 text-warning-600 group-data-hover:bg-warning-400/25',
	info: 'bg-info-500/10 text-info-600 group-data-hover:bg-info-500/20',
	zinc: 'bg-zinc-600/10 text-zinc-700 group-data-hover:bg-zinc-600/20',
}

type BadgeProps = { color?: keyof typeof colors }

export function Badge({ color = 'zinc', className, ...props }: BadgeProps & React.ComponentPropsWithoutRef<'span'>) {
	return (
		<span
			{...props}
			className={cn(
				className,
				'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline',
				colors[color],
			)}
			data-id='thom-ui'
		/>
	)
}
