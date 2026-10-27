import type {
	PolicyConsentCategory,
	PolicyRight,
	ResolvedPolicyRule,
} from '@c15t/schema/types';

export type PresentationAction =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'dismiss'
	| 'save';

export type PromptVariant = 'floating' | 'bar' | 'widget' | 'wall';

export type FloatingPromptPosition =
	| 'bottom-left'
	| 'bottom-right'
	| 'top-left'
	| 'top-right'
	| 'bottom-center'
	| 'top-center';

export type BarPromptPosition = 'top' | 'bottom';

export type WidgetPromptPosition =
	| 'bottom-left'
	| 'bottom-right'
	| 'top-left'
	| 'top-right';

export type WallPromptPosition = 'center';

export type PromptPosition =
	| FloatingPromptPosition
	| BarPromptPosition
	| WidgetPromptPosition
	| WallPromptPosition;

export const PROMPT_VARIANT_POSITIONS = {
	bar: ['top', 'bottom'],
	floating: [
		'bottom-left',
		'bottom-right',
		'top-left',
		'top-right',
		'bottom-center',
		'top-center',
	],
	wall: ['center'],
	widget: ['bottom-left', 'bottom-right', 'top-left', 'top-right'],
} as const satisfies Record<PromptVariant, readonly PromptPosition[]>;

export const PROMPT_VARIANT_DEFAULT_POSITION = {
	bar: 'bottom',
	floating: 'bottom-left',
	wall: 'center',
	widget: 'bottom-right',
} as const satisfies Record<PromptVariant, PromptPosition>;

export interface SurfacePresentation {
	layout?: readonly (PresentationAction | readonly PresentationAction[])[];
	primaryActions?: readonly PresentationAction[];
	direction?: 'row' | 'column';
	uiProfile?: 'balanced' | 'compact' | 'strict';
	scrollLock?: boolean;
	trapFocus?: boolean;
	blocking?: boolean;
}

export interface PromptPresentation extends SurfacePresentation {
	variant?: PromptVariant;
	position?: PromptPosition;
}

export interface PreferencesPresentation extends SurfacePresentation {
	defaults?: Partial<Record<PolicyConsentCategory, boolean>>;
}

export interface ConsentPresentation {
	prompt?: PromptPresentation;
	preferences?: PreferencesPresentation;
}

export interface PresentationDiagnostic {
	code:
		| 'forbidden-action'
		| 'required-action-restored'
		| 'equivalent-prominence-overridden'
		| 'invalid-variant'
		| 'invalid-position'
		| 'blocking-forbidden'
		| 'blocking-required';
	actions: PresentationAction[];
	message: string;
}

export interface ResolvedConsentPresentation {
	allowedActions: PresentationAction[];
	requiredActions: PresentationAction[];
	equivalentActions: PresentationAction[][];
	orderedActions: PresentationAction[];
	actionGroups: PresentationAction[][];
	primaryActions: PresentationAction[];
	diagnostics: PresentationDiagnostic[];
	rights: readonly PolicyRight[];
	preferenceControls: Exclude<PolicyRight, 'disclosure'>[];
	direction: 'row' | 'column';
	uiProfile: 'balanced' | 'compact' | 'strict';
	scrollLock: boolean;
	trapFocus: boolean;
	shouldFillActions: boolean;
	variant: PromptVariant;
	position: PromptPosition;
	positionSource: 'host' | 'default';
	blocking: boolean;
}

const defaultLayout = function defaultLayout(
	allowedActions: PresentationAction[]
): NonNullable<SurfacePresentation['layout']> {
	const choicePair: PresentationAction[] = ['reject', 'accept'].filter(
		(action): action is PresentationAction =>
			allowedActions.includes(action as PresentationAction)
	);
	const rest = allowedActions.filter((action) => !choicePair.includes(action));
	return choicePair.length > 0 ? [choicePair, ...rest] : rest;
};

