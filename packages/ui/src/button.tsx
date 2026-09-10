'use client'
import type { ComponentPropsWithRef } from 'react'
import type { Link } from './link'
import { tv, type VariantProps } from '@thom/libs/tv'

// buttonClasses with extended variant names
const buttonClasses = tv({
	base: [
		'relative',
		'isolate',
		'inline-flex',
		'items-center',
		'justify-center',
		'gap-x-2',
		'border',
		'font-semibold',
		'transition-all',
		'duration-200',
		'focus-visible:outline',
		'focus-visible:outline-2',
		'focus-visible:outline-offset-2',
		'focus-visible:outline-black',
		'disabled:cursor-not-allowed',
		'disabled:opacity-50',
		'disabled:pointer-events-none',
		'*:data-[slot=icon]:shrink-0',
		'*:data-[slot=icon]:text-(--btn-icon)',
		'*:data-[slot=icon]:stroke-(--btn-icon)',
		'rounded-4xl',
	],
	variants: {
		variant: {
			solid: [
				'text-white',
				'border-transparent bg-(--btn-border)',
				'before:absolute before:inset-0 before:-z-10 before:rounded-[calc(var(--radius-4xl)-1px)] before:bg-(--btn-bg)',
				'before:shadow-sm',
				'after:absolute after:inset-0 after:-z-10 after:rounded-[calc(var(--radius-4xl)-1px)]',
				'after:shadow-[inset_0_1px_--theme(--color-white/45%)]',
				'data-active:after:bg-(--btn-hover-overlay) data-hover:after:bg-(--btn-hover-overlay)',
				'data-disabled:before:shadow-none data-disabled:after:shadow-none',
			],
			outline: [
				'border-2',
				'bg-transparent',
				'border:var(--btn-border)',
				'hover:not-disabled:bg-(--btn-hover-bg)',
				'active:not-disabled:scale-[0.98]',
			],
			ghost: [
				'border-transparent',
				'bg-transparent',
				'hover:not-disabled:bg-(--btn-hover-bg)',
				'active:not-disabled:bg-(--btn-hover-bg)',
			],
			soft: [
				'border-transparent',
				'bg-(--btn-bg)',
				'hover:not-disabled:bg-(--btn-hover-bg)',
				'active:not-disabled:bg-(--btn-hover-bg)',
				'active:not-disabled:scale-[0.98]',
			],
		},
		color: {
			white: [
				'text-primary-900',

				'[--btn-bg:var(--color-white)]',
				'[--btn-border:var(--color-white)]',
				'[--btn-hover-overlay:var(--color-white)]/50',
				'[--btn-icon:var(--color-white)]/90',
			],
			primary: [
				'[--btn-bg:var(--color-primary-500)]',
				'[--btn-border:var(--color-primary-500)]/10',
				'[--btn-hover-overlay:var(--color-primary-500)]/5',
				'[--btn-icon:var(--color-white)]/90',
			],

			secondary: [
				'text-primary-800',
				'[--btn-bg:var(--color-secondary-500)]',
				'[--btn-border:var(--color-secondary-500)]/10',
				'[--btn-hover-overlay:var(--color-secondary-500)]/5',
				'[--btn-icon:var(--color-primary-500)]/90',
			],

			accent: [
				'[--btn-bg:var(--color-accent-500)]',
				'[--btn-border:var(--color-accent-600)]',
				'[--btn-hover-overlay:var(--color-orange-800)]/10',
				'[--btn-hover-bg:var(--color-orange-600)]/20',
				'[--btn-icon:var(--color-white)]/90',
			],
			// NEW VARIANTS
			success: [
				'[--btn-bg:var(--color-success-500)]',
				'[--btn-border:var(--color-success-600)]',
				'[--btn-hover-overlay:var(--color-white)]/10',
				'[--btn-hover-bg:var(--color-success-600)]/10',
				'[--btn-icon:var(--color-white)]/90',
			],
			danger: [
				'[--btn-bg:var(--color-danger-500)]',
				'[--btn-border:var(--color-danger-600)]',
				'[--btn-hover-overlay:var(--color-danger-600)]/10',
				'[--btn-hover-bg:var(--color-danger-600)]/30',
				'[--btn-icon:var(--color-white)]/10',
			],
			warning: [
				'text-white',
				'[--btn-bg:var(--color-warning-400)]',
				'[--btn-border:var(--color-warning-500)]',
				'[--btn-hover-overlay:var(--color-black)]/5',
				'[--btn-hover-bg:var(--color-warning-500)]/20',
				'[--btn-icon:var(--color-black)]/90',
			],
			info: [
				'[--btn-bg:var(--color-info-500)]',
				'[--btn-border:var(--color-info-600)]',
				'[--btn-hover-overlay:var(--color-info-500)]/10',
				'[--btn-hover-bg:var(--color-info-600)]/20',
				'[--btn-icon:var(--color-white)]/90',
			],
		},
		size: {
			sm: ['px-3', 'py-1.5', 'text-sm/5', '*:data-[slot=icon]:size-4'],
			md: ['px-4', 'py-2', 'text-sm/6', '*:data-[slot=icon]:size-4'],
			lg: ['px-5', 'py-2.5', 'text-base/6', '*:data-[slot=icon]:size-5'],
			xl: ['px-6', 'py-3', 'text-base/7', '*:data-[slot=icon]:size-6'],
		},
		fullWidth: { true: 'w-full' },
		loading: { true: ['cursor-wait', 'opacity-70'] },
	},
	compoundVariants: [
		// Outline mappings
		{
			variant: 'outline',
			color: 'white',
			class: ['text-white/90', '[--btn-border:var(--color-white)]/20'],
		},
		{
			variant: 'outline',
			color: 'primary',
			class: ['text-primary-600'],
		},
		{
			variant: 'outline',
			color: 'secondary',
			class: ['text-primary-900', '[--btn-icon:var(--color-primary-900)]/70'],
		},
		{
			variant: 'outline',
			color: 'accent',
			class: ['text-accent-600'],
		},
		{
			variant: 'outline',
			color: 'success',
			class: ['text-success-600'],
		},
		{
			variant: 'outline',
			color: 'danger',
			class: ['text-danger-600'],
		},
		{
			variant: 'outline',
			color: 'warning',
			class: ['text-warning-600'],
		},
		{
			variant: 'outline',
			color: 'info',
			class: ['text-info-500', '[--btn-icon:var(--color-info-500)]/70'],
		},

		// Ghost accent mapping kept
		{
			variant: 'ghost',
			color: 'accent',
			class: ['text-accent-600'],
		},
		{
			variant: 'ghost',
			color: 'primary',
			class: ['text-primary-600'],
		},
		{
			variant: 'ghost',
			color: 'secondary',
			class: ['text-secondary-500'],
		},
		{
			variant: 'ghost',
			color: 'success',
			class: ['text-success-600'],
		},
		{
			variant: 'ghost',
			color: 'danger',
			class: ['text-danger-600'],
		},
		{
			variant: 'ghost',
			color: 'warning',
			class: ['text-warning-600'],
		},
		{
			variant: 'ghost',
			color: 'info',
			class: ['text-info-600'],
		},

		// Soft mappings
		{
			variant: 'soft',
			color: 'accent',
			class: [
				'text-accent-700',
				'[--btn-bg:var(--color-accent-500)]/10',
				'[--btn-hover-bg:var(--color-accent-500)]/20',
			],
		},
		{
			variant: 'soft',
			color: 'success',
			class: [
				'text-success-700',
				'[--btn-bg:var(--color-success-500)]/10',
				'[--btn-hover-bg:var(--color-success-500)]/20',
			],
		},
		{
			variant: 'soft',
			color: 'danger',
			class: [
				'text-danger-700',
				'[--btn-bg:var(--color-danger-500)]/10',
				'[--btn-hover-bg:var(--color-danger-500)]/20',
			],
		},
		{
			variant: 'soft',
			color: 'primary',
			class: [
				'text-primary-900',
				'[--btn-bg:var(--color-primary-500)]/40',
				'[--btn-hover-bg:var(--color-primary-500)]/20',
			],
		},
		{
			variant: 'soft',
			color: 'warning',
			class: [
				'text-warning-700',
				'[--btn-bg:var(--color-warning-400)]/15',
				'[--btn-hover-bg:var(--color-warning-400)]/25',
			],
		},
		{
			variant: 'soft',
			color: 'info',
			class: ['text-info-500', '[--btn-bg:var(--color-info-500)]/10', '[--btn-hover-bg:var(--color-info-500)]/20'],
		},
	],
	defaultVariants: {
		variant: 'solid',
		color: 'primary',
		size: 'md',
	},
})

