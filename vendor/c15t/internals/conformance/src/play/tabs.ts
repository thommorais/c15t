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

export const tabSwitching: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const tabs = canvas.getAllByRole('tab');

	await expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
	await expect(tabs[0]).toHaveAttribute('data-state', 'active');
	await expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
	await expect(tabs[1]).toHaveAttribute('data-state', 'inactive');

	await userEvent.click(getDefined(tabs[1]));
	await expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
	await expect(tabs[0]).toHaveAttribute('data-state', 'inactive');
	await expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
	await expect(tabs[1]).toHaveAttribute('data-state', 'active');

	const panels = canvas.getAllByRole('tabpanel');
	await expect(panels).toHaveLength(1);
};

export const keyboardNavigation: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const tabs = canvas.getAllByRole('tab');

	await userEvent.click(getDefined(tabs[0]));
	await expect(tabs[0]).toHaveFocus();

	await userEvent.keyboard('{ArrowRight}');
	await expect(tabs[1]).toHaveFocus();

	await userEvent.keyboard('{ArrowRight}');
	await expect(tabs[2]).toHaveFocus();

	await userEvent.keyboard('{ArrowRight}');
	await expect(tabs[0]).toHaveFocus();
};

export const arrowLeftNavigation: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const tabs = canvas.getAllByRole('tab');

	await userEvent.click(getDefined(tabs[0]));
	await expect(tabs[0]).toHaveFocus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect(tabs[2]).toHaveFocus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect(tabs[1]).toHaveFocus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect(tabs[0]).toHaveFocus();
};

export const homeAndEndKeys: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const tabs = canvas.getAllByRole('tab');

	await userEvent.click(getDefined(tabs[0]));
	await expect(tabs[0]).toHaveFocus();

	await userEvent.keyboard('{End}');
	await expect(tabs[2]).toHaveFocus();
	await expect(tabs[2]).toHaveAttribute('aria-selected', 'true');

	await userEvent.keyboard('{Home}');
	await expect(tabs[0]).toHaveFocus();
	await expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
};

export const tabKeySkipsInactiveTabs: PlayFunction = async ({
	canvasElement,
}) => {
	const canvas = within(canvasElement);
	const tabs = canvas.getAllByRole('tab');

	await userEvent.click(getDefined(tabs[0]));
	await expect(tabs[0]).toHaveFocus();

	await userEvent.keyboard('{Tab}');
	const panel = canvas.getByRole('tabpanel');
	await expect(panel).toHaveFocus();
};
