import type { TestDriver } from '../driver';
import { LOCALE_FIXTURES } from '../fixtures/locales';
import { conformanceTest } from './helpers';
import type { SuiteApi } from './helpers';

const findDirRoot = function findDirRoot(
	root: HTMLElement
): HTMLElement | null {
	if (root.getAttribute('dir')) {
		return root;
	}
	const local = root.querySelector<HTMLElement>('[dir]');
	if (local) {
		return local;
	}
	return document.body.querySelector<HTMLElement>('[dir]');
};

const visibleText = function visibleText(mountRoot: HTMLElement): string {
	const direct = mountRoot.textContent ?? '';
	const portaled = document.body.textContent ?? '';
	return `${direct}\n${portaled}`;
};

export const runI18nConformance = function runI18nConformance(
	driver: TestDriver,
	api: SuiteApi
): void {
	api.describe(`[${driver.framework}] i18n`, () => {
		for (const locale of LOCALE_FIXTURES) {
			conformanceTest(
				api,
				`${locale.code}: banner renders with locale translations`,
				async () => {
					const mounted = await driver.mount({
						component: 'consent-banner',
						locale: locale.code,
						providerOptions: {
							i18n: {
								detectBrowserLanguage: false,
								locale: locale.code,
								messages: {
									[locale.code]: {
										common: {
											acceptAll: locale.translations.banner.acceptAll,
											customize: locale.translations.banner.customize,

											rejectAll: locale.translations.banner.rejectAll,
										},
										cookieBanner: {
											description: locale.translations.banner.description,

											title: locale.translations.banner.title,
										},
									},
								},
							},
						},
					});
					try {
						const text = visibleText(mounted.root);
						api.expect(text).toContain(locale.translations.banner.title);
					} finally {
						await mounted.unmount();
					}
				}
			);

			if (locale.direction === 'rtl') {
				conformanceTest(
					api,
					`${locale.code}: RTL locale propagates dir="rtl" to rendered tree`,
					async () => {
						const mounted = await driver.mount({
							component: 'consent-banner',
							locale: locale.code,
							providerOptions: {
								i18n: {
									detectBrowserLanguage: false,
									locale: locale.code,
									messages: {
										[locale.code]: {
											cookieBanner: {
												description: locale.translations.banner.description,

												title: locale.translations.banner.title,
											},
										},
									},
								},
							},
						});
						const previousDocDir = document.documentElement.getAttribute('dir');
						document.documentElement.setAttribute('dir', 'rtl');
						try {
							const dirEl = findDirRoot(mounted.root);
							const fallback = document.documentElement.getAttribute('dir');
							api.expect(dirEl?.getAttribute('dir') ?? fallback).toBe('rtl');
						} finally {
							await mounted.unmount();
							if (previousDocDir === null) {
								document.documentElement.removeAttribute('dir');
							} else {
								document.documentElement.setAttribute('dir', previousDocDir);
							}
						}
					}
				);
			}
		}
	});
};
