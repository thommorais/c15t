'use client'

import { cn } from '@thom/libs/cn'
import * as Headless from '@headlessui/react'
import { useState } from 'react'

type BaseComboboxProps<T> = {
	options: T[]
	displayValue: (value: T | null) => string | undefined
	filter?: (value: T, query: string) => boolean
	className?: string
	placeholder?: string
	autoFocus?: boolean
	disabled?: boolean
	'aria-label'?: string
	anchor?: 'top' | 'bottom'
}

type SingleComboboxProps<T> = BaseComboboxProps<T> & {
	multiple?: false
	value?: T | null
	children: (value: NonNullable<T>) => React.ReactElement
}

type MultiComboboxProps<T> = BaseComboboxProps<T> & {
	multiple: true
	value?: T[]
	children: (value: NonNullable<T>) => React.ReactElement
}

type ComboboxProps<T> = Omit<Headless.ComboboxProps<T, false>, 'as' | 'multiple' | 'children'> & {
	anchor?: 'top' | 'bottom'
} & (SingleComboboxProps<T> | MultiComboboxProps<T>)

export const Combobox = <T,>({
	options,
	displayValue,
	filter,
	anchor = 'bottom',
	className,
	placeholder,
	autoFocus,
	disabled,
	'aria-label': ariaLabel,
	children,
	value,
	onChange,
}: ComboboxProps<T>) => {
	const [query, setQuery] = useState('')

	const filteredOptions =
		query === ''
			? options
			: options.filter(option =>
					filter ? filter(option, query) : displayValue(option)?.toLowerCase().includes(query.toLowerCase()),
				)

	const getDisplayValue = (val: T | T[] | null): string => {
		if (val === null || val === undefined) return ''
		if (Array.isArray(val)) {
			return val
				.map(v => displayValue(v))
				.filter(Boolean)
				.join(', ')
		}
		return displayValue(val) ?? ''
	}

	return (
		<Headless.Combobox
			value={value}
			onChange={onChange}
			multiple={false}
			virtual={{ options: filteredOptions }}
			onClose={() => setQuery('')}
			disabled={disabled}
		>
			<span
				data-slot='control'
				className={cn([
					className,
					// Basic layout
					'relative block w-full',
					// Background color + shadow applied to inset pseudo element
					'before:absolute before:inset-px before:rounded-[calc(var(--radius-md)-1px)] before:bg-white before:shadow-sm',
					// Focus ring
					'sm:focus-within:after:ring-info-500 after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:ring-transparent after:ring-inset sm:focus-within:after:ring-2',
					// Disabled state
					'has-data-disabled:before:bg-info-700/5 has-data-disabled:opacity-50 has-data-disabled:before:shadow-none',
					// Invalid state
					'has-data-invalid:before:shadow-danger-500/10',
				])}
			>
				<Headless.ComboboxInput
					autoFocus={autoFocus}
					data-slot='control'
					aria-label={ariaLabel}
					displayValue={() => getDisplayValue(value ?? null)}
					onChange={event => setQuery(event.target.value)}
					placeholder={placeholder}
					className={cn([
						// Basic layout
						'relative block w-full appearance-none rounded-md px-[calc(calc(var(--spacing)*3.5)-1px)] py-[calc(calc(var(--spacing)*2.5)-1px)]',
						// Horizontal padding
						'pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]',
						// Typography
						'text-info-700 placeholder:text-info-500 text-base/6 sm:text-base',
						// Border
						'border-info-700/20 data-hover:border-info-700/30 border',
						// Background color
						'bg-transparent',
						// Hide default focus styles
						'focus:outline-hidden',
						// Invalid state
						'data-invalid:data-hover:border-danger-500 data-invalid:border-danger-500',
						// Disabled state
						'data-disabled:border-info-700/20',
					])}
				/>
				<Headless.ComboboxButton className='group absolute inset-y-0 right-0 flex items-center px-2'>
					<svg
						className='stroke-info-500 group-data-disabled:stroke-info-400 group-data-hover:stroke-info-600 size-5 sm:size-4 forced-colors:stroke-[CanvasText]'
						viewBox='0 0 16 16'
						aria-hidden='true'
						fill='none'
					>
						<path d='M5.75 10.75L8 13L10.25 10.75' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' />
						<path d='M10.25 5.25L8 3L5.75 5.25' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' />
					</svg>
				</Headless.ComboboxButton>
			</span>
			<Headless.ComboboxOptions
				transition
				anchor={anchor}
				className={cn(
					// Anchor positioning
					'[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(4)] sm:data-[anchor~=start]:[--anchor-offset:-4px]',
					// Base styles,
					'isolate min-w-[calc(var(--input-width)+8px)] scroll-py-1 rounded-xl p-1 select-none empty:invisible',
					// Invisible border that is only visible in `forced-colors` mode for accessibility purposes
					'outline outline-transparent focus:outline-hidden',
					// Handle scrolling when menu won't fit in viewport
					'overflow-y-scroll overscroll-contain',
					// Popover background
					'bg-white/90 backdrop-blur-xl',
					// Shadows
					'ring-info-700/10 shadow-lg ring-1',
					// Transitions
					'transition-opacity duration-100 ease-in data-closed:data-leave:opacity-0 data-transition:pointer-events-none',
				)}
			>
				{({ option }) => children(option)}
			</Headless.ComboboxOptions>
		</Headless.Combobox>
	)
}

