import type { ConsentSnapshot } from '../types';
import type {
	ExperimentAssignment,
	ExperimentGate,
	StartExperimentOptions,
} from './experiment';
import {
	collectExperimentDiagnostics,
	describeRejectedArms,
} from './experiment-engine';
import type { ExperimentDiagnostics } from './experiment-engine';
import type { writeStoredExperimentArm } from './experiment-storage';

export interface ExperimentControllerOptions extends StartExperimentOptions {
	report?: {
		warn?: (message: string, diagnostics: ExperimentDiagnostics) => void;
		error?: (error: Error) => void;
	};
}

export interface ExperimentController {
	assignment: ExperimentAssignment | null;
	dispose: () => void;
}

const policyKey = function policyKey(snapshot: ConsentSnapshot): string {
	return `${snapshot.policyRule.id}\n${snapshot.evaluationPolicy.choice.fingerprint}`;
};

declare const process: { env: { NODE_ENV?: string } };

const isProduction = function isProduction(): boolean {
	try {
		return process.env.NODE_ENV === 'production';
	} catch {
		return false;
	}
};

const asksAboutNoCategory = function asksAboutNoCategory(
	snapshot: ConsentSnapshot
): boolean {
	const policy = snapshot.evaluationPolicy;
	return (policy.choiceScope ?? policy.scope).length === 0;
};

const warnWhenNothingToChoose = function warnWhenNothingToChoose(
	options: ExperimentControllerOptions
): () => void {
	if (isProduction()) {
		return () => undefined;
	}
	const { experiment, kernel } = options;
	const unsubscribe = kernel.events.on('surface:shown', (event) => {
		if (
			event.surface !== 'banner' ||
			!event.experiment ||
			!asksAboutNoCategory(event.snapshot)
		) {
			return;
		}
		unsubscribe();
		console.warn(
			`c15t experiment "${experiment.id}": the banner showed arm "${event.experiment.arm}" under policy "${event.snapshot.policyRule.id}", which asks about no optional category. Accepting or rejecting there records a notice acknowledgement, not a choice, so onChoiceRecorded never fires and the experiment counts impressions only. List the categories your site uses in consentCategories, or pass the scripts that need them as scripts.`
		);
	});
	return unsubscribe;
};

export const createExperimentControllerWith =
	function createExperimentControllerWith(
		options: ExperimentControllerOptions,
		rememberArm: typeof writeStoredExperimentArm
	): ExperimentController {
		const { experiment, kernel } = options;
		const warn =
			options.report?.warn ??
			((message: string, diagnostics: ExperimentDiagnostics) => {
				console.warn(message, diagnostics);
			});
		const error =
			options.report?.error ??
			((failure: Error) => {
				console.error(failure);
			});

		const acceptedByPolicy = new Map<string, boolean>();
		const gate: ExperimentGate = (snapshot) => {
			const key = policyKey(snapshot);
			const known = acceptedByPolicy.get(key);
			if (known !== undefined) {
				return known;
			}
			const { policyRule } = snapshot;
			const diagnostics = collectExperimentDiagnostics(
				experiment,
				policyRule,
				options
			);
			let accepted = true;
			if (Object.keys(diagnostics).length > 0) {
				if (experiment.acknowledgeDiagnostics === true) {
					warn(
						`c15t experiment "${experiment.id}": running with acknowledged presentation diagnostics under policy "${policyRule.id}".`,
						diagnostics
					);
				} else {
					accepted = false;
					error(
						new Error(
							`${describeRejectedArms(experiment, policyRule, diagnostics)}\nVisitors under this policy see the base presentation and are not counted.`
						)
					);
				}
			}
			acceptedByPolicy.set(key, accepted);
			return accepted;
		};

		const assignment: ExperimentAssignment | null =
			kernel.getSnapshot().experiment;
		if (!assignment) {
			kernel.set.experiment(null);
			return { assignment: null, dispose: () => undefined };
		}

		let stored = false;
		const unsubscribe =
			assignment.assignedBy === 'c15t'
				? kernel.events.on('surface:shown', (event) => {
						if (stored || event.surface !== 'banner' || !event.experiment) {
							return;
						}
						stored = true;
						rememberArm(
							{ arm: event.experiment.arm, id: event.experiment.id },
							options.storageConfig
						);
					})
				: () => undefined;

		const stopWarning = warnWhenNothingToChoose(options);

		kernel.set.experiment(assignment, gate);

		return {
			assignment,
			dispose: () => {
				unsubscribe();
				stopWarning();
			},
		};
	};
