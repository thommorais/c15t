import { cn } from '@thom/libs/cn'
import { Link } from './link'

export function Text({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
	return (
		<p
			data-slot='text'
			{...props}
			className={cn(className, 'text-base/6 text-zinc-500 sm:text-sm/6')}
			data-id='thom-ui'
		/>
	)
}

export function TextLink({ className, ...props }: React.ComponentPropsWithoutRef<typeof Link>) {
	return (
		<Link
			{...props}
			className={cn(className, 'text-black underline decoration-black/50 data-hover:decoration-black')}
			data-id='thom-ui'
		/>
	)
}

export function Strong({ className, ...props }: React.ComponentPropsWithoutRef<'strong'>) {
	return <strong {...props} className={cn(className, 'font-medium text-black')} data-id='thom-ui' />
}

export function Code({ className, ...props }: React.ComponentPropsWithoutRef<'code'>) {
	return (
		<code
			{...props}
			className={cn(
				className,
				'rounded-sm border border-black/10 bg-black/2.5 px-0.5 text-sm font-medium text-black sm:text-[0.8125rem]',
			)}
			data-id='thom-ui'
		/>
	)
}
