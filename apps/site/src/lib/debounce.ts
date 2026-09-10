/**
 * Type definition for a function that can be debounced
 */
type FunctionToDebounce = (...args: unknown[]) => unknown

/**
 * A debounced function type that maintains the parameter types of the original function
 * but always returns void since the execution is delayed
 */
type DebouncedFunction<F extends FunctionToDebounce> = (...args: Parameters<F>) => void

/**
 * Creates a debounced version of the provided function that delays its execution
 * until after the specified delay has elapsed since the last invocation.
 *
 * @template F - The type of the function to debounce, extending FunctionToDebounce
 * @param {F} func - The function to debounce
 * @param {number} delay - The number of milliseconds to delay execution
 * @returns {DebouncedFunction<F>} A debounced version of the provided function
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string): void => {
 *   console.log(`Searching for: ${query}`);
 * }, 300);
 *
 * // Rapidly calling the debounced function
 * debouncedSearch("apple");
 * debouncedSearch("apple pie");
 * // Only the last call with "apple pie" will be executed after 300ms
 * ```
 */
const debounce = <F extends FunctionToDebounce>(func: F, delay: number): DebouncedFunction<F> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined

	return (...args: Parameters<F>): void => {
		const executeFunction = () => {
			timeoutId = undefined
			func.apply(this, args)
		}

		if (timeoutId !== undefined) {
			clearTimeout(timeoutId)
		}

		timeoutId = setTimeout(executeFunction, delay)
	}
}

/**
 * Type definition for a cancellable debounced function
 * Extends the regular debounced function with a cancel method
 */
interface CancellableDebouncedFunction<F extends FunctionToDebounce> extends DebouncedFunction<F> {
	cancel: () => void
}

/**
 * Creates a cancellable debounced version of the provided function.
 * This version includes a `cancel` method to clear the timeout.
 *
 * @template F - The type of the function to debounce, extending FunctionToDebounce
 * @param {F} func - The function to debounce
 * @param {number} delay - The number of milliseconds to delay execution
 * @returns {CancellableDebouncedFunction<F>} A debounced version of the provided function with a cancel method
 *
 * @example
 * ```typescript
 * const debouncedFetch = cancellableDebounce(
 *   async (query: string): Promise<void> => {
 *     const response = await fetch(`/api/search?q=${query}`);
 *     const data = await response.json();
 *     console.log(data);
 *   },
 *   300
 * );
 *
 * debouncedFetch("apple");
 * // If needed, cancel the pending execution:
 * debouncedFetch.cancel();
 * ```
 */
const cancellableDebounce = <F extends FunctionToDebounce>(func: F, delay: number): CancellableDebouncedFunction<F> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined

	const debouncedFunction = (...args: Parameters<F>): void => {
		const executeFunction = () => {
			timeoutId = undefined
			func(...args)
		}

		if (timeoutId !== undefined) {
			clearTimeout(timeoutId)
		}

		timeoutId = setTimeout(executeFunction, delay)
	}

	const cancel = () => {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId)
			timeoutId = undefined
		}
	}

	return Object.assign(debouncedFunction, { cancel })
}

export { cancellableDebounce, debounce }
