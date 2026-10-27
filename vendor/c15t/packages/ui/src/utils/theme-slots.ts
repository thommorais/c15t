import type { AllThemeKeys, CSSProperties, SlotStyle } from '../theme/types';

export const THEME_SLOT_COMPONENT_KEYS = {
	buttonPrimary: 'button.primary',
	buttonSecondary: 'button.secondary',
	consentBanner: 'banner.root',
	consentBannerCard: 'banner.card',
	consentBannerDescription: 'description.banner',
	consentBannerFooter: 'banner.footer',
	consentBannerFooterSubGroup: 'banner.actionGroup',
	consentBannerHeader: 'banner.header',
	consentBannerOverlay: 'banner.overlay',
	consentBannerRightLink: 'banner.rightLink',
	consentBannerRights: 'banner.rights',
	consentBannerTag: 'tag.banner',
	consentBannerTitle: 'banner.title',
	consentDialog: 'dialog.container',
	consentDialogCard: 'dialog.card',
	consentDialogContent: 'dialog.content',
	consentDialogDescription: 'description.dialog',
	consentDialogHeader: 'dialog.header',
	consentDialogOverlay: 'dialog.overlay',
	consentDialogTag: 'tag.dialog',
	consentDialogTitle: 'dialog.title',
	consentDialogTrigger: 'trigger.root',
	consentDialogTriggerIcon: 'trigger.icon',
	consentDialogTriggerToolbar: 'trigger.toolbar',
	consentDialogTriggerToolbarIcon: 'trigger.toolbarIcon',
	consentDialogTriggerToolbarItem: 'trigger.toolbarItem',
	consentGate: 'consent-gate.root',
	consentGateButton: 'consent-gate.button',
	consentGateTitle: 'consent-gate.title',
	consentWidget: 'manager.root',
	consentWidgetAccordion: 'accordion.root',
	consentWidgetFooter: 'manager.footer',
	consentWidgetFooterSubGroup: 'manager.actionGroup',
	consentWidgetTag: 'tag.manager',
	iabConsentBanner: 'iab-banner.root',
	iabConsentBannerCard: 'iab-banner.card',
	iabConsentBannerFooter: 'iab-banner.footer',
	iabConsentBannerHeader: 'iab-banner.header',
	iabConsentBannerOverlay: 'iab-banner.overlay',
	iabConsentBannerTag: 'tag.iab-banner',
	iabConsentDialog: 'iab-dialog.root',
	iabConsentDialogCard: 'iab-dialog.card',
	iabConsentDialogFooter: 'iab-dialog.footer',
	iabConsentDialogHeader: 'iab-dialog.header',
	iabConsentDialogOverlay: 'iab-dialog.overlay',
	iabConsentDialogTag: 'tag.iab-dialog',
	toggle: 'switch.root',
} as const satisfies Record<AllThemeKeys, `${string}.${string}`>;

export type ComponentSlotAttributes = Record<string, unknown>;

export type ComponentSlotMap = Record<
	string,
	Record<string, ComponentSlotAttributes | undefined> | undefined
>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeSlot = function mergeSlot(
	fromTheme: ComponentSlotAttributes,
	explicit: ComponentSlotAttributes | undefined,
	classAttribute: 'className' | 'class'
): ComponentSlotAttributes {
	if (!explicit) {
		return fromTheme;
	}
	const merged: ComponentSlotAttributes = { ...fromTheme, ...explicit };
	if (fromTheme.noStyle === true || explicit.noStyle === true) {
		merged.noStyle = true;
	}
	const themeClass = fromTheme[classAttribute];
	const explicitClass = explicit[classAttribute];
	if (themeClass && explicitClass) {
		merged[classAttribute] =
			typeof explicitClass === 'string'
				? `${String(themeClass)} ${explicitClass}`
				: [themeClass, explicitClass];
	}
	const themeStyle = fromTheme.style;
	const explicitStyle = explicit.style;
	if (themeStyle && explicitStyle) {
		merged.style = isPlainObject(explicitStyle)
			? { ...(themeStyle as Record<string, unknown>), ...explicitStyle }
			: [themeStyle, explicitStyle];
	}
	return merged;
};

