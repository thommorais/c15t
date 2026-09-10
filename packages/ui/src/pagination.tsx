import type { ComponentProps } from 'react'
import { Button } from './button'
import { cn } from '@thom/libs/cn'
import { tv } from '@thom/libs/tv'

const paginationStyles = tv({
	base: 'place-items-["auto center"] grid grid-cols-2 sm:grid-cols-3',
})

export const Pagination = ({
	'aria-label': ariaLabel = 'Page navigation',
	className,
	...props
}: ComponentProps<'nav'>) => {
	return (
		<nav
			aria-label={ariaLabel}
			{...props}
			className={paginationStyles({
				class: className,
			})}
		/>
	)
}

export const PaginationPrevious = ({ className, children = 'Previous', ...props }: ComponentProps<typeof Button>) => {
	return (
		<span className={cn(className, 'grow basis-0')}>
			<Button variant='outline' color='secondary' aria-label='Previous page' {...props}>
				<svg data-slot='icon' viewBox='0 0 16 16' aria-hidden='true'>
					<path
						d='M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5'
						strokeWidth={1.5}
						strokeLinecap='round'
						strokeLinejoin='round'
						fill='inherit'
					/>
				</svg>
				{children}
			</Button>
		</span>
	)
}

export const PaginationNext = ({ className, children = 'Next', ...props }: ComponentProps<typeof Button>) => {
	return (
		<span className={cn(className, 'flex grow basis-0 justify-end')}>
			<Button variant='outline' color='secondary' aria-label='Next page' {...props}>
				{children}
				<svg data-slot='icon' viewBox='0 0 16 16' aria-hidden='true'>
					<path
						d='M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5'
						strokeWidth={1.5}
						strokeLinecap='round'
						strokeLinejoin='round'
						fill='inherit'
					/>
				</svg>
			</Button>
		</span>
	)
}

export const PaginationList = ({ className, ...props }: ComponentProps<'span'>) => {
	return (
		<span
			{...props}
			className={cn(
				className,
				'grid-cols-min hidden w-full auto-cols-min grid-flow-col place-content-center gap-x-2 place-self-center sm:grid',
			)}
		/>
	)
}

export const PaginationPage = ({
	current = false,
	children,
	...props
}: ComponentProps<typeof Button> & { current?: boolean }) => {
	return (
		<Button
			{...props}
			aria-label={`Page ${children}`}
			aria-current={current ? 'page' : undefined}
			className='inline-block aspect-square text-center'
			variant={current ? 'soft' : 'ghost'}
			color={current ? 'primary' : 'info'}
			size='sm'
		>
			{children}
		</Button>
	)
}

export const PaginationGap = ({ className, children = <>&hellip;</>, ...props }: ComponentProps<'span'>) => {
	return (
		<span
			aria-hidden='true'
			{...props}
			className={cn(className, 'w-[2.25rem] text-center text-sm/6 font-semibold text-black select-none')}
		>
			{children}
		</span>
	)
}
