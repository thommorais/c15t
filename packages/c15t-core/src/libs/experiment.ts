import type { ConsentKernel, ConsentSnapshot } from '../types';
import type { StorageConfig } from './cookie';
import {
	readEarlyExperimentArm,
	readStoredExperimentArm,
	writeEarlyExperimentArm,
	writeStoredExperimentArm,
} from './experiment-storage';
import type { StoredExperimentArm } from './experiment-storage';
import type {
	ConsentPresentation,
	PreferencesPresentation,
	PresentationAction,
	PromptPresentation,
} from './policy-actions';

export interface ExperimentActionStyle {
	variant?: string;
	mode?: string;
}

export interface ExperimentArmTheme {
	colors?: object;
	dark?: object;
	typography?: object;
	spacing?: object;
	radius?: object;
	shadows?: object;
	motion?: object;
	consentActions?: Partial<
		Record<'default' | 'primary' | PresentationAction, ExperimentActionStyle>
	>;
	slots?: object;
}

export interface ExperimentArm extends ConsentPresentation {
	theme?: ExperimentArmTheme;
}

export const CONTROL_ARM = 'control';

export interface ConsentExperiment<Arm extends string = string> {
	id: string;
	arms: Readonly<Record<Arm, ExperimentArm>>;
	arm?: NoInfer<Arm> | typeof CONTROL_ARM;
	split?: Readonly<Partial<Record<NoInfer<Arm> | typeof CONTROL_ARM, number>>>;
	acknowledgeDiagnostics?: boolean;
}

export const defineExperiment = function defineExperiment<Arm extends string>(
	experiment: ConsentExperiment<Arm>
): ConsentExperiment<Arm> {
	return experiment;
};

export type ExperimentArmName<
	Experiment extends Pick<ConsentExperiment, 'arms'>,
> = typeof CONTROL_ARM | Extract<keyof Experiment['arms'], string>;

export const experimentArmNames = function experimentArmNames(
	experiment: ConsentExperiment
): string[] {
	return [
		CONTROL_ARM,
		...Object.keys(experiment.arms).filter((name) => name !== CONTROL_ARM),
	];
};

export const isExperimentArm = function isExperimentArm(
	experiment: ConsentExperiment,
	name: string
): boolean {
	return name === CONTROL_ARM || Object.hasOwn(experiment.arms, name);
};

const armChanges = function armChanges(
	experiment: ConsentExperiment,
	name: string
): ExperimentArm | undefined {
	return name !== CONTROL_ARM && Object.hasOwn(experiment.arms, name)
		? (experiment.arms as Record<string, ExperimentArm>)[name]
		: undefined;
};

export interface ExperimentAssignment {
	id: string;
	arm: string;
	assignedBy: 'host' | 'c15t';
	acknowledgedDiagnostics: boolean;
}

export type ServerExperiment = ConsentExperiment & { arm: string };

export interface ExperimentState {
	experiment?: ServerExperiment;
}

export const hostExperiment = function hostExperiment(
	configured: ConsentExperiment | undefined,
	state: ExperimentState | null | undefined
): ConsentExperiment | undefined {
	return state?.experiment ?? configured;
};

export const experimentArmRef = function experimentArmRef(
	experiment: ServerExperiment
): { id: string; arm: string } {
	return { arm: experiment.arm, id: experiment.id };
};

const mergeSurface = function mergeSurface<
	Surface extends PromptPresentation | PreferencesPresentation,
>(base: Surface | undefined, arm: Surface | undefined): Surface | undefined {
	if (!base) {
		return arm;
	}
	if (!arm) {
		return base;
	}
	const merged = { ...base } as Surface & PreferencesPresentation;
	for (const [key, value] of Object.entries(arm)) {
		if (value !== undefined) {
			(merged as Record<string, unknown>)[key] = value;
		}
	}
	const baseDefaults = (base as PreferencesPresentation).defaults;
	const armDefaults = (arm as PreferencesPresentation).defaults;
	if (baseDefaults && armDefaults) {
		merged.defaults = { ...baseDefaults, ...armDefaults };
	}
	return merged;
};

