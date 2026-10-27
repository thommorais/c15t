import { expect, userEvent, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

const getDefined = <Value>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

export const triggerExpandsContent: PlayFunction = async ({
	canvasElement,
}) => {
	const canvas = within(canvasElement);
	const trigger = canvas.getByRole('button');
	const content = canvasElement.querySelector('[data-state]');

	const initialState = content?.getAttribute('data-state');
	await userEvent.click(trigger);

	const expectedState = initialState === 'open' ? 'closed' : 'open';
	await expect(content).toHaveAttribute('data-state', expectedState);

	await userEvent.click(trigger);
	await expect(content).toHaveAttribute('data-state', initialState);
};

export const switchIndependentOfTrigger: PlayFunction = async ({
	canvasElement,
}) => {
	const canvas = within(canvasElement);
	const switchEl = canvas.getByRole('switch');
	const buttons = canvas.getAllByRole('button');
	const trigger = getDefined(buttons[0]);

	const contentBefore = canvasElement
		.querySelector('[data-state]')
		?.getAttribute('data-state');
	await userEvent.click(switchEl);
	await expect(canvasElement.querySelector('[data-state]')).toHaveAttribute(
		'data-state',
		contentBefore
	);

	const switchStateBefore = switchEl.getAttribute('aria-checked');
	await userEvent.click(trigger);
	await expect(switchEl).toHaveAttribute('aria-checked', switchStateBefore);
};
