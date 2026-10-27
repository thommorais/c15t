import type { UIOptions } from '@c15t/ui/theme';

import type { ReactComponentSlots } from './slots';

export interface ReactUIOptions extends UIOptions {
	components?: ReactComponentSlots;
}
