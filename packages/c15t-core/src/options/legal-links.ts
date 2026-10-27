import type { LegalLinksTranslations } from '@c15t/translations';

export interface LegalLink {
	href: string;

	target?: '_blank' | '_self';

	rel?: string;

	label?: string;
}

export type LegalLinks = Partial<
	Record<keyof LegalLinksTranslations, LegalLink>
>;
