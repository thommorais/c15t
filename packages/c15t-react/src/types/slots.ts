import type { ConsentComponentSlots } from '@c15t/schema/config';
import type { HTMLAttributes } from 'react';

export type ReactSlotProps = HTMLAttributes<HTMLElement> &
	Record<`data-${string}`, string | number | boolean | undefined>;

export type ReactComponentSlots = ConsentComponentSlots<ReactSlotProps>;
