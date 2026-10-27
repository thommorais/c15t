import * as v from 'valibot';

import { hostingValues } from './constants';

export const hostingSchema = v.picklist(hostingValues);

export type Hosting = v.InferOutput<typeof hostingSchema>;

export { hostingValues };
