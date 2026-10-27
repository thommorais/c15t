import type { ConsentSnapshot } from '../../types';
import type {
	NormalizedScript,
	ReconcilePass,
	ScriptLoaderTools,
} from './types';

export const buildReconcilePass = function buildReconcilePass(
	snapshot: ConsentSnapshot,
	tools: ScriptLoaderTools
): ReconcilePass {
	return {
		consents: tools.gateState(snapshot).effectivePermissions,
		iab: snapshot.iab,
		isIabMode: snapshot.model === 'iab',
		snapshot,
		tools,
		vendorDenied: tools.deniedVendors(snapshot),
	};
};

const vendorAllowed = function vendorAllowed(
	entry: NormalizedScript,
	pass: ReconcilePass
): boolean {
	return (
		entry.vendor === null ||
		pass.isIabMode ||
		pass.vendorDenied === null ||
		!pass.vendorDenied.has(entry.vendor)
	);
};

export const hasScriptConsent = function hasScriptConsent(
	entry: NormalizedScript,
	pass: ReconcilePass
): boolean {
	const { script } = entry;

	if (entry.hasIabMeta) {
		return pass.tools.evaluate(script, pass.snapshot);
	}

	if (entry.simpleCategory) {
		if (!(entry.simpleCategory in pass.consents)) {
			throw new Error(
				`Consent category "${entry.simpleCategory}" not found in consent state`
			);
		}
		return (
			(pass.consents[entry.simpleCategory] || false) &&
			vendorAllowed(entry, pass)
		);
	}

	return (
		pass.tools.has(script.category, pass.consents) && vendorAllowed(entry, pass)
	);
};

export const isEligible = function isEligible(
	entry: NormalizedScript,
	pass: ReconcilePass
): boolean {
	const { script } = entry;
	if (script.alwaysLoad) {
		return true;
	}

	return hasScriptConsent(entry, pass);
};
