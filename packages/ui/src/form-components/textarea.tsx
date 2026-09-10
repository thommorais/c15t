import { forwardRef } from 'react'
import { tv } from '@thom/libs/tv'
import { inputControlClasses } from './input'

const textareaClasses = tv({
	base: [
		'relative block w-full appearance-none rounded-md px-[calc(calc(var(--spacing)*3.5)-1px)] py-[calc(calc(var(--spacing)*2.5)-1px)]',
		'text-info-700 placeholder:text-info-500 text-base/6 sm:text-base',
		'focus:outline-none',
		'data-[invalid]:border-red-500 data-[invalid]:data-[hover]:border-red-500',
	],
})

type TextareaProps = React.ComponentPropsWithoutRef<'textarea'> & {
	resizable?: boolean
}

export const Textarea = forwardRef(function Textarea(
	{ className, resizable = true, ...props }: TextareaProps,
	ref: React.ForwardedRef<HTMLTextAreaElement>,
) {
	const dataProps = {
		'data-disabled': props.disabled || undefined,
		'data-invalid': props['aria-invalid'],
	}

	return (
		<span data-slot='control' className={inputControlClasses({ class: className })}>
			<textarea
				ref={ref}
				{...props}
				{...dataProps}
				data-invalid={props['aria-invalid']}
				className={textareaClasses({ class: resizable ? 'resize-y' : 'resize-none' })}
			/>
		</span>
	)
})
