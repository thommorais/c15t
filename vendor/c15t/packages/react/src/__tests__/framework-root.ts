import type { KernelConfig } from '@c15t/core';
import type { ConsentProviderOptions } from '@c15t/react';
import type { ComponentType, ReactNode } from 'react';

export type FrameworkRoot = ComponentType<{
	state: KernelConfig;
	persistence?: ConsentProviderOptions['persistence'];
	options?: ConsentProviderOptions;
	children: ReactNode;
}>;
