import { en, pt } from '_/i18n/dictionaries/locales'
import type { DictionaryLoaders, LocalesExtended } from '_/i18n/dictionaries/types'

const localesExtended: LocalesExtended = {
	[en]: {
		name: 'english',
		direction: 'ltr',
		file: `./${en}`,
	},
	[pt]: {
		name: 'português',
		direction: 'ltr',
		file: `./${pt}`,
	},
}

const dictionariesLoaders: DictionaryLoaders = {
	[en]: async () => import('./en').then(module => ({ default: module[en] })),
	[pt]: async () => import('./pt').then(module => ({ default: module[pt] })),
}

export { dictionariesLoaders, localesExtended }
