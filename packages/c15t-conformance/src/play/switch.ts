import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

export const toggleOnOff: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const switchEl = canvas.getByRole('switch');

	await waitFor(() => {
		expect(switchEl).toHaveAttribute('aria-checked', 'false');
		expect(switchEl).toHaveAttribute('data-state', 'unchecked');
	});

	await userEvent.click(switchEl);
	await waitFor(() => {
		expect(switchEl).toHaveAttribute('aria-checked', 'true');
		expect(switchEl).toHaveAttribute('data-state', 'checked');
	});

	await userEvent.click(switchEl);
	await waitFor(() => {
		expect(switchEl).toHaveAttribute('aria-checked', 'false');
		expect(switchEl).toHaveAttribute('data-state', 'unchecked');
	});
};

export const controlledToggle: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const switchEl = canvas.getByRole('switch');

	await waitFor(() => {
		expect(switchEl).toHaveAttribute('aria-checked', 'true');
	});

	await userEvent.click(switchEl);
	await waitFor(() => {
		expect(switchEl).toHaveAttribute('aria-checked', 'false');
	});
};
