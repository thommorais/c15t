import { createClearOnRevocationWith } from './clear';
import { clearOnRevocationTools } from './tools';
import type {
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
} from './types';

export type {
	ClearOnRevocationConfig,
	ClearOnRevocationCookie,
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
	ClearOnRevocationTargets,
} from './types';

export const createClearOnRevocation = (
	options: ClearOnRevocationOptions
): ClearOnRevocationHandle =>
	createClearOnRevocationWith(options, clearOnRevocationTools);
