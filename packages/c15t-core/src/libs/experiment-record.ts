import type { ExperimentAssignment } from './experiment';

export const isExperimentAssignment = function isExperimentAssignment(
	value: unknown
): value is ExperimentAssignment {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === 'string' &&
		typeof record.arm === 'string' &&
		(record.assignedBy === 'host' || record.assignedBy === 'c15t') &&
		typeof record.acknowledgedDiagnostics === 'boolean'
	);
};
