import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'neutral';

export type ButtonMode = 'filled' | 'stroke' | 'lighter' | 'ghost';

export type ButtonSize = 'medium' | 'small' | 'xsmall' | 'xxsmall';

export interface ButtonVariantsProps {
	variant?: ButtonVariant;
	mode?: ButtonMode;
	size?: ButtonSize;
}

export const buttonVariants = ({
	variant = 'primary',
	mode = 'filled',
	size = 'medium',
}: ButtonVariantsProps = {}) => {
	const rootClasses = [styles.button, styles[`button-${size}`]];

	const compoundMap: Record<
		`${ButtonVariant}-${ButtonMode}`,
		keyof typeof styles
	> = {
		'neutral-filled': 'button-neutral-filled',
		'neutral-ghost': 'button-neutral-ghost',
		'neutral-lighter': 'button-neutral-lighter',
		'neutral-stroke': 'button-neutral-stroke',
		'primary-filled': 'button-primary-filled',
		'primary-ghost': 'button-primary-ghost',
		'primary-lighter': 'button-primary-lighter',
		'primary-stroke': 'button-primary-stroke',
	};

	rootClasses.push(styles[compoundMap[`${variant}-${mode}`]]);

	const iconClasses = [styles['button-icon']];

	return {
		icon: (options?: { class?: string }) =>
			[...iconClasses, options?.class].filter(Boolean).join(' '),
		root: (options?: { class?: string }) =>
			[...rootClasses, options?.class].filter(Boolean).join(' '),
	};
};
