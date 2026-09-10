/**
 * Wait for a given number of milliseconds and then resolve.
 *
 * @param ms the number of milliseconds to wait
 */
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export { wait }
