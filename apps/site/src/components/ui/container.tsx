import { Slot } from '@radix-ui/react-slot'
import { tv, type VariantProps } from '_/lib/third-party/tv'
import type React from 'react'

const containerClasses = tv({
	base: ['content-grid', 'grid'],
})

type ContainerProps = React.ComponentPropsWithRef<'div'> & {
	asChild: boolean
}

const Container = ({ asChild, className, ...props }: ContainerProps & VariantProps<typeof containerClasses>) => {
	const Comp = asChild ? Slot : 'section'
	return <Comp {...props} className={containerClasses({ class: className })} />
}

export { Container, type ContainerProps }
