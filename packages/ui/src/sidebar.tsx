'use client'

import { cn } from '@thom/libs/cn'
import * as Headless from '@headlessui/react'
import { LayoutGroup, motion } from 'motion/react'
import type React from 'react'
import { useId } from 'react'
import { TouchTarget } from './button'
import { Link } from './link'

export function Sidebar({ className, ...props }: React.ComponentPropsWithoutRef<'nav'>) {
	return <nav {...props} className={cn(className, 'flex h-full min-h-0 flex-col')} />
}

export function SidebarHeader({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return (
		<div
			{...props}
			className={cn(
				className,
				'border-primary-200/50 flex flex-col border-b p-4 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
			)}
		/>
	)
}

export function SidebarBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return (
		<div
			{...props}
			className={cn(
				className,
				'flex flex-1 flex-col overflow-y-auto p-4 [&>[data-slot=section]+[data-slot=section]]:mt-8',
			)}
		/>
	)
}

export function SidebarFooter({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return (
		<div
			{...props}
			className={cn(
				className,
				'border-primary-200/50 flex flex-col border-t p-4 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
			)}
		/>
	)
}

export function SidebarSection({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	const id = useId()

	return (
		<LayoutGroup id={id}>
			<div {...props} data-slot='section' className={cn(className, 'flex flex-col gap-0.5')} />
		</LayoutGroup>
	)
}

export function SidebarDivider({ className, ...props }: React.ComponentPropsWithoutRef<'hr'>) {
	return <hr {...props} className={cn(className, 'border-primary-200/50 my-4 border-t lg:-mx-4')} />
}

export function SidebarSpacer({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return <div aria-hidden='true' {...props} className={cn(className, 'mt-8 flex-1')} />
}

export function SidebarHeading({ className, ...props }: React.ComponentPropsWithoutRef<'h3'>) {
	return (
		<h3
			{...props}
			className={cn(className, 'text-primary-700 mb-1 px-2 text-xs/6 font-medium tracking-wider uppercase')}
		/>
	)
}

export const SidebarItem = ({
	current,
	className,
	children,
	LinkComponent = Link,
	ref,
	...props
}: {
	current?: boolean
	className?: string
	children: React.ReactNode
	// oxlint-disable-next-line typescript/no-explicit-any -- yeap
	LinkComponent?: React.ComponentType<any>
	ref?: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>
} & (
	| ({ href?: never } & Omit<Headless.ButtonProps, 'as' | 'className'>)
	| ({ href: string } & Omit<Headless.ButtonProps<typeof Link>, 'as' | 'className'>)
)) => {
	const classes = cn(
		// Base
		'text-primary-900 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-base/6 font-medium lowercase sm:py-2 sm:text-sm/5',
		// Leading icon/icon-only
		'*:data-[slot=icon]:stroke-primary-600 *:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 sm:*:data-[slot=icon]:size-5',
		// Trailing icon (down chevron or similar)
		'*:last:data-[slot=icon]:ml-auto *:last:data-[slot=icon]:size-5 sm:*:last:data-[slot=icon]:size-4',
		// Avatar
		'*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 sm:*:data-[slot=avatar]:size-6',
		// Hover
		'data-hover:bg-primary-100/50 data-hover:*:data-[slot=icon]:stroke-primary-700',
		// Active
		'data-active:bg-primary-200/50 data-active:*:data-[slot=icon]:stroke-primary-800',
		// Current
		'data-current:bg-primary-100 data-current:*:data-[slot=icon]:stroke-primary-800',
	)

	return (
		<span className={cn(className, 'relative')}>
			{current && (
				<motion.span
					layoutId='current-indicator'
					className='bg-primary-600 absolute inset-y-2 -left-4 w-0.5 rounded-full'
				/>
			)}
			{typeof props.href === 'string' ? (
				<Headless.CloseButton
					as={LinkComponent}
					{...props}
					className={classes}
					data-current={current ? 'true' : undefined}
					ref={ref}
				>
					{children}
				</Headless.CloseButton>
			) : (
				<Headless.Button
					{...props}
					className={cn('cursor-default', classes)}
					data-current={current ? 'true' : undefined}
					ref={ref}
				>
					<TouchTarget>{children}</TouchTarget>
				</Headless.Button>
			)}
		</span>
	)
}

export const SidebarLabel = ({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) => {
	return <span {...props} className={cn(className, 'truncate')} />
}
