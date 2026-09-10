import { cn } from '@thom/libs/cn'
import * as Headless from '@headlessui/react'

export function RadioGroup({
	className,
	...props
}: { className?: string } & Omit<Headless.RadioGroupProps, 'as' | 'className'>) {
	return (
		<Headless.RadioGroup
			data-slot='control'
			{...props}
			className={cn(
				className,
				// Basic groups
				'space-y-3 **:data-[slot=label]:font-normal',
				// With descriptions
				'has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium',
			)}
		/>
	)
}

export function RadioField({
	className,
	...props
}: { className?: string } & Omit<Headless.FieldProps, 'as' | 'className'>) {
	return (
		<Headless.Field
			data-slot='field'
			{...props}
			className={cn(
				className,
				// Base layout
				'grid grid-cols-[1.125rem_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[1rem_1fr]',
				// Control layout
				'*:data-[slot=control]:col-start-1 *:data-[slot=control]:row-start-1 *:data-[slot=control]:justify-self-center',
				// Label layout
				'*:data-[slot=label]:col-start-2 *:data-[slot=label]:row-start-1 *:data-[slot=label]:justify-self-start',
				// Description layout
				'*:data-[slot=description]:col-start-2 *:data-[slot=description]:row-start-2',
				// With description
				'has-data-[slot=description]:**:data-[slot=label]:font-medium',
			)}
		/>
	)
}

const base = [
	// Basic layout
	'relative isolate flex size-[1.1875rem] shrink-0 rounded-full sm:size-[1.0625rem]',
	// Background color + shadow applied to inset pseudo element, so shadow blends with border
	'before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-white before:shadow-sm',
	// Background color when checked
	'group-data-checked:before:bg-(--radio-checked-bg)',
	// Border
	'border border-black/15 group-data-checked:border-transparent group-data-hover:group-data-checked:border-transparent group-data-hover:border-black/30 group-data-checked:bg-(--radio-checked-border)',
	// Inner highlight shadow
	'after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_1px_theme(--color-white/15%)]',
	// Indicator color
	'[--radio-indicator:transparent] group-data-checked:[--radio-indicator:var(--radio-checked-indicator)] group-data-hover:group-data-checked:[--radio-indicator:var(--radio-checked-indicator)] group-data-hover:[--radio-indicator:var(--color-black)]/90/10',
	// Focus ring
	'group-data-focus:outline group-data-focus:outline-2 group-data-focus:outline-offset-2 group-data-focus:outline-blue-500',
	// Disabled state
	'group-data-disabled:opacity-50',
	'group-data-disabled:border-black/25 group-data-disabled:bg-black/5 group-data-disabled:[--radio-checked-indicator:var(--color-black)]/50 group-data-disabled:before:bg-transparent',
]

const colors = {
	primary:
		'[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-primary-500)] [--radio-checked-border:var(--color-primary-500)]',
	secondary:
		'[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-secondary-500)] [--radio-checked-border:var(--color-secondary-500)]',
	accent:
		'[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-accent-500)] [--radio-checked-border:var(--color-accent-600)]',
	success:
		'[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-success-500)] [--radio-checked-border:var(--color-success-600)]',
	danger:
		'[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-danger-500)] [--radio-checked-border:var(--color-danger-600)]',
	warning:
		'[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-warning-400)] [--radio-checked-border:var(--color-warning-500)]',
	info: '[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-info-500)] [--radio-checked-border:var(--color-info-600)]',
	zinc: '[--radio-checked-indicator:var(--color-white)] [--radio-checked-bg:var(--color-zinc-600)] [--radio-checked-border:var(--color-zinc-700)]/90',
}

type Color = keyof typeof colors

export function Radio({
	color = 'primary',
	className,
	id,
	...props
}: { color?: Color; className?: string; id?: string } & Omit<Headless.RadioProps, 'as' | 'className' | 'children'>) {
	return (
		<Headless.Radio
			data-slot='control'
			id={id}
			{...props}
			className={cn(className, 'group inline-flex focus:outline-hidden')}
			data-id='thom-ui'
		>
			<span className={cn([base, colors[color]])}>
				<span
					className={cn(
						'size-full rounded-full border-[4.5px] border-transparent bg-(--radio-indicator) bg-clip-padding',
						// Forced colors mode
						'forced-colors:border-[Canvas] forced-colors:group-data-checked:border-[Highlight]',
					)}
				/>
			</span>
		</Headless.Radio>
	)
}
