import { TEST_IDS } from './test-ids';

export interface AriaRoleExpectation {
	testId: string;
	role: string;
	requiredAttrs?: readonly string[];
	exactAttrs?: Readonly<Record<string, string>>;
}

export interface FocusContract {
	initialFocusTestId: string;
	returnFocusTestId?: string;
	tabOrderTestIds: readonly string[];
}

export interface ComponentContract {
	key: string;
	rootTestId: string;
	elements: readonly AriaRoleExpectation[];
	focus?: FocusContract;
	stableElements: readonly string[];
}

export const BLOCKING_BANNER_CARD: AriaRoleExpectation = {
	exactAttrs: { 'aria-modal': 'true' },
	requiredAttrs: ['aria-label'],
	role: 'dialog',
	testId: TEST_IDS.consentBanner.card,
};

export const DOM_CONTRACT: Readonly<Record<string, ComponentContract>> = {
	consentBanner: {
		elements: [
			{
				requiredAttrs: ['aria-label'],
				role: 'region',
				testId: TEST_IDS.consentBanner.card,
			},
			{ role: 'heading', testId: TEST_IDS.consentBanner.title },
			{
				exactAttrs: { type: 'button' },

				role: 'button',
				testId: TEST_IDS.consentBanner.acceptButton,
			},
			{
				exactAttrs: { type: 'button' },

				role: 'button',
				testId: TEST_IDS.consentBanner.rejectButton,
			},
			{
				exactAttrs: { type: 'button' },

				role: 'button',
				testId: TEST_IDS.consentBanner.customizeButton,
			},
		],
		key: 'consentBanner',
		rootTestId: TEST_IDS.consentBanner.root,
		stableElements: [
			TEST_IDS.consentBanner.root,
			TEST_IDS.consentBanner.card,
			TEST_IDS.consentBanner.title,
			TEST_IDS.consentBanner.description,
			TEST_IDS.consentBanner.acceptButton,
			TEST_IDS.consentBanner.rejectButton,
		],
	},

	consentDialog: {
		elements: [
			{
				exactAttrs: { 'aria-modal': 'true' },

				requiredAttrs: ['aria-labelledby'],
				role: 'dialog',
				testId: TEST_IDS.consentDialog.root,
			},
			{ role: 'heading', testId: TEST_IDS.consentDialog.title },
			{ role: 'presentation', testId: TEST_IDS.consentDialog.overlay },
		],
		focus: {
			initialFocusTestId: TEST_IDS.consentDialog.root,
			returnFocusTestId: TEST_IDS.consentDialog.trigger,
			tabOrderTestIds: [],
		},
		key: 'consentDialog',
		rootTestId: TEST_IDS.consentDialog.root,
		stableElements: [
			TEST_IDS.consentDialog.root,
			TEST_IDS.consentDialog.title,
			TEST_IDS.consentDialog.content,
		],
	},

	consentWidget: {
		elements: [
			{ role: 'group', testId: TEST_IDS.consentWidget.root },
			{ role: 'group', testId: TEST_IDS.consentWidget.accordion },
			{
				exactAttrs: { type: 'button' },

				role: 'button',
				testId: TEST_IDS.consentWidget.footerSaveButton,
			},
		],
		key: 'consentWidget',
		rootTestId: TEST_IDS.consentWidget.root,
		stableElements: [
			TEST_IDS.consentWidget.root,
			TEST_IDS.consentWidget.accordion,
			TEST_IDS.consentWidget.footerSaveButton,
		],
	},

	iabConsentBanner: {
		elements: [
			{
				requiredAttrs: ['aria-label'],
				role: 'region',
				testId: TEST_IDS.iabConsentBanner.card,
			},
			{
				exactAttrs: { type: 'button' },

				role: 'button',
				testId: TEST_IDS.iabConsentBanner.acceptButton,
			},
			{
				exactAttrs: { type: 'button' },

				role: 'button',
				testId: TEST_IDS.iabConsentBanner.rejectButton,
			},
			{
				exactAttrs: { type: 'button' },

				role: 'button',
				testId: TEST_IDS.iabConsentBanner.customizeButton,
			},
		],
		key: 'iabConsentBanner',
		rootTestId: TEST_IDS.iabConsentBanner.root,
		stableElements: [
			TEST_IDS.iabConsentBanner.root,
			TEST_IDS.iabConsentBanner.card,
			TEST_IDS.iabConsentBanner.acceptButton,
		],
	},

	iabConsentDialog: {
		elements: [
			{
				exactAttrs: { 'aria-modal': 'true' },

				requiredAttrs: ['aria-label'],
				role: 'dialog',
				testId: TEST_IDS.iabConsentDialog.card,
			},
		],
		focus: {
			initialFocusTestId: TEST_IDS.iabConsentDialog.card,
			tabOrderTestIds: [],
		},
		key: 'iabConsentDialog',
		rootTestId: TEST_IDS.iabConsentDialog.root,
		stableElements: [
			TEST_IDS.iabConsentDialog.root,
			TEST_IDS.iabConsentDialog.card,
		],
	},
} as const;

export const COMPONENT_KEYS = Object.keys(
	DOM_CONTRACT
) as readonly (keyof typeof DOM_CONTRACT)[];

export const NO_POLICY_HIDDEN_ROOTS = [
	TEST_IDS.consentBanner.root,
	TEST_IDS.consentDialog.root,
	TEST_IDS.consentDialog.link,
	TEST_IDS.consentDialog.trigger,
	TEST_IDS.consentWidget.root,
] as const;
