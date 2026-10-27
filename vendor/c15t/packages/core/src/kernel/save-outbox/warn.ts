import { isProductionBuild } from '../../libs/is-production';

export const warnInDevelopment = function warnInDevelopment(
	message: string,
	error?: unknown
): void {
	if (isProductionBuild()) {
		return;
	}
	if (error === undefined) {
		console.warn(message);
	} else {
		console.warn(message, error);
	}
};