export const resolveExperimentPresentation =
	function resolveExperimentPresentation(
		base: ConsentPresentation | undefined,
		experiment: ConsentExperiment,
		assignment: Pick<ExperimentAssignment, 'arm'>
	): ConsentPresentation {
		const arm = armChanges(experiment, assignment.arm);
		if (!arm) {
			return base ?? {};
		}
		const merged: ConsentPresentation = {};
		const prompt = mergeSurface(base?.prompt, arm.prompt);
		if (prompt) {
			merged.prompt = prompt;
		}
		const preferences = mergeSurface(base?.preferences, arm.preferences);
		if (preferences) {
			merged.preferences = preferences;
		}
		return merged;
	};

export const applyExperimentAssignment = function applyExperimentAssignment(
	base: ConsentPresentation | undefined,
	experiment: ConsentExperiment | undefined,
	assignment: Pick<ExperimentAssignment, 'id' | 'arm'> | null | undefined
): ConsentPresentation | undefined {
	if (!experiment || !assignment || assignment.id !== experiment.id) {
		return base;
	}
	return resolveExperimentPresentation(base, experiment, assignment);
};

const isTokenGroup = function isTokenGroup(
	value: unknown
): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const resolveExperimentTheme = function resolveExperimentTheme<
	ThemeType extends object,
>(
	base: ThemeType | undefined,
	experiment: ConsentExperiment,
	assignment: Pick<ExperimentAssignment, 'arm'>
): ThemeType | undefined {
	const arm = armChanges(experiment, assignment.arm)?.theme;
	if (!arm) {
		return base;
	}
	if (!base) {
		return arm as ThemeType;
	}
	const baseGroups = base as Record<string, unknown>;
	const merged: Record<string, unknown> = { ...baseGroups };
	for (const [key, value] of Object.entries(arm)) {
		if (value === undefined) {
			continue;
		}
		const current = baseGroups[key];
		merged[key] =
			isTokenGroup(current) && isTokenGroup(value)
				? { ...current, ...value }
				: value;
	}
	return merged as ThemeType;
};

export const applyExperimentTheme = function applyExperimentTheme<
	ThemeType extends object,
>(
	base: ThemeType | undefined,
	experiment: ConsentExperiment | undefined,
	assignment: Pick<ExperimentAssignment, 'id' | 'arm'> | null | undefined
): ThemeType | undefined {
	if (!experiment || !assignment || assignment.id !== experiment.id) {
		return base;
	}
	return resolveExperimentTheme(base, experiment, assignment);
};

export type ActionAppearance = Partial<
	Record<PresentationAction, ExperimentActionStyle>
>;

export const actionAppearanceFromTheme = function actionAppearanceFromTheme(
	theme: Pick<ExperimentArmTheme, 'consentActions'> | undefined
): ActionAppearance | undefined {
	const styles = theme?.consentActions;
	if (
		!styles?.accept &&
		!styles?.reject &&
		!styles?.customize &&
		!styles?.dismiss
	) {
		return undefined;
	}
	return {
		accept: { ...styles.default, ...styles.accept },
		customize: { ...styles.default, ...styles.customize },
		dismiss: { ...styles.default, ...styles.dismiss },
		reject: { ...styles.default, ...styles.reject },
	};
};

export type ExperimentGate = (snapshot: ConsentSnapshot) => boolean;

export const experimentConfigError = function experimentConfigError(
	experiment: ConsentExperiment
): string | null {
	const label = `c15t experiment "${experiment.id}"`;
	if (Object.hasOwn(experiment.arms, CONTROL_ARM)) {
		return `${label}: \`control\` is your \`presentation\`; do not list it in \`arms\`.`;
	}
	if (
		experiment.arm !== undefined &&
		!isExperimentArm(experiment, experiment.arm)
	) {
		return `${label}: arm "${experiment.arm}" is not \`control\` or one of \`arms\`.`;
	}
	if (experiment.arm === undefined && experiment.split) {
		const unknown = Object.keys(experiment.split).filter(
			(name) => !isExperimentArm(experiment, name)
		);
		if (unknown.length > 0) {
			return `${label}: split names ${unknown.map((name) => `"${name}"`).join(', ')}, which ${unknown.length === 1 ? 'is not an arm' : 'are not arms'}.`;
		}
		const total = Object.values(experiment.split).reduce<number>(
			(sum, weight) => sum + Math.max(0, weight ?? 0),
			0
		);
		if (!(total > 0) || !Number.isFinite(total)) {
			return `${label}: split must give at least one arm a finite positive weight.`;
		}
	}
	return null;
};