const resolveRequiredGroups = function resolveRequiredGroups(
	allowedActions: PresentationAction[],
	requiredActions: PresentationAction[],
	suppliedLayout: SurfacePresentation['layout'],
	diagnostics: PresentationDiagnostic[]
): PresentationAction[][] {
	const seen = new Set<PresentationAction>();
	const actionGroups: PresentationAction[][] = [];
	const layout = suppliedLayout ?? defaultLayout(allowedActions);
	for (const entry of layout) {
		const group: PresentationAction[] = [];
		for (const action of typeof entry === 'string' ? [entry] : entry) {
			if (!allowedActions.includes(action)) {
				diagnostics.push({
					actions: [action],
					code: 'forbidden-action',
					message: `The policy does not allow ${action} on this surface.`,
				});
			} else if (!seen.has(action)) {
				seen.add(action);
				group.push(action);
			}
		}
		if (group.length) {
			actionGroups.push(group);
		}
	}
	const missing = requiredActions.filter((action) => !seen.has(action));
	if (missing.length) {
		if (!actionGroups.length) {
			actionGroups.push([]);
		}
		actionGroups[0]?.push(...missing);
		diagnostics.push({
			actions: missing,
			code: 'required-action-restored',
			message:
				'Required actions omitted by the layout were restored at the same interaction depth.',
		});
	}

	return actionGroups;
};

const resolvePreferenceControls = function resolvePreferenceControls(
	rights: readonly PolicyRight[],
	orderedActions: readonly PresentationAction[],
	preferences: boolean,
	messageProfile?: string
): ResolvedConsentPresentation['preferenceControls'] {
	if (preferences) {
		return [];
	}
	if (rights.includes('opt-out') && !orderedActions.includes('reject')) {
		return [messageProfile === 'preferences' ? 'preferences' : 'opt-out'];
	}
	return rights.includes('preferences') && !orderedActions.includes('customize')
		? ['preferences']
		: [];
};

const resolveBlocking = (
	options: SurfacePresentation,
	variant: PromptVariant,
	notice: boolean,
	preferences: boolean,
	diagnostics: PresentationDiagnostic[]
): boolean => {
	const legacyBlocking =
		options.scrollLock === false || options.trapFocus === false
			? false
			: (options.scrollLock ?? options.trapFocus);
	let blocking =
		options.blocking ?? legacyBlocking ?? (preferences || variant === 'wall');
	if (notice && blocking) {
		blocking = false;
		diagnostics.push({
			actions: [],
			code: 'blocking-forbidden',
			message: 'A notice prompt is never blocking; blocking was disabled.',
		});
	} else if (!preferences && variant === 'wall' && !blocking) {
		blocking = true;
		diagnostics.push({
			actions: [],
			code: 'blocking-required',
			message: 'The wall variant is always blocking; blocking was enabled.',
		});
	}
	return blocking;
};

const isValidPromptPosition = function isValidPromptPosition(
	variant: PromptVariant,
	position: PromptPosition
): boolean {
	return (PROMPT_VARIANT_POSITIONS[variant] as readonly string[]).includes(
		position
	);
};

const resolveSurfaceGeometry = function resolveSurfaceGeometry(
	options: PromptPresentation,
	notice: boolean,
	preferences: boolean,
	diagnostics: PresentationDiagnostic[]
): Pick<
	ResolvedConsentPresentation,
	'variant' | 'position' | 'positionSource' | 'blocking'
> {
	const defaultVariant: PromptVariant = preferences ? 'wall' : 'floating';
	let variant = preferences
		? defaultVariant
		: (options.variant ?? defaultVariant);
	if (notice && variant === 'wall') {
		variant = 'floating';
		diagnostics.push({
			actions: [],
			code: 'invalid-variant',
			message: 'A notice cannot use a blocking wall; using floating.',
		});
	}
	if (
		preferences &&
		(options.variant !== undefined || options.position !== undefined)
	) {
		diagnostics.push({
			actions: [],
			code: 'invalid-variant',
			message:
				'Preferences use a centered dialog; variant and position are prompt options.',
		});
	}
	const defaultPosition = PROMPT_VARIANT_DEFAULT_POSITION[variant];
	let position: PromptPosition = defaultPosition;
	let positionSource: 'host' | 'default' = 'default';
	if (!preferences && options.position !== undefined) {
		if (isValidPromptPosition(variant, options.position)) {
			({ position } = options);
			positionSource = 'host';
		} else {
			diagnostics.push({
				actions: [],
				code: 'invalid-position',
				message: `Position "${options.position}" is not valid for the ${variant} variant; using "${defaultPosition}".`,
			});
		}
	}
	const blocking = resolveBlocking(
		options,
		variant,
		notice,
		preferences,
		diagnostics
	);
	return { blocking, position, positionSource, variant };
};

