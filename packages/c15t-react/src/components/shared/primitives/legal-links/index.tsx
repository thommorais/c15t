import type { LegalLinks as LegalLinksType } from '@c15t/core';
import styles from '@c15t/ui/styles/components/legal-links';
import { resolveTranslations } from '@c15t/ui/utils';
import { useContext, useMemo, useSyncExternalStore } from 'react';

import { KernelContext } from '~/context';
import { useServerSnapshot } from '~/kernel-selector';
import { useUIConfig, V3UIConfigContext } from '~/ui-config-context';
import { defaultTranslationConfig } from '~/utils/default-translation-config';
import { mergeSlotProps } from '~/utils/merge-slot-props';

const noopSubscribe = () => () => undefined;

const useLegalLinksConfig = function useLegalLinksConfig():
	| LegalLinksType
	| undefined {
	const v3Config = useContext(V3UIConfigContext);
	return v3Config.legalLinks;
};

const useLegalLinkTranslations = function useLegalLinkTranslations():
	| Record<string, string>
	| undefined {
	const kernel = useContext(KernelContext);
	const serverSnapshot = useServerSnapshot(kernel);
	const kernelTranslations = useSyncExternalStore(
		kernel ? (listener) => kernel.subscribe(listener) : noopSubscribe,
		() => kernel?.getSnapshot().translations ?? null,
		() => serverSnapshot()?.translations ?? null
	);

	return useMemo(() => {
		if (kernelTranslations?.translations) {
			const translations = kernelTranslations.translations as Partial<
				NonNullable<typeof defaultTranslationConfig.translations.en>
			>;
			return translations.legalLinks;
		}

		return resolveTranslations({}, defaultTranslationConfig).legalLinks;
	}, [kernelTranslations]);
};

export const useFilteredLegalLinks = function useFilteredLegalLinks(
	links?: (keyof LegalLinksType)[] | null
): LegalLinksType | null {
	const legalLinks = useLegalLinksConfig();

	if (links === undefined || links === null) {
		return null;
	}

	const entries = Object.entries(legalLinks ?? {});
	const filtered = entries.filter(([key]) =>
		links.includes(key as keyof LegalLinksType)
	);
	return Object.fromEntries(filtered) as LegalLinksType;
};

export interface InlineLegalLinksProps {
	links?: (keyof LegalLinksType)[] | null;

	context: LegalLinksContext;

	testIdPrefix?: string;
}

export const InlineLegalLinks = ({
	links,
	context,
	testIdPrefix,
}: InlineLegalLinksProps) => {
	const filteredLinks = useFilteredLegalLinks(links);
	const t = useLegalLinkTranslations();
	const { components } = useUIConfig();
	const rootStyles = mergeSlotProps(components?.['legal-links']?.root, {});
	const linkStyles = mergeSlotProps(components?.link?.[context], {
		baseClassName: styles.legalLink,
	});

	if (!filteredLinks || Object.keys(filteredLinks).length === 0) {
		return null;
	}

	return (
		<span {...rootStyles}>
			{' '}
			{(
				Object.entries(filteredLinks) as [
					keyof LegalLinksType,
					LegalLinksType[keyof LegalLinksType],
				][]
			).map(([type, link], index, array) => {
				if (!link) {
					return null;
				}
				return (
					<span key={String(type)}>
						<a
							href={link.href}
							target={link.target || '_blank'}
							rel={
								link.rel ||
								(link.target === '_blank' ? 'noopener noreferrer' : undefined)
							}
							{...linkStyles}
							data-testid={testIdPrefix ? `${testIdPrefix}-${type}` : undefined}
						>
							{link.label ?? (t as Record<string, string>)?.[type as string]}
							{index < array.length - 1 && ','}
						</a>
						{index < array.length - 1 && ' '}
					</span>
				);
			})}
		</span>
	);
};

type LegalLinksContext = 'banner' | 'dialog' | 'manager';
