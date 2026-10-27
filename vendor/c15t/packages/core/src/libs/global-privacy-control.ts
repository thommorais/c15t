export const hasGlobalPrivacyControlSignal =
	function hasGlobalPrivacyControlSignal(): boolean {
		if (typeof window === 'undefined') {
			return false;
		}

		try {
			const navigatorWithGPC = window.navigator as Navigator & {
				globalPrivacyControl?: unknown;
			};

			const value = navigatorWithGPC.globalPrivacyControl;

			return value === true;
		} catch {
			return false;
		}
	};
