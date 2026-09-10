import { tv } from './tv'

const cnClasses = tv({ base: [] })

/** Anything accepted as a class name: strings, nested arrays, and falsy holes. */
export type ClassValue = string | null | undefined | false | ClassValue[]

/**
 * Joins class names, resolving Tailwind conflicts: later classes win over
 * earlier ones in the same group, so `cn('p-2', 'p-4')` yields `'p-4'`.
 *
 * Named `cn` rather than `clsx` because it does not behave like the `clsx`
 * package, which concatenates and never drops a class. That merge is the
 * reason to prefer it: a `className` passed by a caller overrides the
 * component's own utility instead of both landing and letting source order
 * decide.
 */
export const cn = (...args: ClassValue[]): string => cnClasses({ class: [args] }) ?? ''
