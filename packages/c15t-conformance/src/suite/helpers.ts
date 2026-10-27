import type { TestDriver } from '../driver';

export type TestFn = (name: string, body: () => void | Promise<void>) => void;

export type DescribeFn = (name: string, body: () => void) => void;

export type ExpectFn = (
	value: unknown,
	message?: string
) => {
	toBe: (value: unknown) => void;
	toEqual: (value: unknown) => void;
	toContain: (value: unknown) => void;
	toHaveProperty: (key: string) => void;
	toBeGreaterThan: (value: number) => void;
	toBeGreaterThanOrEqual: (value: number) => void;
	toBeDefined: () => void;
	not: {
		toBeNull: () => void;
		toThrow: () => void;
	};
};

export interface SuiteApi {
	describe: DescribeFn;
	test: TestFn;
	expect: ExpectFn;
}

export const conformanceTest = function conformanceTest(
	api: SuiteApi,
	name: string,
	body: () => void | Promise<void>
): void {
	api.test(name, body);
};

export interface SuiteContext {
	driver: TestDriver;
	api: SuiteApi;
}

export const queryAllIncludingShadowRoots = (
	root: ParentNode,
	selector: string
): HTMLElement[] => {
	const results = [...root.querySelectorAll<HTMLElement>(selector)];
	if (root instanceof Element && root.shadowRoot) {
		results.push(...queryAllIncludingShadowRoots(root.shadowRoot, selector));
	}
	for (const element of root.querySelectorAll('*')) {
		if (element.shadowRoot) {
			results.push(
				...queryAllIncludingShadowRoots(element.shadowRoot, selector)
			);
		}
	}
	return results;
};

export const queryByTestId = function queryByTestId(
	root: HTMLElement,
	testId: string
): HTMLElement | null {
	const selector = `[data-testid="${testId}"]`;
	return (
		queryAllIncludingShadowRoots(root, selector)[0] ??
		queryAllIncludingShadowRoots(root.ownerDocument.body, selector)[0] ??
		null
	);
};

export const waitForCondition = function waitForCondition(
	predicate: () => boolean,
	timeoutMs = 2000,
	intervalMs = 10
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	const poll = async (): Promise<boolean> => {
		if (predicate()) {
			return true;
		}
		if (Date.now() >= deadline) {
			return predicate();
		}
		await new Promise((resolve) => {
			setTimeout(resolve, intervalMs);
		});
		return poll();
	};
	return poll();
};

export const clearBrowserConsentStorage =
	function clearBrowserConsentStorage(): void {
		if (typeof document === 'undefined') {
			return;
		}
		try {
			globalThis.localStorage?.clear();
		} catch {
		}
		for (const cookie of document.cookie.split(';')) {
			const name = cookie.split('=')[0]?.trim();
			if (name) {
				document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
			}
		}
	};