export const resolveConsentPresentation =
	function resolveConsentPresentation(input: {
		policy: ResolvedPolicyRule;
		surface: 'prompt' | 'preferences';
		presentation?: ConsentPresentation;
		override?: PromptPresentation | PreferencesPresentation;
		actionAppearance?: Partial<
			Record<PresentationAction, { variant?: string; mode?: string }>
		>;
	}): ResolvedConsentPresentation {
		const preferences = input.surface === 'preferences';
		const options: PromptPresentation = {
			...input.presentation?.[input.surface],
			...Object.fromEntries(
				Object.entries(input.override ?? {}).filter(
					([, value]) => value !== undefined
				)
			),
		};
		const constraints = preferences
			? {
					allowed: ['reject', 'accept', 'save'] satisfies PresentationAction[],
					equivalent: [['accept', 'reject']] satisfies PresentationAction[][],
					required: ['reject', 'accept', 'save'] satisfies PresentationAction[],
				}
			: input.policy.actions;
		const allowedActions: PresentationAction[] = [
			...new Set(constraints.allowed),
		];
		const requiredActions: PresentationAction[] = [
			...new Set(constraints.required),
		];
		const equivalentActions: PresentationAction[][] =
			constraints.equivalent.map((group) => [...group]);
		const diagnostics: PresentationDiagnostic[] = [];
		const actionGroups = resolveRequiredGroups(
			allowedActions,
			requiredActions,
			options.layout,
			diagnostics
		);
		const orderedActions = actionGroups.flat();
		const defaultPrimary: PresentationAction[] = preferences
			? ['save']
			: ['customize'];
		const hostPrimary = (options.primaryActions ?? defaultPrimary).filter(
			(action) => orderedActions.includes(action)
		);
		const primaryActions =
			hostPrimary.length === 0 &&
			orderedActions.length === 1 &&
			orderedActions[0] === 'dismiss'
				? ['dismiss' as const]
				: hostPrimary;
		for (const group of equivalentActions) {
			const primaryCount = group.filter((action) =>
				primaryActions.includes(action)
			).length;
			const appearances = new Set(
				group.map((action) => {
					const style = input.actionAppearance?.[action];
					return `${style?.variant ?? (primaryActions.includes(action) ? 'primary' : 'neutral')}:${style?.mode ?? 'stroke'}`;
				})
			);
			if (
				(primaryCount > 0 && primaryCount < group.length) ||
				appearances.size > 1
			) {
				diagnostics.push({
					actions: [...group],
					code: 'equivalent-prominence-overridden',
					message:
						'Host presentation gives equivalent actions different prominence.',
				});
			}
		}
		const notice = !preferences && input.policy.prompt === 'notice';
		const direction = options.direction ?? 'row';
		const uiProfile = options.uiProfile ?? 'compact';
		const geometry = resolveSurfaceGeometry(
			options,
			notice,
			preferences,
			diagnostics
		);
		const scrollLock = geometry.blocking;
		const trapFocus = geometry.blocking;
		return {
			...geometry,
			actionGroups,
			allowedActions,
			diagnostics,
			direction,
			equivalentActions,
			orderedActions,
			preferenceControls: resolvePreferenceControls(
				input.policy.rights,
				orderedActions,
				preferences,
				input.policy.i18n?.messageProfile
			),
			primaryActions,
			requiredActions,
			rights: input.policy.rights,
			scrollLock,
			shouldFillActions: uiProfile === 'strict' || uiProfile === 'balanced',
			trapFocus,
			uiProfile,
		};
	};
