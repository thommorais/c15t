// oxlint-disable-next-line oxc/no-barrel-file -- The subpath's public interface; each module stays separately placeable.
export { saveConsentBlanket } from './blanket';
export {
	EARLY_CONSENT_TAP_SCRIPT,
	EARLY_TAP_OPT_OUT,
} from './early-tap-script';
export { replayEarlyConsentTaps } from './early-taps';
export type { ConsentSurfaceIAB } from './blanket';
export { saveIABConsentSurface } from './iab-save';
export {
	hasConsentPreferences,
	hasConsentUI,
	showConsentSurface,
} from './rules';
export { saveConsentSurface } from './save';