export function ComboboxOption<T>({
	children,
	className,
	...props
}: { className?: string; children?: React.ReactNode } & Omit<
	Headless.ComboboxOptionProps<'div', T>,
	'as' | 'className'
>) {
	const sharedClasses = cn(
		// Base
		'flex min-w-0 items-center',
		// Icons
		'*:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 sm:*:data-[slot=icon]:size-4',
		'*:data-[slot=icon]:text-info-500 group-data-focus/option:*:data-[slot=icon]:text-white',
		'forced-colors:*:data-[slot=icon]:text-[CanvasText] forced-colors:group-data-focus/option:*:data-[slot=icon]:text-[Canvas]',
		// Avatars
		'*:data-[slot=avatar]:-mx-0.5 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:size-5',
	)

	return (
		<Headless.ComboboxOption
			{...props}
			className={cn(
				// Basic layout
				'group/option grid w-full cursor-default grid-cols-[1fr_--spacing(5)] items-baseline gap-x-2 rounded-md py-2.5 pr-2 pl-3.5 sm:grid-cols-[1fr_--spacing(4)] sm:py-1.5 sm:pr-2 sm:pl-3',
				// Typography
				'text-info-700 text-base/6 sm:text-sm/6 forced-colors:text-[CanvasText]',
				// Focus
				'data-focus:bg-info-500 outline-hidden data-focus:text-white',
				// Forced colors mode
				'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText]',
				// Disabled
				'data-disabled:opacity-50',
			)}
		>
			<span className={cn(className, sharedClasses)}>{children}</span>
			<svg
				className='relative col-start-2 hidden size-5 self-center stroke-current group-data-selected/option:inline sm:size-4'
				viewBox='0 0 16 16'
				fill='none'
				aria-hidden='true'
			>
				<path d='M4 8.5l3 3L12 4' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' />
			</svg>
		</Headless.ComboboxOption>
	)
}

export function ComboboxLabel({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
	return <span {...props} className={cn(className, 'ml-2.5 truncate first:ml-0 sm:ml-2 sm:first:ml-0')} />
}

export function ComboboxDescription({ className, children, ...props }: React.ComponentPropsWithoutRef<'span'>) {
	return (
		<span
			{...props}
			className={cn(
				className,
				'text-info-500 flex flex-1 overflow-hidden group-data-focus/option:text-white before:w-2 before:min-w-0 before:shrink',
			)}
		>
			<span className='flex-1 truncate'>{children}</span>
		</span>
	)
}
