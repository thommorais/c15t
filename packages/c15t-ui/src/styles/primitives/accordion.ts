import styles from './accordion.module.css';

export type AccordionVariant = 'default' | 'bordered';

export type AccordionSize = 'medium' | 'small';

export interface AccordionVariantsProps {
	variant?: AccordionVariant;
	size?: AccordionSize;
}

export interface AccordionLayoutCSSVariables {
	'--accordion-padding': string;
	'--accordion-radius': string;
	'--accordion-duration': string;
	'--accordion-ease': string;
	'--accordion-icon-size': string;
}

export interface AccordionColorCSSVariables {
	'--accordion-background-color': string;
	'--accordion-background-hover': string;
	'--accordion-border-color': string;
	'--accordion-text-color': string;
	'--accordion-icon-color': string;
	'--accordion-arrow-color': string;
	'--accordion-content-color': string;
	'--accordion-focus-ring': string;
}

export type AccordionRootCSSVariables = AccordionLayoutCSSVariables &
	AccordionColorCSSVariables;

export interface AccordionItemCSSVariables {
	'--accordion-background-color': string;
	'--accordion-border-color': string;
	'--accordion-radius': string;
}

export interface AccordionTriggerCSSVariables {
	'--accordion-text-color': string;
	'--accordion-focus-ring': string;
	'--accordion-radius': string;
	'--accordion-padding': string;
}

export interface AccordionIconCSSVariables {
	'--accordion-icon-size': string;
	'--accordion-icon-color': string;
}

export interface AccordionContentCSSVariables {
	'--accordion-duration': string;
	'--accordion-ease': string;
	'--accordion-content-color': string;
}

export type AccordionCSSVariables = AccordionRootCSSVariables;

export const accordionVariants = ({
	variant = 'default',
	size = 'medium',
}: AccordionVariantsProps = {}) => {
	const variantMap: Record<AccordionVariant, keyof typeof styles | undefined> =
		{
			bordered: 'root-bordered',
			default: undefined,
		};

	const sizeMap: Record<AccordionSize, keyof typeof styles | undefined> = {
		medium: undefined,
		small: 'root-small',
	};

	return {
		arrowClose: (options?: { class?: string }) => {
			const classes = [styles.arrowClose];
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		arrowOpen: (options?: { class?: string }) => {
			const classes = [styles.arrowOpen];
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		content: (options?: { class?: string }) => {
			const classes = [styles.content];
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		contentInner: (options?: { class?: string }) => {
			const classes = [styles.contentInner];
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		icon: (options?: { class?: string }) => {
			const classes = [styles.icon];
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		item: (options?: { class?: string }) => {
			const classes = [styles.item];
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		root: (options?: { class?: string }) => {
			const classes = [styles.root];
			const variantClass = variantMap[variant];
			if (variantClass) {
				classes.push(styles[variantClass]);
			}
			const sizeClass = sizeMap[size];
			if (sizeClass) {
				classes.push(styles[sizeClass]);
			}
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		trigger: (options?: { class?: string }) => {
			const classes = [styles.triggerInner];
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
	};
};
