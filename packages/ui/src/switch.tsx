import * as Headless from '@headlessui/react'
import type React from 'react'
import { tv } from '@thom/libs/tv'

const switchGroupClasses = tv({
	base: [
		'space-y-3 **:data-[slot=label]:font-normal',
		'has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium',
	],
})

const switchFieldClasses = tv({
	base: [
		'grid grid-cols-[1fr_auto] items-center gap-x-8 gap-y-2 sm:grid-cols-[1fr_auto]',
		'*:data-[slot=control]:col-start-2 *:data-[slot=control]:self-center',
		'*:data-[slot=label]:col-start-1 *:data-[slot=label]:row-start-1 *:data-[slot=label]:justify-self-start',
		'*:data-[slot=description]:col-start-1 *:data-[slot=description]:row-start-2',
		'has-data-[slot=description]:**:data-[slot=label]:font-medium',
	],
})

const colors = {
	primary: [
		'[--switch-bg-ring:var(--color-primary-500)] [--switch-bg:var(--color-primary-500)]',
		'[--switch:white] [--switch-ring:var(--color-primary-500)] [--switch-shadow:var(--color-primary-900)]/20',
	],
	secondary: [
		'[--switch-bg-ring:var(--color-secondary-500)] [--switch-bg:var(--color-secondary-500)]',
		'[--switch:white] [--switch-ring:var(--color-secondary-500)] [--switch-shadow:var(--color-secondary-900)]/20',
	],
	accent: [
		'[--switch-bg-ring:var(--color-accent-600)] [--switch-bg:var(--color-accent-500)]',
		'[--switch:white] [--switch-ring:var(--color-accent-600)] [--switch-shadow:var(--color-accent-900)]/20',
	],
	success: [
		'[--switch-bg-ring:var(--color-success-600)] [--switch-bg:var(--color-success-500)]',
		'[--switch:var(--color-success-400)] [--switch-ring:var(--color-success-600)] [--switch-shadow:var(--color-success-900)]/20',
	],
	danger: [
		'[--switch-bg-ring:var(--color-danger-600)] [--switch-bg:var(--color-danger-500)]',
		'[--switch:var(--color-danger-500)] [--switch-ring:var(--color-danger-600)] [--switch-shadow:var(--color-danger-900)]/20',
	],
	warning: [
		'[--switch-bg-ring:var(--color-warning-500)] [--switch-bg:var(--color-warning-400)]',
		'[--switch:white] [--switch-ring:var(--color-warning-500)] [--switch-shadow:var(--color-warning-900)]/20',
	],
	info: [
		'[--switch-bg-ring:var(--color-success-500)] [--switch-bg:var(--color-success-600)]',
		'[--switch:var(--color-secondary-300)] [--switch-ring:var(--color-success-600)] [--switch-shadow:var(--color-success-900)]/20',
	],
	zinc: [
		'[--switch-bg-ring:var(--color-zinc-600)] [--switch-bg:var(--color-zinc-600)]',
		'[--switch:white] [--switch-ring:var(--color-zinc-600)] [--switch-shadow:var(--color-zinc-900)]/20',
	],
	none: [],
}

type Color = keyof typeof colors

const switchClasses = tv({
	base: [
		'group relative isolate inline-flex h-6 w-10 cursor-default p-[3px] sm:h-5 sm:w-8',
		'transition duration-0 ease-in-out data-changing:duration-200',
		'forced-colors:outline forced-colors:[--switch-bg:Highlight]',
		'data-checked:bg-(--switch-bg) data-checked:ring-(--switch-bg-ring)',
		'focus:outline-hidden data-focus:outline data-focus:outline-offset-2 data-focus:outline-blue-500',
		'data-hover:ring-black/15 data-hover:data-checked:ring-(--switch-bg-ring)',
		'rounded-4xl',
		'bg-(--switch-bg)/20',
	],
	variants: {
		color: {
			primary: colors.primary,
			secondary: colors.secondary,
			accent: colors.accent,
			success: colors.success,
			danger: colors.danger,
			warning: colors.warning,
			info: colors.info,
			zinc: colors.zinc,
			none: colors.none,
		},
	},
})

const switchThumbClasses = tv({
	base: [
		'pointer-events-none relative inline-block size-[1.125rem] sm:size-3.5',
		'ease-move translate-x-0 transition duration-200',
		'border border-transparent',
		'bg-white',
		'group-data-checked:bg-(--switch) group-data-checked:shadow-(--switch-shadow) group-data-checked:ring-(--switch-ring)',
		'group-data-checked:translate-x-3 sm:group-data-checked:translate-x-3',
		'group-data-checked:group-data-disabled:bg-white group-data-checked:group-data-disabled:ring-black/5',
		'rounded-4xl',
	],
})

export function SwitchGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return <div data-slot='control' {...props} className={switchGroupClasses({ class: className })} />
}

export function SwitchField({
	className,
	...props
}: { className?: string } & Omit<Headless.FieldProps, 'as' | 'className'>) {
	return <Headless.Field data-slot='field' {...props} className={switchFieldClasses({ class: className })} />
}

export function Switch({
	color = 'primary',
	className,
	id,
	...props
}: {
	color?: Color
	className?: string
	id?: string
} & Omit<Headless.SwitchProps, 'as' | 'className' | 'children'>) {
	return (
		<Headless.Switch
			data-slot='control'
			id={id}
			{...props}
			className={switchClasses({ color, class: className })}
			data-id='thom-ui'
			data-theme={JSON.stringify({ color })}
		>
			<span aria-hidden='true' className={switchThumbClasses()} />
		</Headless.Switch>
	)
}
