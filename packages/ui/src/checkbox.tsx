import * as Headless from '@headlessui/react'
import type React from 'react'
import { tv, type VariantProps } from '@thom/libs/tv'

const checkboxGroupClasses = tv({
	base: [
		'space-y-3',
		'has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium',
	],
})

export function CheckboxGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return <div data-slot='control' {...props} className={checkboxGroupClasses({ class: [className] })} />
}

const checkboxFieldClasses = tv({
	base: [
		'grid grid-cols-[1.125rem_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]',
		// Control layout
		'*:data-[slot=control]:col-start-1 *:data-[slot=control]:row-start-1 *:data-[slot=control]:justify-self-center',
		// Label layout
		'*:data-[slot=label]:col-start-2 *:data-[slot=label]:row-start-1 *:data-[slot=label]:justify-self-start',
		// Description layout
		'*:data-[slot=description]:col-start-2 *:data-[slot=description]:row-start-2',
		// With description
		'has-data-[slot=description]:**:data-[slot=label]:font-medium',
	],
})

export function CheckboxField({
	className,
	...props
}: { className?: string } & Omit<Headless.FieldProps, 'as' | 'className'>) {
	return <Headless.Field data-slot='field' {...props} className={checkboxFieldClasses({ class: [className] })} />
}

const checkboxClasses = tv({
	base: [
		// Basic layout
		'relative isolate flex size-[1.125rem] items-center justify-center rounded-[0.3125rem] sm:size-4',
		// Background color + shadow applied to inset pseudo element, so shadow blends with border
		'before:absolute before:inset-0 before:-z-10 before:rounded-[calc(0.3125rem-1px)] before:bg-white before:shadow-sm',
		// Background color when checked
		'group-data-checked:before:bg-(--checkbox-checked-bg)',
		// Border
		'border border-black/15 group-data-checked:border-transparent group-data-checked:bg-(--checkbox-checked-border) group-data-hover:border-black/30 group-data-hover:group-data-checked:border-transparent',
		// Inner highlight shadow
		'after:absolute after:inset-0 after:rounded-[calc(0.3125rem-1px)] after:shadow-[inset_0_1px_theme(--color-white/15%)]',
		// Focus ring
		'group-data-focus:outline group-data-focus:outline-2 group-data-focus:outline-offset-2 group-data-focus:outline-blue-500',
		// Disabled state
		'group-data-disabled:opacity-50',
		'group-data-disabled:border-black/25 group-data-disabled:bg-black/5 group-data-disabled:[--checkbox-check:var(--color-black)]/50 group-data-disabled:before:bg-transparent',
		// Forced colors mode
		'forced-colors:[--checkbox-check:HighlightText] forced-colors:[--checkbox-checked-bg:Highlight] forced-colors:group-data-disabled:[--checkbox-check:Highlight]',
	],
	variants: {
		color: {
			primary:
				'[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-primary-500)] [--checkbox-checked-border:var(--color-primary-500)]',
			secondary:
				'[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-secondary-500)] [--checkbox-checked-border:var(--color-secondary-500)]',
			accent:
				'[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-accent-500)] [--checkbox-checked-border:var(--color-accent-600)]',
			success:
				'[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-success-500)] [--checkbox-checked-border:var(--color-success-600)]',
			danger:
				'[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-danger-500)] [--checkbox-checked-border:var(--color-danger-600)]',
			warning:
				'[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-warning-400)] [--checkbox-checked-border:var(--color-warning-500)]',
			info: '[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-info-500)] [--checkbox-checked-border:var(--color-info-600)]',
			zinc: '[--checkbox-check:var(--color-white)] [--checkbox-checked-bg:var(--color-zinc-600)] [--checkbox-checked-border:var(--color-zinc-700)]/90',
		},
	},
})

type CheckboxProps = Omit<Headless.CheckboxProps, 'as'> &
	VariantProps<typeof checkboxClasses> &
	Omit<React.ComponentPropsWithoutRef<'input'>, 'onChange'> & {
		id?: string
	}

export function Checkbox({ color = 'primary', id, ...props }: CheckboxProps) {
	return (
		<Headless.Checkbox
			data-slot='control'
			data-id='thom-ui'
			id={id}
			{...props}
			className={tv({ base: ['group inline-flex focus:outline-hidden'] })({ class: [props.className] })}
		>
			<span className={checkboxClasses({ color })}>
				<svg
					className='size-4 stroke-(--checkbox-check) opacity-0 group-data-checked:opacity-100 sm:h-3.5 sm:w-3.5'
					viewBox='0 0 14 14'
					fill='none'
				>
					{/* Checkmark icon */}
					<path
						className='opacity-100 group-data-indeterminate:opacity-0'
						d='M3 8L6 11L11 3.5'
						strokeWidth={2}
						strokeLinecap='round'
						strokeLinejoin='round'
					/>
					{/* Indeterminate icon */}
					<path
						className='opacity-0 group-data-indeterminate:opacity-100'
						d='M3 7H11'
						strokeWidth={2}
						strokeLinecap='round'
						strokeLinejoin='round'
					/>
				</svg>
			</span>
		</Headless.Checkbox>
	)
}