export const experimentArmWeights = function experimentArmWeights(
	experiment: ConsentExperiment,
	names: readonly string[]
): number[] {
	const split = experiment.split as
		| Record<string, number | undefined>
		| undefined;
	return names.map((name) =>
		split ? Math.max(0, (Object.hasOwn(split, name) ? split[name] : 0) ?? 0) : 1
	);
};

export const pickExperimentArm = function pickExperimentArm(
	experiment: ConsentExperiment,
	stored: { id: string; arm: string } | null,
	random: number = Math.random()
): ExperimentAssignment {
	const assignment = (arm: string): ExperimentAssignment => ({
		acknowledgedDiagnostics: experiment.acknowledgeDiagnostics === true,
		arm,
		assignedBy: 'c15t',
		id: experiment.id,
	});
	if (stored?.id === experiment.id && isExperimentArm(experiment, stored.arm)) {
		return assignment(stored.arm);
	}
	const names = experimentArmNames(experiment);
	const weights = experimentArmWeights(experiment, names);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	let point = random * total;
	for (const [index, name] of names.entries()) {
		point -= weights[index] ?? 0;
		if (point < 0) {
			return assignment(name);
		}
	}
	return assignment(names.at(-1) ?? CONTROL_ARM);
};

const knownArm = function knownArm(
	experiment: ConsentExperiment
): StoredExperimentArm | null {
	const early = readEarlyExperimentArm();
	return early?.id === experiment.id && isExperimentArm(experiment, early.arm)
		? early
		: readStoredExperimentArm();
};

export const claimEarlyExperimentArm = function claimEarlyExperimentArm(
	experiment: ConsentExperiment
): StoredExperimentArm | undefined {
	if (typeof window === 'undefined' || experimentConfigError(experiment)) {
		return undefined;
	}
	const claimed = {
		arm:
			experiment.arm ?? pickExperimentArm(experiment, knownArm(experiment)).arm,
		id: experiment.id,
	};
	writeEarlyExperimentArm(claimed);
	return claimed;
};

export const seedExperiment = function seedExperiment(
	experiment: ConsentExperiment | undefined,
	prefetched?: ExperimentAssignment | null,
	rendered = false
): {
	initialExperiment?: ExperimentAssignment;
	initialExperimentPending?: true;
} {
	if (!experiment) {
		return {};
	}
	const configError = experimentConfigError(experiment);
	if (configError) {
		console.error(`${configError} No experiment runs.`);
		return {};
	}
	const acknowledgedDiagnostics = experiment.acknowledgeDiagnostics === true;
	let initialExperiment: ExperimentAssignment | undefined;
	if (
		prefetched?.id === experiment.id &&
		isExperimentArm(experiment, prefetched.arm)
	) {
		initialExperiment = { ...prefetched, acknowledgedDiagnostics };
	} else if (experiment.arm !== undefined) {
		initialExperiment = {
			acknowledgedDiagnostics,
			arm: experiment.arm,
			assignedBy: 'host',
			id: experiment.id,
		};
	}
	if (initialExperiment && rendered) {
		return { initialExperiment };
	}
	return initialExperiment
		? { initialExperiment, initialExperimentPending: true }
		: { initialExperimentPending: true };
};

export interface StartExperimentOptions {
	experiment: ConsentExperiment;
	kernel: ConsentKernel;
	presentation?: ConsentPresentation;
	theme?: ExperimentArmTheme;
	storageConfig?: StorageConfig;
}

export const startExperiment = function startExperiment(
	options: StartExperimentOptions
): () => void {
	const { experiment, kernel } = options;
	if (experimentConfigError(experiment)) {
		kernel.set.experiment(null);
		return () => undefined;
	}
	if (!kernel.getSnapshot().experiment && experiment.arm === undefined) {
		kernel.set.experiment(pickExperimentArm(experiment, knownArm(experiment)));
	}
	let detach: (() => void) | null = null;
	let stopped = false;
	const attach = async (): Promise<void> => {
		try {
			const { createExperimentControllerWith } =
				await import('./experiment-assignment');
			if (!stopped) {
				detach = createExperimentControllerWith(
					options,
					writeStoredExperimentArm
				).dispose;
			}
		} catch (failure) {
			console.error(
				`c15t experiment "${experiment.id}": the experiment module failed to load, so no experiment runs.`,
				failure
			);
			if (!stopped) {
				kernel.set.experiment(null);
			}
		}
	};
	void attach();
	return () => {
		stopped = true;
		detach?.();
	};
};
