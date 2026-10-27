import type { ResolvedPolicyRule } from '@c15t/schema/types';

import {
	actionAppearanceFromTheme,
	experimentConfigError,
	resolveExperimentPresentation,
	resolveExperimentTheme,
} from './experiment';
import type {
	ActionAppearance,
	ConsentExperiment,
	ExperimentArmTheme,
} from './experiment';
import { resolveConsentPresentation } from './policy-actions';
import type {
	ConsentPresentation,
	PresentationDiagnostic,
} from './policy-actions';

export type ExperimentDiagnostics = Record<string, PresentationDiagnostic[]>;

export interface ValidateExperimentOptions {
	presentation?: ConsentPresentation;
	theme?: ExperimentArmTheme;
	actionAppearance?: ActionAppearance;
}

export const collectExperimentDiagnostics =
	function collectExperimentDiagnostics(
		experiment: ConsentExperiment,
		policy: ResolvedPolicyRule,
		options: ValidateExperimentOptions = {}
	): ExperimentDiagnostics {
		const diagnostics: ExperimentDiagnostics = {};
		for (const name of Object.keys(experiment.arms)) {
			const presentation = resolveExperimentPresentation(
				options.presentation,
				experiment,
				{ arm: name }
			);
			const actionAppearance = (
				experiment.arms as Record<string, { theme?: unknown }>
			)[name]?.theme
				? actionAppearanceFromTheme(
						resolveExperimentTheme(options.theme, experiment, {
							arm: name,
						})
					)
				: (options.actionAppearance ??
					actionAppearanceFromTheme(options.theme));
			const found = (['prompt', 'preferences'] as const).flatMap(
				(surface) =>
					resolveConsentPresentation({
						actionAppearance,
						policy,
						presentation,
						surface,
					}).diagnostics
			);
			if (found.length > 0) {
				diagnostics[name] = found;
			}
		}
		return diagnostics;
	};

const label = function label(experiment: ConsentExperiment): string {
	return `c15t experiment "${experiment.id}"`;
};

export const describeRejectedArms = function describeRejectedArms(
	experiment: ConsentExperiment,
	policy: ResolvedPolicyRule,
	diagnostics: ExperimentDiagnostics
): string {
	const detail = Object.keys(diagnostics)
		.map(
			(name) =>
				`"${name}": ${(diagnostics[name] ?? [])
					.map((diagnostic) => `${diagnostic.code} (${diagnostic.message})`)
					.join('; ')}`
		)
		.join('\n');
	return `${label(experiment)}: these arms trip presentation diagnostics under policy "${policy.id}". Fix them or set acknowledgeDiagnostics: true.\n${detail}`;
};

export const validateExperiment = function validateExperiment(
	experiment: ConsentExperiment,
	policy: ResolvedPolicyRule,
	options: ValidateExperimentOptions = {}
): ExperimentDiagnostics {
	const configError = experimentConfigError(experiment);
	if (configError) {
		throw new Error(configError);
	}
	const diagnostics = collectExperimentDiagnostics(experiment, policy, options);
	if (
		Object.keys(diagnostics).length > 0 &&
		experiment.acknowledgeDiagnostics !== true
	) {
		throw new Error(describeRejectedArms(experiment, policy, diagnostics));
	}
	return diagnostics;
};
