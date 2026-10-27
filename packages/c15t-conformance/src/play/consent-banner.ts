import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

import {
	assertDomContract,
	assertStableElements,
} from '../assertions/dom-contract';
import {
	assertInitialFocus,
	assertVisibleFocusIndicator,
} from '../assertions/focus';

export const bannerContract: PlayFunction = async () => {
	const body = within(document.body);
	await body.findByTestId('consent-banner-root');
	assertDomContract(document.body, 'consentBanner');
	assertStableElements(document.body, 'consentBanner');
	const title = body.getByTestId('consent-banner-title');
	const accept = body.getByTestId('consent-banner-accept-button');
	expect(getComputedStyle(accept).paddingBlockStart).toBe('8px');
	expect(getComputedStyle(title).marginBlockStart).toBe('0px');
	expect(getComputedStyle(title).marginBlockEnd).toBe('0px');
};

export const bannerToDialogFlow: PlayFunction = async () => {
	const body = within(document.body);
	await userEvent.click(
		await body.findByTestId('consent-banner-customize-button')
	);

	await expect(
		await body.findByTestId('consent-dialog-root')
	).toBeInTheDocument();
};

export const bannerAcceptViaKeyboard: PlayFunction = async () => {
	const body = within(document.body);
	const accept = await body.findByTestId('consent-banner-accept-button');
	(accept as HTMLElement).focus();
	expect(document.activeElement).toBe(accept);
	await userEvent.keyboard('{Enter}');
	await waitFor(() => {
		expect(body.queryByTestId('consent-banner-root')).not.toBeInTheDocument();
	});
};

export const bannerFocusManagement: PlayFunction = async () => {
	const body = within(document.body);
	const root = await body.findByTestId('consent-banner-root');
	const card = await body.findByTestId('consent-banner-card');
	if (root.getAttribute('data-blocking') === 'true') {
		expect(card).toHaveAttribute('role', 'dialog');
		expect(card).toHaveAttribute('aria-modal', 'true');
		await assertInitialFocus(document.body, 'consent-banner-card');
	} else {
		expect(card).toHaveAttribute('role', 'region');
		expect(card).not.toHaveAttribute('aria-modal');
		await waitFor(() => {
			expect(card.contains(document.activeElement)).toBe(false);
		});
	}

	await assertVisibleFocusIndicator(
		document.body,
		'consent-banner-reject-button'
	);
	await assertVisibleFocusIndicator(
		document.body,
		'consent-banner-accept-button'
	);
	await assertVisibleFocusIndicator(
		document.body,
		'consent-banner-customize-button'
	);
};
