import { Slot } from '@radix-ui/react-slot'
import type React from 'react'
import { tv, type VariantProps } from '@thom/libs/tv'

const cardClasses = tv({
	base: [
		// Base styles
		'relative',
		'rounded-md',
		// Focus styles
		'focus-within:outline-none',
	],
	variants: {
		variant: {
			elevated: [
				// Elevated card with shadow
				'bg-white',
				'shadow-xs',
				'border',
				'border-black/5',
			],
			outlined: [
				// Outlined card
				'bg-transparent',
				'border-2',
				'border-black/10',
				'hover:border-black/20',
			],
			filled: [
				// Filled card with solid background
				'border',
				'border-transparent',
			],
			gradient: [
				// Gradient card
				'border',
				'border-white/20',
				'backdrop-blur-sm',
			],
			ghost: [
				// Minimal card
				'bg-transparent',
				'border',
				'border-transparent',
				'hover:bg-black/5',
			],
		},
		padding: {
			none: 'p-0',
			sm: 'p-3',
			md: 'p-4',
			lg: 'p-6',
			xl: 'p-8',
		},
		interactive: {
			true: ['cursor-pointer', 'active:scale-[0.98]', 'transition-transform'],
		},
		bordered: {
			top: 'border-t-4',
			left: 'border-l-4',
			all: 'border-4',
		},
	},
	defaultVariants: {
		variant: 'elevated',
		padding: 'lg',
	},
})

const cardHeaderClasses = tv({
	base: ['flex', 'items-start', 'justify-between', 'gap-4'],
	variants: {
		spacing: {
			none: '',
			sm: 'mb-2',
			md: 'mb-4',
			lg: 'mb-6',
		},
	},
	defaultVariants: {
		spacing: 'md',
	},
})

const cardContentClasses = tv({
	base: ['flex', 'flex-col'],
	variants: {
		spacing: {
			none: '',
			sm: 'gap-2',
			md: 'gap-4',
			lg: 'gap-6',
		},
	},
	defaultVariants: {
		spacing: 'md',
	},
})

const cardFooterClasses = tv({
	base: ['flex', 'items-center', 'gap-2'],
	variants: {
		spacing: {
			none: '',
			sm: 'mt-2',
			md: 'mt-4',
			lg: 'mt-6',
		},
		justify: {
			start: 'justify-start',
			end: 'justify-end',
			center: 'justify-center',
			between: 'justify-between',
		},
	},
	defaultVariants: {
		spacing: 'md',
		justify: 'start',
	},
})

const cardTitleClasses = tv({
	base: ['font-semibold', 'text-black'],
	variants: {
		size: {
			sm: 'text-base/6',
			md: 'text-lg/7',
			lg: 'text-xl/8',
			xl: 'text-2xl/9',
		},
	},
	defaultVariants: {
		size: 'md',
	},
})

const cardDescriptionClasses = tv({
	base: ['text-black/70'],
	variants: {
		size: {
			sm: 'text-xs/5',
			md: 'text-sm/6',
			lg: 'text-base/7',
		},
	},
	defaultVariants: {
		size: 'md',
	},
})

// Types
type CardProps = React.ComponentPropsWithRef<'div'> &
	VariantProps<typeof cardClasses> & {
		asChild?: boolean
	}

type CardHeaderProps = React.ComponentPropsWithRef<'div'> &
	VariantProps<typeof cardHeaderClasses> & {
		asChild?: boolean
	}

type CardContentProps = React.ComponentPropsWithRef<'div'> &
	VariantProps<typeof cardContentClasses> & {
		asChild?: boolean
	}

type CardTitleProps = React.ComponentPropsWithRef<'h3'> & VariantProps<typeof cardTitleClasses>

type CardDescriptionProps = React.ComponentPropsWithRef<'p'> & VariantProps<typeof cardDescriptionClasses>

// Components
export const Card = ({ variant, padding, interactive, bordered, className, asChild, ...props }: CardProps) => {
	const Comp = asChild ? Slot : 'div'

	return (
		<Comp
			{...props}
			className={cardClasses({ variant, padding, interactive, bordered, class: className })}
			data-id='thom-ui'
		/>
	)
}

export const CardHeader = ({ spacing, className, asChild, ...props }: CardHeaderProps) => {
	const Comp = asChild ? Slot : 'div'

	return <Comp data-id='card-header' {...props} className={cardHeaderClasses({ spacing, class: className })} />
}

export const CardContent = ({ spacing, className, asChild, ...props }: CardContentProps) => {
	const Comp = asChild ? Slot : 'div'
	return <Comp {...props} data-id='card-content' className={cardContentClasses({ spacing, class: className })} />
}

type CardFooterProps = React.ComponentPropsWithRef<'footer'> & VariantProps<typeof cardFooterClasses>

export const CardFooter = ({ spacing, justify, ...props }: CardFooterProps) => {
	return (
		<footer
			{...props}
			data-id='card-footer'
			className={cardFooterClasses({ spacing, justify, class: props.className })}
		/>
	)
}

export const CardTitle = ({ size, className, ...props }: CardTitleProps) => {
	return <h3 {...props} className={cardTitleClasses({ size, class: className })} />
}

export const CardDescription = ({ size, className, ...props }: CardDescriptionProps) => {
	return <p {...props} className={cardDescriptionClasses({ size, class: className })} />
}
