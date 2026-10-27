import { TEST_IDS } from '../contract/test-ids';
import type { MountableComponent, TestDriver } from '../driver';
import { POLICY_SCENARIOS } from '../fixtures/policy-scenarios';
import { conformanceTest } from './helpers';
import type { SuiteApi } from './helpers';
import { runPolicyScenarioConformance } from './policy-scenarios';

export const runSsrConformance = function runSsrConformance(
	driver: TestDriver,
	api: SuiteApi
): void {
	runPolicyScenarioConformance(
		driver,
		api,
		POLICY_SCENARIOS.filter((scenario) => scenario.covers.includes('F9'))
	);
};

const SERVER_RENDERED_PROMPTS: readonly {
	component: MountableComponent;
	ids: { root: string; acceptButton: string };
}[] = [
	{ component: 'consent-banner', ids: TEST_IDS.consentBanner },
	{ component: 'iab-consent-banner', ids: TEST_IDS.iabConsentBanner },
];

export const runServerRenderConformance = function runServerRenderConformance(
	driver: TestDriver,
	api: SuiteApi
): void {
	api.describe(`[${driver.framework}] server render`, () => {
		for (const { component, ids } of SERVER_RENDERED_PROMPTS) {
			conformanceTest(
				api,
				`${component} is in the server HTML with its accept action`,
				async () => {
					const html = await driver.serverRender({
						component,
						providerOptions: { disableAnimation: true },
					});
					api.expect(html).toContain(`data-testid="${ids.root}"`);
					api.expect(html).toContain(`data-testid="${ids.acceptButton}"`);
				}
			);
		}
	});
};
