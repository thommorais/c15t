/**
 * @deprecated Import from `@thom/safe-return` instead.
 *
 * The result shape changed: a success carries `data`, not `value`. The error
 * type still defaults to `Error` here, whereas `Safe` defaults to `string`.
 */
import type { Safe } from '@thom/safe-return'

export { err, ok } from '@thom/safe-return'

export type Result<T, E = Error> = Safe<T, E>
