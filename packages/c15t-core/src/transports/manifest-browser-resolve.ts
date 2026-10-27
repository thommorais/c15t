import {
	POLICY_CONTRACT_VERSION,
	resolveInitFromManifest,
} from '@c15t/schema/types';
import type {
	ConsentManifest,
	InitOutput,
	ResolveInitFromManifestInputs,
} from '@c15t/schema/types';
import { enTranslations } from '@c15t/translations';
import type { BaseTranslations, Translations } from '@c15t/translations';

import { mapInitOutputToInitResponse } from './init-output';
import type { TransportInitResponse } from './init-output';
import { locationFreeOutcome } from './manifest-browser-location';

export type OtherLanguage = Exclude<keyof BaseTranslations, 'en'>;

const otherLanguages = new Set<string>(
	'ar bg bn cs cy da de el es et fi fr ga gu he hi hr ht hu id is it ja kn ko lb lt lv ml mr ms mt nb nl nn pa pl pt rm ro ru sk sl sv ta te th tr ur vi yi zh'.split(
		' '
	)
);

const isOtherLanguage = (language: string): language is OtherLanguage =>
	otherLanguages.has(language);

const loadedLanguages = new Map<string, Translations>([['en', enTranslations]]);

const loadLanguage = async function loadLanguage(
	language: OtherLanguage
): Promise<Translations | undefined> {
	try {
		const { loadLanguageCopy } = await import('./manifest-browser-languages');
		const copy = await loadLanguageCopy(language);
		if (copy) {
			loadedLanguages.set(language, copy);
		}
		return copy;
	} catch {
		return undefined;
	}
};

const selectableBaseTranslations = function selectableBaseTranslations(
	withPlaceholders: boolean
): BaseTranslations {
	const base: Record<string, Translations> = {};
	if (withPlaceholders) {
		for (const language of otherLanguages) {
			base[language] = enTranslations;
		}
	}
	for (const [language, copy] of loadedLanguages) {
		base[language] = copy;
	}
	return base as unknown as BaseTranslations;
};

const resolveWithLanguage = async function resolveWithLanguage(
	manifest: ConsentManifest,
	inputs: ResolveInitFromManifestInputs
): Promise<InitOutput> {
	const output = resolveInitFromManifest(manifest, inputs, {
		baseTranslations: selectableBaseTranslations(true),
	});
	const { language } = output.translations;
	if (!isOtherLanguage(language) || loadedLanguages.has(language)) {
		return output;
	}
	const copy = await loadLanguage(language);
	return resolveInitFromManifest(manifest, inputs, {
		baseTranslations: selectableBaseTranslations(copy !== undefined),
	});
};

export const resolveLocally = async function resolveLocally(
	manifest: ConsentManifest,
	inputs: ResolveInitFromManifestInputs,
	fetchImpl: typeof globalThis.fetch
): Promise<TransportInitResponse> {
	const output = await resolveWithLanguage(manifest, inputs);
	if (manifest.iab?.enabled === true) {
		const { attachVendorList } = await import('./manifest-browser-iab');
		await attachVendorList(output, manifest, fetchImpl);
	}
	return mapInitOutputToInitResponse(
		output,
		inputs.gpc === undefined ? {} : { 'sec-gpc': inputs.gpc ? '1' : '0' },
		{ producerContract: POLICY_CONTRACT_VERSION }
	);
};

export const isLocationFree = (manifest: ConsentManifest): boolean =>
	locationFreeOutcome(manifest) !== null;
