import type { ANY } from '_/types'
import type { JSX } from 'react/jsx-runtime'

type ValueOf<T> = T[keyof T]
type ReverseMap<T> = ValueOf<T>

type StringValues<T> = {
	[K in keyof T]: T[K] extends string ? T[K] : never
}[keyof T]

type NumberValues<T> = {
	[K in keyof T]: T[K] extends number ? T[K] : never
}[keyof T]

/**
 * Usage : type EnumValues = EnumAsUnion<typeof anEnum>
 */
type EnumAsUnion<T> = `${StringValues<T>}` | NumberValues<T>

export type { EnumAsUnion, ReverseMap, ValueOf }

// ---cut---
type GetEventHandlers<T extends keyof JSX.IntrinsicElements> = Extract<keyof JSX.IntrinsicElements[T], `on${string}`>

/**
 * Provides the event type for a given element and handler.
 *
 * @example
 *
 * type MyEvent = EventFor<"input", "onChange">;
 */
export type EventFor<
	TElement extends keyof JSX.IntrinsicElements,
	THandler extends GetEventHandlers<TElement>,
> = JSX.IntrinsicElements[TElement][THandler] extends ((e: infer TEvent) => ANY) | undefined ? TEvent : never
