import { cn } from '@thom/libs/cn'
import * as Headless from '@headlessui/react'
import type React from 'react'
import { Text } from './text'

/**
 * @description
 * Dialog component
 * [Headless UI Dialog](https://headlessui.dev/react/dialog)
 * props: size, className, children
 * @example
 * <Dialog size='lg' className='custom-class' onClose={() => setIsOpen(false)}>
 */

const sizes = {
	xs: 'sm:max-w-xs',
	sm: 'sm:max-w-sm',
	md: 'sm:max-w-md',
	lg: 'sm:max-w-lg',
	xl: 'sm:max-w-xl',
	'2xl': 'sm:max-w-2xl',
	'3xl': 'sm:max-w-3xl',
	'4xl': 'sm:max-w-4xl',
	'5xl': 'sm:max-w-5xl',
}

export function Dialog({
	size = 'lg',
	className,
	children,
	...props
}: { size?: keyof typeof sizes; className?: string; children: React.ReactNode } & Omit<
	Headless.DialogProps,
	'as' | 'className'
>) {
	return (
		<Headless.Dialog {...props}>
			<Headless.DialogBackdrop
				transition
				className='fixed inset-0 flex w-screen justify-center overflow-y-auto bg-black/25 px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16'
			/>

			<div className='fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0'>
				<div className='grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4'>
					<Headless.DialogPanel
						transition
						className={cn(
							className,
							sizes[size],
							'row-start-2 w-full min-w-0 rounded-t-3xl bg-white p-(--gutter) shadow-lg ring-1 ring-black/10 [--gutter:calc(var(--spacing)*8)] sm:mb-auto sm:rounded-2xl forced-colors:outline',
							'transition duration-100 will-change-transform data-closed:translate-y-12 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:data-closed:translate-y-0 sm:data-closed:data-enter:scale-95',
						)}
					>
						{children}
					</Headless.DialogPanel>
				</div>
			</div>
		</Headless.Dialog>
	)
}

export function Title({
	className,
	...props
}: { className?: string } & Omit<Headless.DialogTitleProps, 'as' | 'className'>) {
	return (
		<Headless.DialogTitle
			{...props}
			className={cn(className, 'text-lg/6 font-semibold text-balance text-black sm:text-base/6')}
		/>
	)
}

export function Description({
	className,
	...props
}: { className?: string } & Omit<Headless.DescriptionProps<typeof Text>, 'as' | 'className'>) {
	return <Headless.Description as={Text} {...props} className={cn(className, 'mt-2 text-pretty')} />
}

export function Content({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return <div {...props} className={cn(className, 'mt-6')} />
}

export function DialogActions({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
	return (
		<div
			{...props}
			className={cn(
				className,
				'mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto',
			)}
			data-id='thom-ui'
		/>
	)
}
