'use client';

import type * as C15tCoreTypes from '@c15t/core';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

import {
	registerDialogChunkWarmer,
	useIdleDialogWarming,
} from './chunk-warming';
import type {
	IABConsentDialogCompoundComponent,
	IABConsentDialogProps,
} from './components/iab-panel';
import type { ConsentDialogTriggerProps } from './components/panel-trigger';
import { useActiveUI, useModel } from './hooks';
import { useIsHydrated } from './hooks/use-is-hydrated';
import { useIAB } from './iab-context';
import { createDeferredModule } from './utils/deferred-module';

type AnyComponent = ComponentType<Record<string, unknown>>;

const DEFAULT_MODELS: readonly C15tCoreTypes.Model[] = ['iab'];

const iabDialogModule = createDeferredModule(
	() => import('./components/iab-panel')
);

let openableDialogs = 0;
let warmRequested = false;

registerDialogChunkWarmer(() => {
	warmRequested = true;
	if (openableDialogs > 0) {
		void iabDialogModule.preload();
	}
});

const LazyIABConsentDialogComponent = iabDialogModule.component(
	(module) => module.IABConsentDialog
);
const LazyConsentDialogTrigger = createDeferredModule(
	() => import('./components/panel-trigger')
).component((module) => module.ConsentDialogTrigger);

const resolveTriggerProps = (
	showTrigger: IABConsentDialogProps['showTrigger']
): ConsentDialogTriggerProps | null => {
	if (showTrigger === true) {
		return {};
	}
	return showTrigger || null;
};

const LazyIABConsentDialog = (props: IABConsentDialogProps) => {
	const activeUI = useActiveUI();
	const model = useModel();
	const iab = useIAB();
	const hydrated = useIsHydrated();
	const models = props.models ?? DEFAULT_MODELS;
	const canOpen =
		model !== null && models.includes(model) && Boolean(iab?.config.enabled);

	useEffect(() => {
		if (!canOpen) {
			return;
		}
		openableDialogs += 1;
		if (warmRequested) {
			void iabDialogModule.preload();
		}
		return () => {
			openableDialogs -= 1;
		};
	}, [canOpen]);

	useIdleDialogWarming(canOpen && activeUI === 'banner');

	const shouldLoad =
		canOpen &&
		((props.open ?? activeUI === 'dialog') || Boolean(props.showTrigger));
	const [rendered, setRendered] = useState(shouldLoad);
	if (shouldLoad && !rendered) {
		setRendered(true);
	}
	if (!(shouldLoad || rendered)) {
		const triggerProps = resolveTriggerProps(props.showTrigger);
		return triggerProps && hydrated && iab?.config.enabled ? (
			<LazyConsentDialogTrigger {...triggerProps} />
		) : null;
	}
	return <LazyIABConsentDialogComponent {...props} />;
};

const COMPOUND_PARTS = [
	'Root',
	'Card',
	'Header',
	'Tabs',
	'TabButton',
	'Content',
	'Footer',
	'Overlay',
	'FeatureItem',
	'PurposeItem',
	'StackItem',
	'VendorList',
] as const satisfies readonly (keyof IABConsentDialogCompoundComponent)[];

const parts: Record<string, AnyComponent> = {};
for (const name of COMPOUND_PARTS) {
	Object.defineProperty(LazyIABConsentDialog, name, {
		configurable: true,
		enumerable: true,
		get() {
			parts[name] ??= iabDialogModule.component(
				(module) =>
					(module.IABConsentDialog as unknown as Record<string, AnyComponent>)[
						name
					] as AnyComponent
			);
			return parts[name];
		},
	});
}

export const IABConsentDialog =
	LazyIABConsentDialog as unknown as IABConsentDialogCompoundComponent;

export const resetIABDialogWarmingForTests =
	function resetIABDialogWarmingForTests(): void {
		openableDialogs = 0;
		warmRequested = false;
	};
