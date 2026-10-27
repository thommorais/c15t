import { defaultTheme, generateThemeCSS } from '@c15t/ui/theme';

import type { Theme } from './types/theme';

export interface ConsentThemeProps {
	theme?: Theme;
	colorScheme?: 'light' | 'dark' | 'system' | null;
	nonce?: string;
}

export const ConsentTheme = ({
	theme,
	colorScheme,
	nonce,
}: ConsentThemeProps) => (
	<style
		id="c15t-theme"
		nonce={nonce}
		// oxlint-disable-next-line react/no-danger -- generateThemeCSS escapes `<`
		dangerouslySetInnerHTML={{
			__html: generateThemeCSS(theme ?? defaultTheme, colorScheme),
		}}
	/>
);
