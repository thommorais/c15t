import { expect, userEvent, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

export const toggleOpenClose: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const trigger = canvas.getByRole('button');
	const content = canvasElement.querySelector('[data-state]');

	await expect(content).toHaveAttribute('data-state', 'open');

	await userEvent.click(trigger);
	await expect(content).toHaveAttribute('data-state', 'closed');

	await userEvent.click(trigger);
	await expect(content).toHaveAttribute('data-state', 'open');
};

export const startsClosedByDefault: PlayFunction = async ({
	canvasElement,
}) => {
	const content = canvasElement.querySelector('[data-state]');
	await expect(content).toHaveAttribute('data-state', 'closed');

	const canvas = within(canvasElement);
	const trigger = canvas.getByRole('button');
	await userEvent.click(trigger);
	await expect(content).toHaveAttribute('data-state', 'open');
};