const UNITLESS_PROPERTIES = new Set([
	'animation-iteration-count',
	'aspect-ratio',
	'border-image-outset',
	'border-image-slice',
	'border-image-width',
	'box-flex',
	'box-flex-group',
	'box-ordinal-group',
	'column-count',
	'columns',
	'fill-opacity',
	'flex',
	'flex-grow',
	'flex-negative',
	'flex-order',
	'flex-positive',
	'flex-shrink',
	'flood-opacity',
	'font-weight',
	'grid-area',
	'grid-column',
	'grid-column-end',
	'grid-column-span',
	'grid-column-start',
	'grid-row',
	'grid-row-end',
	'grid-row-span',
	'grid-row-start',
	'line-clamp',
	'line-height',
	'opacity',
	'order',
	'orphans',
	'scale',
	'stop-opacity',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-miterlimit',
	'stroke-opacity',
	'stroke-width',
	'tab-size',
	'widows',
	'z-index',
	'zoom',
]);

export const toCSSPropertyName = function toCSSPropertyName(
	name: string
): string {
	if (name.includes('-')) {
		return name;
	}
	return name
		.replace(/^ms(?=[A-Z])/u, '-ms')
		.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
};

export const toCSSValue = function toCSSValue(
	name: string,
	value: string | number
): string {
	if (typeof value !== 'number' || value === 0 || name.startsWith('--')) {
		return String(value);
	}
	const property = toCSSPropertyName(name).replace(
		/^-(?:webkit|moz|ms|o)-/u,
		''
	);
	return UNITLESS_PROPERTIES.has(property) ? String(value) : `${value}px`;
};

const withCSSLengths = function withCSSLengths(
	style: CSSProperties
): CSSProperties {
	return Object.fromEntries(
		Object.entries(style).map(([name, value]) => [
			name,
			typeof value === 'number' ? toCSSValue(name, value) : value,
		])
	);
};

export const applyThemeSlots = function applyThemeSlots<
	Components extends object,
>(
	slots: Partial<Record<AllThemeKeys, SlotStyle>> | undefined,
	components: Components | undefined,
	classAttribute: 'className' | 'class'
): Components | undefined {
	if (!slots) {
		return components;
	}
	const merged: ComponentSlotMap = { ...(components as ComponentSlotMap) };
	let applied = false;
	for (const [key, target] of Object.entries(THEME_SLOT_COMPONENT_KEYS)) {
		const value = slots[key as AllThemeKeys];
		if (!value) {
			continue;
		}
		const { className, noStyle, style } =
			typeof value === 'string' ? { className: value } : value;
		const attributes: ComponentSlotAttributes = {};
		if (className) {
			attributes[classAttribute] = className;
		}
		if (style && Object.keys(style).length > 0) {
			attributes.style = withCSSLengths(style);
		}
		if (noStyle) {
			attributes.noStyle = true;
		}
		if (Object.keys(attributes).length === 0) {
			continue;
		}
		const [group, slot] = target.split('.') as [string, string];
		const groupSlots = { ...merged[group] };
		groupSlots[slot] = mergeSlot(attributes, groupSlots[slot], classAttribute);
		merged[group] = groupSlots;
		applied = true;
	}
	return applied ? (merged as Components) : components;
};

export const toCSSDeclarations = function toCSSDeclarations(
	style: CSSProperties | undefined
): [property: string, value: string][] {
	const declarations: [string, string][] = [];
	for (const [name, value] of Object.entries(style ?? {})) {
		if (value !== undefined && value !== null && value !== '') {
			declarations.push([toCSSPropertyName(name), toCSSValue(name, value)]);
		}
	}
	return declarations;
};

export const toStyleAttributeValue = function toStyleAttributeValue(
	style: CSSProperties | undefined
): string | undefined {
	const declarations = toCSSDeclarations(style);
	return declarations.length > 0
		? declarations.map(([property, value]) => `${property}:${value}`).join(';')
		: undefined;
};
