import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

const ACCEPT = /^accept all$/iu;
const REJECT = /^reject all$/iu;

const openPreferences = async function openPreferences() {
	const body = within(document.body);
	await userEvent.click(await body.findByText('Privacy settings'));
	return body.findByRole('switch', { name: /marketing/iu });
};

const decide = function decide(action: RegExp, granted: boolean): PlayFunction {
	return async () => {
		const body = within(document.body);
		const button = await body.findByRole('button', { name: action });
		await userEvent.click(button);
		await waitFor(() => {
			expect(body.queryByRole('button', { name: action })).toBeNull();
		});
		const marketing = await openPreferences();
		await waitFor(() => {
			expect(marketing).toHaveAttribute('aria-checked', String(granted));
		});
	};
};

export const recipeRenders: PlayFunction = async () => {
	const body = within(document.body);
	const accept = await body.findByRole('button', { name: ACCEPT });
	await waitFor(() => {
		expect(accept).toBeVisible();
		expect(body.getByRole('button', { name: REJECT })).toBeVisible();
	});
	expect(body.getByText('Privacy settings')).toBeInTheDocument();
};

export const recipeAccepts: PlayFunction = decide(ACCEPT, true);

export const recipeRejects: PlayFunction = decide(REJECT, false);
