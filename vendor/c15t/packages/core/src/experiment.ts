import { createExperimentControllerWith } from './libs/experiment-assignment';
import type {
	ExperimentController,
	ExperimentControllerOptions,
} from './libs/experiment-assignment';
import { writeStoredExperimentArm } from './libs/experiment-storage';

export {
	collectExperimentDiagnostics,
	validateExperiment,
} from './libs/experiment-engine';
export type {
	ExperimentDiagnostics,
	ValidateExperimentOptions,
} from './libs/experiment-engine';
export const createExperimentController = function createExperimentController(
	options: ExperimentControllerOptions
): ExperimentController {
	return createExperimentControllerWith(options, writeStoredExperimentArm);
};
export type {
	ExperimentController,
	ExperimentControllerOptions,
} from './libs/experiment-assignment';
export {
	readStoredExperimentArm,
	writeStoredExperimentArm,
} from './libs/experiment-storage';
export type { StoredExperimentArm } from './libs/experiment-storage';
export { experimentConfigError, pickExperimentArm } from './libs/experiment';
