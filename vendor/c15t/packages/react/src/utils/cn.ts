import type { ClassValue } from '@c15t/ui/utils';
import { cn as baseCn } from '@c15t/ui/utils';

export type { ClassValue };

export const cnExt = function cnExt(...classes: ClassValue[]) {
	return baseCn(...classes);
};