type ButtonBaseProps = {
	asChild?: boolean
	loading?: boolean
	fullWidth?: boolean
}

type ButtonProps = Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'> &
	ComponentPropsWithRef<'button'> &
	VariantProps<typeof buttonClasses> &
	ButtonBaseProps & {
		// oxlint-disable-next-line typescript/no-explicit-any -- yeap
		LinkComponent?: React.ComponentType<any>
	}

export const Button = ({
	color,
	variant,
	size,
	fullWidth,
	loading,
	disabled,
	className,
	children,
	LinkComponent,
	...props
}: ButtonProps) => {
	const isDisabled = disabled || loading

	return 'href' in props && LinkComponent ? (
		<LinkComponent
			href={props.href as string}
			className={buttonClasses({ color, variant, size, fullWidth, loading, class: className })}
			aria-disabled={isDisabled}
			data-color={color}
			data-variant={variant}
		>
			<TouchTarget>
				{loading && <LoadingSpinner />}
				{children}
			</TouchTarget>
		</LinkComponent>
	) : (
		<button
			{...props}
			disabled={isDisabled}
			className={buttonClasses({ color, variant, size, fullWidth, loading, class: [className, 'cursor-pointer'] })}
			aria-disabled={isDisabled}
			data-id='thom-ui'
			data-color={color}
			data-variant={variant}
		>
			<TouchTarget>
				{loading && <LoadingSpinner />}
				{children}
			</TouchTarget>
		</button>
	)
}

/**
 * Expand the hit area to at least 44×44px on touch devices
 */
type TouchTargetProps = {
	children: React.ReactNode
}

export const TouchTarget = ({ children }: TouchTargetProps) => {
	return (
		<>
			<span
				className='absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden'
				aria-hidden='true'
			/>
			{children}
		</>
	)
}

/**
 * Loading spinner for button loading state
 */
const LoadingSpinner = () => {
	return (
		<svg
			className='size-4 animate-spin'
			xmlns='http://www.w3.org/2000/svg'
			fill='none'
			viewBox='0 0 24 24'
			data-slot='icon'
		>
			<circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
			<path
				className='opacity-75'
				fill='currentColor'
				d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
			/>
		</svg>
	)
}
