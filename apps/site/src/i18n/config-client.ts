'use client'
import { createI18nClient } from 'next-international/client'
import { dictionariesLoaders } from './dictionaries/helpers'
import type { DictionaryLoaders, ExplicitDictionaries, Locale, LooseI18n } from './dictionaries/types'

const i18nClient = createI18nClient<DictionaryLoaders, ExplicitDictionaries>(dictionariesLoaders)
const I18nProviderClient = i18nClient.I18nProviderClient

const useI18n = i18nClient.useI18n as unknown as LooseI18n
type ChangeLocale = () => (locale: Locale) => void
const useChangeLocale = i18nClient.useChangeLocale as unknown as ChangeLocale
const useCurrentLocale = i18nClient.useCurrentLocale

export { useI18n, I18nProviderClient, useChangeLocale, useCurrentLocale }
