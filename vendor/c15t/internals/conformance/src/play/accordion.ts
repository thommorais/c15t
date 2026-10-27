import { expect, userEvent, waitFor, within } from 'storybook/test';
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

const getAccordionItem = function getAccordionItem(
	trigger: HTMLElement | null
) {
	return trigger?.closest('[data-slot="accordion-item"]');
};

const getAccordionContent = function getAccordionContent(item: Element | null) {
	return item?.querySelector('[data-slot="accordion-content"]');
};

const assertMountedAccordionContent = function assertMountedAccordionContent(
	canvasElement: HTMLElement,
	count: number
) {
	const contents = canvasElement.querySelectorAll(
		'[data-slot="accordion-content"]'
	);
	expect(contents).toHaveLength(count);

	for (const content of contents) {
		expect(
			content.querySelector('[data-slot="accordion-content-viewport"]')
		).toBeTruthy();
	}
};

export const singleModeToggle: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const triggers = canvas.getAllByRole('button');
	const firstItem = getAccordionItem(triggers[0] ?? null);
	const secondItem = getAccordionItem(triggers[1] ?? null);
	const firstContent = getAccordionContent(firstItem ?? null);
	const secondContent = getAccordionContent(secondItem ?? null);

	assertMountedAccordionContent(canvasElement, triggers.length);

	await waitFor(() => {
		expect(firstItem).toHaveAttribute('data-state', 'open');
		expect(firstContent).toHaveAttribute('data-state', 'open');
		expect(secondContent).toHaveAttribute('data-state', 'closed');
	});

	await userEvent.click(getDefined(triggers[1]));
	await waitFor(() => {
		expect(firstItem).toHaveAttribute('data-state', 'closed');
		expect(firstContent).toHaveAttribute('data-state', 'closed');
		expect(secondItem).toHaveAttribute('data-state', 'open');
		expect(secondContent).toHaveAttribute('data-state', 'open');
	});

	await userEvent.click(getDefined(triggers[1]));
	await waitFor(() => {
		expect(secondItem).toHaveAttribute('data-state', 'closed');
		expect(secondContent).toHaveAttribute('data-state', 'closed');
	});
};

export const multipleModeToggle: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const triggers = canvas.getAllByRole('button');
	const firstItem = getAccordionItem(triggers[0] ?? null);
	const secondItem = getAccordionItem(triggers[1] ?? null);
	const firstContent = getAccordionContent(firstItem ?? null);
	const secondContent = getAccordionContent(secondItem ?? null);

	assertMountedAccordionContent(canvasElement, triggers.length);

	await waitFor(() => {
		expect(firstItem).toHaveAttribute('data-state', 'open');
		expect(firstContent).toHaveAttribute('data-state', 'open');
		expect(secondItem).toHaveAttribute('data-state', 'open');
		expect(secondContent).toHaveAttribute('data-state', 'open');
	});

	await userEvent.click(getDefined(triggers[0]));
	await waitFor(() => {
		expect(firstItem).toHaveAttribute('data-state', 'closed');
		expect(firstContent).toHaveAttribute('data-state', 'closed');
		expect(secondItem).toHaveAttribute('data-state', 'open');
		expect(secondContent).toHaveAttribute('data-state', 'open');
	});
};
