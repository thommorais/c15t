export const FIRST_PAINT_COMPONENTS = [
	'branding',
	'button',
	'consent-actions',
	'consent-gate',
	'legal-links',
	'panel-trigger',
	'prompt',
] as const;

export const DIALOG_COMPONENTS = [
	'accordion',
	'collapsible',
	'manager',
	'panel',
	'preference-item',
	'switch',
	'tabs',
	'vendor-list',
] as const;

export const IAB_PREFIX = 'iab-';

export const IAB_FIRST_PAINT_COMPONENTS = ['iab-prompt'] as const;

export const IAB_DIALOG_COMPONENTS = ['iab-panel'] as const;

export const LAYER_ORDER =
	'@layer properties, theme, base, components, utilities;';
