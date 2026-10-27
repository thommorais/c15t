import { expect, userEvent, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

export const customizeFlow: PlayFunction = async () => {
	const body = within(document.body);
	await userEvent.click(
		await body.findByTestId('iab-consent-banner-customize-button')
	);
	await expect(
		await body.findByTestId('iab-consent-dialog-root')
	).toBeInTheDocument();
};
