export const TEST_IDS = {
	branding: {
		icon: 'branding-icon',
		link: 'branding-link',
	},
	consentAtoms: {
		actions: 'consent-actions',
		description: 'consent-description',
		legalLinks: 'consent-legal-links',
		link: 'consent-link',
		switch: 'consent-switch',
		tag: 'consent-tag',
	},
	consentBanner: {
		acceptButton: 'consent-banner-accept-button',
		branding: 'consent-banner-branding',
		card: 'consent-banner-card',
		customizeButton: 'consent-banner-customize-button',
		description: 'consent-banner-description',
		dismissButton: 'consent-banner-dismiss-button',
		footer: 'consent-banner-footer',
		footerSubGroup: 'consent-banner-footer-sub-group',
		header: 'consent-banner-header',
		overlay: 'consent-banner-overlay',
		rejectButton: 'consent-banner-reject-button',
		rights: 'consent-banner-rights',
		root: 'consent-banner-root',
		title: 'consent-banner-title',
	},
	consentDialog: {
		branding: 'consent-dialog-branding',
		card: 'consent-dialog-card',
		content: 'consent-dialog-content',
		description: 'consent-dialog-description',
		footer: 'consent-dialog-footer',
		header: 'consent-dialog-header',
		legalLinks: 'consent-legal-links',

		link: 'consent-dialog-link',
		overlay: 'consent-dialog-overlay',
		root: 'consent-dialog-root',
		title: 'consent-dialog-title',
		trigger: 'consent-dialog-trigger',
	},
	consentGate: {
		button: 'consent-gate-button',
		placeholder: 'consent-gate-placeholder',
		title: 'consent-gate-title',
	},
	consentManager: {
		accordion: 'consent-manager-accordion',
		footer: 'consent-manager-footer',
		root: 'consent-manager-root',
	},
	consentPreferencesAnchor: 'consent-preferences-anchor',
	consentWidget: {
		accordion: 'consent-widget-accordion',
		branding: 'consent-widget-branding',
		footer: 'consent-widget-footer',
		footerAcceptAllButton: 'consent-widget-footer-accept-all-button',
		footerAcceptButton: 'consent-widget-footer-accept-button',
		footerCustomizeButton: 'consent-widget-footer-customize-button',
		footerSaveButton: 'consent-widget-footer-save-button',
		footerSubGroup: 'consent-widget-footer-sub-group',
		rejectButton: 'consent-widget-reject-button',
		root: 'consent-widget-root',
	},
	iabConsentBanner: {
		acceptButton: 'iab-consent-banner-accept-button',
		branding: 'iab-consent-banner-branding',
		card: 'iab-consent-banner-card',
		customizeButton: 'iab-consent-banner-customize-button',
		footer: 'iab-consent-banner-footer',
		header: 'iab-consent-banner-header',
		overlay: 'iab-consent-banner-overlay',
		partnersLink: 'iab-consent-banner-partners-link',

		rejectButton: 'iab-consent-banner-reject-button',
		root: 'iab-consent-banner-root',
	},
	iabConsentDialog: {
		branding: 'iab-consent-dialog-branding',
		card: 'iab-consent-dialog-card',
		closeButton: 'iab-consent-dialog-close',
		features: 'iab-consent-dialog-features',

		overlay: 'iab-consent-dialog-overlay',
		root: 'iab-consent-dialog-root',
	},
	vuePrimitive: {
		actions: 'consent-actions',
		switch: 'consent-switch',
	},
} as const;

export const TEST_ID_PATTERNS = [
	/^consent-banner-legal-link-(?:privacyPolicy|cookiePolicy|termsOfService)$/u,
	/^consent-dialog-legal-link-(?:privacyPolicy|cookiePolicy|termsOfService)$/u,
	/^consent-banner-right-link-[a-z][a-z0-9-]*$/u,
	/^consent-widget-accordion-item-[a-z][a-z0-9-]*$/u,
	/^consent-widget-accordion-trigger-[a-z][a-z0-9-]*$/u,
	/^consent-widget-accordion-arrow-[a-z][a-z0-9-]*$/u,
	/^consent-widget-accordion-content-[a-z][a-z0-9-]*$/u,
	/^consent-widget-switch-[a-z][a-z0-9-]*$/u,
	/^consent-widget-restriction-[a-z][a-z0-9-]*$/u,
	/^consent-widget-vendor-list-[a-z][a-z0-9-]*$/u,
	/^consent-widget-vendor-hint-[a-z][a-z0-9-]*$/u,
	/^consent-widget-vendor-item-[a-z][a-z0-9-]*-[a-z0-9][a-z0-9._-]*$/u,
	/^consent-widget-vendor-trigger-[a-z][a-z0-9-]*-[a-z0-9][a-z0-9._-]*$/u,
	/^consent-widget-vendor-name-[a-z][a-z0-9-]*-[a-z0-9][a-z0-9._-]*$/u,
	/^consent-widget-vendor-content-[a-z][a-z0-9-]*-[a-z0-9][a-z0-9._-]*$/u,
	/^consent-widget-vendor-switch-[a-z][a-z0-9-]*-[a-z0-9][a-z0-9._-]*$/u,
	/^stack-item-[a-z0-9][a-z0-9-]*$/u,
	/^purpose-item-[a-z0-9][a-z0-9-]*$/u,
	/^special-purpose-item-[a-z0-9][a-z0-9-]*$/u,
	/^special-feature-item-[a-z0-9][a-z0-9-]*$/u,
	/^feature-item-[a-z0-9][a-z0-9-]*$/u,
	/^vendor-[a-z0-9][a-z0-9-]*$/u,
] as const;

const flatten = function flatten(value: unknown, out: Set<string>): void {
	if (typeof value === 'string') {
		out.add(value);
		return;
	}
	if (value && typeof value === 'object') {
		for (const v of Object.values(value)) {
			flatten(v, out);
		}
	}
};

const allIds = new Set<string>();
flatten(TEST_IDS, allIds);

export const ALL_TEST_IDS: ReadonlySet<string> = allIds;

export const isCanonicalTestId = function isCanonicalTestId(
	id: string
): boolean {
	if (ALL_TEST_IDS.has(id)) {
		return true;
	}
	return TEST_ID_PATTERNS.some((re) => re.test(id));
};
