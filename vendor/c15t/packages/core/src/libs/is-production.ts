declare const process: { env: { NODE_ENV?: string } };

export const isProductionBuild = function isProductionBuild(): boolean {
	try {
		return process.env.NODE_ENV === 'production';
	} catch {
		return false;
	}
};
