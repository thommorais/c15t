import { expect, userEvent, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

export const triggerOpensDialog: PlayFunction = async () => {
	const body = within(document.body);
	await userEvent.click(
		await body.findByRole('button', { name: /open privacy settings/iu })
	);
	await expect(
		await body.findByTestId('consent-dialog-root')
	).toBeInTheDocument();
};
