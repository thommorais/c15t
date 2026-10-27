import styles from './switch.module.css';

export type SwitchSize = 'medium' | 'small';

export interface SwitchVariantsProps {
	size?: SwitchSize;
}

export interface SwitchRootCSSVariables {
	'--switch-height': string;
	'--switch-width': string;
	'--switch-padding': string;
	'--switch-duration': string;
	'--switch-ease': string;
}

export interface SwitchThumbCSSVariables {
	'--switch-thumb-size': string;
	'--switch-thumb-size-disabled': string;
	'--switch-thumb-translate': string;
	'--switch-thumb-background-color': string;
	'--switch-thumb-background-color-disabled': string;
}

export interface SwitchTrackCSSVariables {
	'--switch-background-color': string;
	'--switch-background-color-hover': string;
	'--switch-background-color-checked': string;
	'--switch-background-color-disabled': string;
}

export type SwitchCSSVariables = SwitchRootCSSVariables &
	SwitchThumbCSSVariables &
	SwitchTrackCSSVariables;

export const switchVariants = ({
	size = 'medium',
}: SwitchVariantsProps = {}) => {
	const sizeMap: Record<SwitchSize, keyof typeof styles | undefined> = {
		medium: undefined,
		small: 'root-small',
	};

	const thumbSizeMap: Record<SwitchSize, keyof typeof styles | undefined> = {
		medium: undefined,
		small: 'thumb-small',
	};

	const trackSizeMap: Record<SwitchSize, keyof typeof styles | undefined> = {
		medium: undefined,
		small: 'track-small',
	};

	return {
		root: (options?: { class?: string; disabled?: boolean }) => {
			const classes = [styles.root];
			const sizeClass = sizeMap[size];
			if (sizeClass) {
				classes.push(styles[sizeClass]);
			}
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		thumb: (options?: { class?: string; disabled?: boolean }) => {
			const classes = [styles.thumb];
			const sizeClass = thumbSizeMap[size];
			if (sizeClass) {
				classes.push(styles[sizeClass]);
			}
			if (options?.disabled) {
				classes.push(styles['thumb-disabled']);
			}
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		track: (options?: { class?: string; disabled?: boolean }) => {
			const classes = [styles.track];
			const sizeClass = trackSizeMap[size];
			if (sizeClass) {
				classes.push(styles[sizeClass]);
			}
			if (options?.disabled) {
				classes.push(styles['track-disabled']);
			}
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
	};
};
