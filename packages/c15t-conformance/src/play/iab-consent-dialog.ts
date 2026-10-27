import { expect, userEvent, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

import {
	assertDomContract,
	assertStableElements,
} from '../assertions/dom-contract';

export const iabDialogContract: PlayFunction = async () => {
	const body = within(document.body);
	await body.findByTestId('iab-consent-dialog-root');
	assertDomContract(document.body, 'iabConsentDialog');
	assertStableElements(document.body, 'iabConsentDialog');
};

export const tabSwitchFlow: PlayFunction = async () => {
	const body = within(document.body);
	await userEvent.click(await body.findByRole('tab', { name: /vendors/iu }));
	await userEvent.click(await body.findByRole('tab', { name: /purposes/iu }));

	await expect(body.getByTestId('iab-consent-dialog-root')).toBeInTheDocument();
};

export const tabAndExpansionFlow: PlayFunction = async () => {
	const body = within(document.body);
	await userEvent.click(await body.findByRole('tab', { name: /vendors/iu }));
	const vendorTrigger = body
		.getAllByRole('button')
		.find((button) => button.className.includes('vendorListTrigger'));
	await expect(vendorTrigger).toBeDefined();
	if (vendorTrigger) {
		await userEvent.click(vendorTrigger);
	}
	await userEvent.click(await body.findByRole('tab', { name: /purposes/iu }));

	await expect(body.getByTestId('iab-consent-dialog-root')).toBeInTheDocument();
};
