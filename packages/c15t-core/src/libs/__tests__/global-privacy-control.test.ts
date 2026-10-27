import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hasGlobalPrivacyControlSignal } from '../global-privacy-control';

describe('hasGlobalPrivacyControlSignal', () => {
	let originalWindow: typeof window | undefined;

	beforeEach(() => {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (typeof window === 'undefined') {
			originalWindow = undefined;
		} else {
			originalWindow = window;
		}
	});

	afterEach(() => {
		if (originalWindow === undefined) {
			Reflect.deleteProperty(globalThis, 'window');
		} else {
			globalThis.window = originalWindow;
		}
	});

	it('returns false when window is undefined (server-side environment)', () => {
		Reflect.deleteProperty(globalThis, 'window');

		const result = hasGlobalPrivacyControlSignal();

		expect(result).toBe(false);
	});

	it('returns true when navigator.globalPrivacyControl is boolean true', () => {
		const mockNavigator = {
			globalPrivacyControl: true,
		} as Navigator & { globalPrivacyControl?: boolean | string };

		const mockWindow = { navigator: mockNavigator } as unknown as Window;

		// @ts-expect-error - We intentionally override the global window
		globalThis.window = mockWindow;

		const result = hasGlobalPrivacyControlSignal();

		expect(result).toBe(true);
	});

	it('returns false when navigator.globalPrivacyControl is string "1"', () => {
		const mockNavigator = {
			globalPrivacyControl: '1',
		} as Navigator & { globalPrivacyControl?: boolean | string };

		const mockWindow = { navigator: mockNavigator } as unknown as Window;

		// @ts-expect-error - We intentionally override the global window
		globalThis.window = mockWindow;

		const result = hasGlobalPrivacyControlSignal();

		expect(result).toBe(false);
	});

	it('returns false for other values or when the flag is missing', () => {
		const mockNavigator = {
			globalPrivacyControl: false,
		} as Navigator & { globalPrivacyControl?: boolean | string };

		const mockWindow = { navigator: mockNavigator } as unknown as Window;

		// @ts-expect-error - We intentionally override the global window
		globalThis.window = mockWindow;

		const resultFalse = hasGlobalPrivacyControlSignal();

		expect(resultFalse).toBe(false);

		const mockNavigatorWithoutFlag: Navigator = {} as Navigator;
		const mockWindowWithoutFlag = {
			navigator: mockNavigatorWithoutFlag,
		} as unknown as Window;

		// @ts-expect-error - We intentionally override the global window
		globalThis.window = mockWindowWithoutFlag;

		const resultMissing = hasGlobalPrivacyControlSignal();

		expect(resultMissing).toBe(false);
	});

	it('returns false if reading navigator.globalPrivacyControl throws', () => {
		const throwingWindow = {} as Window;

		Object.defineProperty(throwingWindow, 'navigator', {
			get() {
				throw new Error('navigator access error');
			},
		});

		// @ts-expect-error - We intentionally override the global window
		globalThis.window = throwingWindow;

		const result = hasGlobalPrivacyControlSignal();

		expect(result).toBe(false);
	});
});
