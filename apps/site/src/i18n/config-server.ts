import type { DictionaryLoaders, ExplicitDictionaries, LooseI18n } from '_/i18n/dictionaries/types'
import { createI18nServer } from 'next-international/server'
import { dictionariesLoaders } from './dictionaries/helpers'

const i18nServer = createI18nServer<DictionaryLoaders, ExplicitDictionaries>(dictionariesLoaders, {})

const getI18n = i18nServer.getI18n as unknown as LooseI18n

export const { getCurrentLocale, getStaticParams } = i18nServer
export { getI18n }
