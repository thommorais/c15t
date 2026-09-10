'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'
import { forwardRef } from 'react'
import { tv } from '@thom/libs/tv'

const tooltipContentClasses = tv({
	base: [
		'z-50',
		'overflow-hidden',
		'rounded-lg',
		'bg-gray-900',
		'px-3',
		'py-1.5',
		'text-xs',
		'text-white',
		'shadow-md',
		'animate-in',
		'fade-in-0',
		'zoom-in-95',
		'data-[state=closed]:animate-out',
		'data-[state=closed]:fade-out-0',
		'data-[state=closed]:zoom-out-95',
		'data-[side=bottom]:slide-in-from-top-2',
		'data-[side=left]:slide-in-from-right-2',
		'data-[side=right]:slide-in-from-left-2',
		'data-[side=top]:slide-in-from-bottom-2',
	],
})

const TooltipProvider = TooltipPrimitive.Provider

const TooltipRoot = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = forwardRef<
	ElementRef<typeof TooltipPrimitive.Content>,
	ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
	<TooltipPrimitive.Content
		ref={ref}
		sideOffset={sideOffset}
		className={tooltipContentClasses({ class: className })}
		{...props}
	/>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }

type TooltipProps = {
	readonly children: React.ReactNode
	readonly content: React.ReactNode
	readonly side?: 'top' | 'right' | 'bottom' | 'left'
	readonly delayDuration?: number
}

export const Tooltip = ({ children, content, side = 'top', delayDuration = 200 }: TooltipProps) => {
	return (
		<TooltipRoot delayDuration={delayDuration}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side={side}>{content}</TooltipContent>
		</TooltipRoot>
	)
}
