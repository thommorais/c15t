'use client'
import { type ComponentProps, useId } from 'react'
import { tv } from '@thom/libs/tv'
import { useDisabled, useProvidedId, useProvidedLabel } from './fieldset.context'

const dateTypes = ['date', 'datetime-local', 'month', 'time', 'week']
type DateType = (typeof dateTypes)[number]

export const inputControlClasses = tv({
	base: [
		'relative block w-full',
		'border-info-700/20 data-hover:border-info-700/30 rounded-sm border',
		'has-data-disabled:opacity-50',
		'has-data-invalid:before:shadow-red-500/10',
		'*:data-[slot=icon]:text-zinc-500',
		'border-info-700/20 data-hover:border-info-700/30 rounded-sm border',
		'before:absolute before:inset-px before:rounded-[calc(var(--radius-sm)-1px)] before:bg-white before:shadow-sm',
	],
})

const inputClasses = tv({
	base: [
		'relative block w-full appearance-none rounded-sm px-[calc(calc(var(--spacing)*3.5)-1px)] py-[calc(calc(var(--spacing)*2.5)-1px)]',
		'text-info-700 placeholder:text-info-500 text-base/6 sm:text-base',
		'focus:outline-hidden',
		'data-invalid:border-red-500 data-invalid:data-hover:border-red-500',
		'data-disabled:border-black/20',
	],
	variants: {
		isDate: {
			true: [
				'[&::-webkit-datetime-edit-fields-wrapper]:p-0',
				'[&::-webkit-date-and-time-value]:min-h-[1.5em]',
				'[&::-webkit-datetime-edit]:inline-flex',
				'[&::-webkit-datetime-edit]:p-0',
				'[&::-webkit-datetime-edit-year-field]:p-0',
				'[&::-webkit-datetime-edit-month-field]:p-0',
				'[&::-webkit-datetime-edit-day-field]:p-0',
				'[&::-webkit-datetime-edit-hour-field]:p-0',
				'[&::-webkit-datetime-edit-minute-field]:p-0',
				'[&::-webkit-datetime-edit-second-field]:p-0',
				'[&::-webkit-datetime-edit-millisecond-field]:p-0',
				'[&::-webkit-datetime-edit-meridiem-field]:p-0',
			],
		},
	},
})

type InputProps = ComponentProps<'input'> & {
	type: 'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url' | DateType
}

export const Input = ({ className, ...props }: InputProps) => {
	const providedDisabled = useDisabled()
	const internalId = useId()
	const providedId = useProvidedId()
	const providedLabel = useProvidedLabel()
	const disabled = providedDisabled ?? props.disabled
	const id = providedId ?? props.id ?? internalId
	const name = providedLabel ?? props.name ?? id

	const inputProps = {
		...props,
		name,
		id,
		'aria-labelledby': providedLabel,
		disabled,
		autoFocus: props.autoFocus || undefined,
		'data-disabled': disabled || undefined,
		'data-invalid': props['aria-invalid'],
	}

	return (
		<span data-slot='control' className={inputControlClasses({ class: className })}>
			<input
				{...inputProps}
				className={inputClasses({
					isDate: dateTypes.includes(props.type),
				})}
			/>
		</span>
	)
}
