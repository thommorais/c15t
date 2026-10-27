import { isProductionBuild } from './is-production';

const WARNED = Symbol.for('c15t.noRecordsWarned');

export const NO_RECORDS_WARNING =
	'[c15t] Local mode keeps consent only in this browser. c15t keeps no server-side record of consent. Local mode also has no geolocation, so every visitor gets the same policy. Use it for development and tests. For production, see https://c15t.com/docs/concepts/modes\nSet acknowledgeNoRecords: true to hide this message.';

export const warnNoConsentRecords = function warnNoConsentRecords(): void {
	if (typeof window === 'undefined') {
		return;
	}
	const store = globalThis as { [WARNED]?: true };
	if (store[WARNED]) {
		return;
	}
	store[WARNED] = true;
	console.warn(NO_RECORDS_WARNING);
};

export const warnNoConsentRecordsInDevelopment =
	function warnNoConsentRecordsInDevelopment(
		acknowledged: boolean | undefined
	): void {
		if (acknowledged === true || isProductionBuild()) {
			return;
		}
		warnNoConsentRecords();
	};
