'use client'
import type React from 'react'
import { useId } from 'react'
import { tv } from '@thom/libs/tv'
import {
	DisabledProvider,
	IdProvider,
	LabelProvider,
	useDisabled,
	useProvidedId,
	useProvidedLabel,
} from './fieldset.context'

type Disabled = Pick<React.ComponentPropsWithoutRef<'input'>, 'disabled'>

const fieldsetClasses = tv({
	base: ['[&>*+[data-slot=control]]:mt-6 [&>[data-slot=text]]:mt-1'],
})

type FieldsetProps = React.FieldsetHTMLAttributes<HTMLFieldSetElement>

const Fieldset = ({ className, ...props }: FieldsetProps) => {
	return <fieldset {...props} className={fieldsetClasses({ class: className })} />
}

const legendClasses = tv({
	base: 'text-base/6 font-semibold text-zinc-950 data-[disabled]:opacity-50 sm:text-sm/6',
})

type LegendProps = React.KeygenHTMLAttributes<HTMLLegendElement>

const Legend = ({ className, ...props }: LegendProps) => {
	return (
		<legend
			data-slot='legend'
			{...props}
			data-disabled={props.disabled}
			className={legendClasses({ class: className })}
		/>
	)
}

const fieldGroupClasses = tv({
	base: 'space-y-8',
})

type FieldGroupProps = React.ComponentPropsWithoutRef<'div'>

const FieldGroup = ({ className, ...props }: FieldGroupProps) => {
	return <div data-slot='control' {...props} className={fieldGroupClasses({ class: className })} />
}

const fieldClasses = tv({
	base: [
		'[&>[data-slot=label]+[data-slot=control]]:mt-3',
		'[&>[data-slot=label]+[data-slot=description]]:mt-1',
		'[&>[data-slot=description]+[data-slot=control]]:mt-3',
		'[&>[data-slot=control]+[data-slot=description]]:mt-3',
		'[&>[data-slot=control]+[data-slot=error]]:mt-3',
		'[&>[data-slot=label]]:font-medium',
	],
})

type FieldProps = React.ComponentPropsWithoutRef<'div'> &
	Disabled & {
		name: string
	}

const Field = ({ className, ...props }: FieldProps) => {
	const { name, ...restProps } = props

	const fieldID = `field-${useId()}`

	return (
		<DisabledProvider value={props.disabled}>
			<LabelProvider label={name}>
				<IdProvider id={fieldID}>
					<div {...restProps} className={fieldClasses({ class: className })} />
				</IdProvider>
			</LabelProvider>
		</DisabledProvider>
	)
}

const labelClasses = tv({
	base: ['text-base/6 text-zinc-950 select-none data-[disabled]:opacity-50 sm:text-sm/6'],
})

type LabelProps = React.ComponentPropsWithoutRef<'label'>

const Label = ({ className, ...props }: LabelProps) => {
	const disabled = useDisabled()
	const internalId = useId()
	const providedId = useProvidedId()
	const providedLabel = useProvidedLabel()
	const id = providedId || props.id || internalId

	const labelProps = {
		...props,
		id,
		htmlFor: providedLabel || props.htmlFor || undefined,
	}

	return (
		<label
			data-slot='label'
			{...labelProps}
			htmlFor={labelProps.htmlFor}
			data-disabled={disabled}
			className={labelClasses({ class: className })}
		/>
	)
}

const descriptionClasses = tv({
	base: ['text-base/6 text-zinc-500 data-[disabled]:opacity-50 sm:text-sm/6'],
})

type DescriptionProps = React.ComponentPropsWithoutRef<'p'>

const Description = ({ className, ...props }: DescriptionProps) => {
	const disabled = useDisabled()

	return (
		<p
			data-slot='description'
			{...props}
			data-disabled={disabled}
			className={descriptionClasses({ class: className })}
		/>
	)
}

const errorMessageClasses = tv({
	base: ['text-base/6 text-red-600 data-[disabled]:opacity-50 sm:text-sm/6'],
})
type ErrorMessageProps = React.ComponentPropsWithoutRef<'div'> & Disabled

const ErrorMessage = ({ className, ...props }: ErrorMessageProps) => {
	const disabled = useDisabled()
	return (
		<div data-slot='error' {...props} data-disabled={disabled} className={errorMessageClasses({ class: className })} />
	)
}

export { Description, ErrorMessage, Field, FieldGroup, Fieldset, Label, Legend }
