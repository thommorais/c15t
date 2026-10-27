import type { ClassValue } from '../utils/cn';

export type CSSProperties = Record<string, string | number | undefined>;

export type CSSPropertiesWithVars<
	VariableMap = Record<string, string | number>,
> = CSSProperties & Partial<VariableMap>;

export interface ClassNameStyle<VariableMap = Record<string, string | number>> {
	style?: CSSPropertiesWithVars<VariableMap>;
	className?: string;
	noStyle?: boolean;
	baseClassName?: ClassValue;
}

export type ThemeValue<VariableMap = Record<string, string | number>> =
	| string
	| ClassNameStyle<VariableMap>;

export interface CSSVariables {
	[key: string]: string | number;
}

export interface ColorTokens {
	primary?: string;
	primaryHover?: string;
	surface?: string;
	surfaceHover?: string;
	border?: string;
	borderHover?: string;
	text?: string;
	textMuted?: string;
	textOnPrimary?: string;
	overlay?: string;
	switchTrack?: string;
	switchTrackActive?: string;
	switchThumb?: string;
}

export interface TypographyTokens {
	fontFamily?: string;

	fontSize?: {
		sm?: string;
		base?: string;
		lg?: string;
	};

	fontWeight?: {
		normal?: number;
		medium?: number;
		semibold?: number;
	};

	lineHeight?: {
		tight?: string;
		normal?: string;
		relaxed?: string;
	};
}

export interface SpacingTokens {
	xs?: string;
	sm?: string;
	md?: string;
	lg?: string;
	xl?: string;
}

export interface RadiusTokens {
	sm?: string;
	md?: string;
	lg?: string;
	full?: string;
}

export interface ShadowTokens {
	sm?: string;
	md?: string;
	lg?: string;
}

export interface MotionTokens {
	duration?: {
		fast?: string;
		normal?: string;
		slow?: string;
	};
	easing?: string;
	easingOut?: string;
	easingIn?: string;
	easingInOut?: string;
	easingSpring?: string;
}

export interface ConsentActionStyle {
	variant?: 'primary' | 'neutral';
	mode?: 'filled' | 'stroke' | 'lighter' | 'ghost';
}

export interface ThemeCSSVariables {
	'--c15t-primary'?: string;
	'--c15t-primary-hover'?: string;
	'--c15t-surface'?: string;
	'--c15t-surface-hover'?: string;
	'--c15t-border'?: string;
	'--c15t-border-hover'?: string;
	'--c15t-text'?: string;
	'--c15t-text-muted'?: string;
	'--c15t-text-on-primary'?: string;
	'--c15t-overlay'?: string;
	'--c15t-switch-track'?: string;
	'--c15t-switch-track-active'?: string;
	'--c15t-switch-thumb'?: string;

	'--c15t-font-family'?: string;
	'--c15t-font-size-sm'?: string;
	'--c15t-font-size-base'?: string;
	'--c15t-font-size-lg'?: string;
	'--c15t-font-weight-normal'?: string;
	'--c15t-font-weight-medium'?: string;
	'--c15t-font-weight-semibold'?: string;
	'--c15t-line-height-tight'?: string;
	'--c15t-line-height-normal'?: string;
	'--c15t-line-height-relaxed'?: string;

	'--c15t-space-xs'?: string;
	'--c15t-space-sm'?: string;
	'--c15t-space-md'?: string;
	'--c15t-space-lg'?: string;
	'--c15t-space-xl'?: string;

	'--c15t-radius-sm'?: string;
	'--c15t-radius-md'?: string;
	'--c15t-radius-lg'?: string;
	'--c15t-radius-full'?: string;

	'--c15t-shadow-sm'?: string;
	'--c15t-shadow-md'?: string;
	'--c15t-shadow-lg'?: string;

	'--c15t-duration-fast'?: string;
	'--c15t-duration-normal'?: string;
	'--c15t-duration-slow'?: string;
	'--c15t-easing'?: string;
	'--c15t-easing-out'?: string;
	'--c15t-easing-in'?: string;
	'--c15t-easing-in-out'?: string;
	'--c15t-easing-spring'?: string;
}

export type SlotStyle = string | ClassNameStyle;

export interface ComponentSlots {
	consentBanner?: SlotStyle;
	consentBannerCard?: SlotStyle;
	consentBannerHeader?: SlotStyle;
	consentBannerTitle?: SlotStyle;
	consentBannerDescription?: SlotStyle;
	consentBannerFooter?: SlotStyle;
	consentBannerFooterSubGroup?: SlotStyle;
	consentBannerRights?: SlotStyle;
	consentBannerRightLink?: SlotStyle;
	consentBannerTag?: SlotStyle;
	consentBannerOverlay?: SlotStyle;

	consentDialog?: SlotStyle;
	consentDialogCard?: SlotStyle;
	consentDialogHeader?: SlotStyle;
	consentDialogTitle?: SlotStyle;
	consentDialogDescription?: SlotStyle;
	consentDialogContent?: SlotStyle;
	consentDialogTag?: SlotStyle;
	consentDialogOverlay?: SlotStyle;

	consentDialogTrigger?: SlotStyle;
	consentDialogTriggerIcon?: SlotStyle;

	consentDialogTriggerToolbar?: SlotStyle;
	consentDialogTriggerToolbarItem?: SlotStyle;
	consentDialogTriggerToolbarIcon?: SlotStyle;

	consentWidget?: SlotStyle;
	consentWidgetAccordion?: SlotStyle;
	consentWidgetFooter?: SlotStyle;
	consentWidgetFooterSubGroup?: SlotStyle;
	consentWidgetTag?: SlotStyle;

	consentGate?: SlotStyle;
	consentGateTitle?: SlotStyle;
	consentGateButton?: SlotStyle;

	iabConsentBanner?: SlotStyle;
	iabConsentBannerCard?: SlotStyle;
	iabConsentBannerHeader?: SlotStyle;
	iabConsentBannerFooter?: SlotStyle;
	iabConsentBannerTag?: SlotStyle;
	iabConsentBannerOverlay?: SlotStyle;

	iabConsentDialog?: SlotStyle;
	iabConsentDialogCard?: SlotStyle;
	iabConsentDialogHeader?: SlotStyle;
	iabConsentDialogFooter?: SlotStyle;
	iabConsentDialogTag?: SlotStyle;
	iabConsentDialogOverlay?: SlotStyle;

	buttonPrimary?: SlotStyle;
	buttonSecondary?: SlotStyle;
	toggle?: SlotStyle;
}

export type AllThemeKeys = keyof ComponentSlots;

export interface UIOptions {
	theme?: Theme;
	disableAnimation?: boolean;

	scrollLock?: boolean;

	trapFocus?: boolean;

	colorScheme?: 'light' | 'dark' | 'system' | null;

	noStyle?: boolean;
}

export interface Theme {
	colors?: ColorTokens;
	dark?: ColorTokens;
	typography?: TypographyTokens;
	spacing?: SpacingTokens;
	radius?: RadiusTokens;
	shadows?: ShadowTokens;
	motion?: MotionTokens;
	consentActions?: {
		default?: ConsentActionStyle;
		primary?: ConsentActionStyle;
		accept?: ConsentActionStyle;
		reject?: ConsentActionStyle;
		customize?: ConsentActionStyle;
		dismiss?: ConsentActionStyle;
	};
	slots?: ComponentSlots;
}

export const defineTheme = function defineTheme<ThemeType extends Theme>(
	theme: ThemeType
): ThemeType {
	return theme;
};
