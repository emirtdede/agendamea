import type { LanguageCode } from './languages';
import {
  compileSeedToDictionary,
  compileSeedToLegalDocuments,
  type CompactLocaleSeed,
} from './localeBuilder';
import { ASIA_AFRICA_SEEDS } from './localesAsiaAfrica';
import { EUROPE_SEEDS } from './localesEurope';
import {
  EN_DICTIONARY,
  EN_LEGAL_DOCUMENTS,
  TR_DICTIONARY,
  TR_LEGAL_DOCUMENTS,
  type LegalDocId,
  type LegalDocumentContent,
  type UiDictionary,
} from './translations';

const ALL_WORLD_SEEDS: Record<Exclude<LanguageCode, 'tr' | 'en'>, CompactLocaleSeed> = {
  ...EUROPE_SEEDS,
  ...ASIA_AFRICA_SEEDS,
};

const DICTIONARY_CACHE = new Map<LanguageCode, UiDictionary>();
const LEGAL_CACHE = new Map<LanguageCode, Record<LegalDocId, LegalDocumentContent>>();

export function getDictionary(lang: LanguageCode): UiDictionary {
  if (lang === 'tr') return TR_DICTIONARY;
  if (lang === 'en') return EN_DICTIONARY;
  const cached = DICTIONARY_CACHE.get(lang);
  if (cached) return cached;
  const seed = ALL_WORLD_SEEDS[lang];
  const compiled = compileSeedToDictionary(seed, lang);
  DICTIONARY_CACHE.set(lang, compiled);
  return compiled;
}

export function getLegalDocumentsForLanguage(
  lang: LanguageCode,
  dict: UiDictionary = getDictionary(lang),
): Record<LegalDocId, LegalDocumentContent> {
  if (lang === 'tr') return TR_LEGAL_DOCUMENTS;
  if (lang === 'en') return EN_LEGAL_DOCUMENTS;
  const cached = LEGAL_CACHE.get(lang);
  if (cached) return cached;
  const seed = ALL_WORLD_SEEDS[lang];
  const compiled = compileSeedToLegalDocuments(seed, dict);
  LEGAL_CACHE.set(lang, compiled);
  return compiled;
}

export const getLegalDocuments = getLegalDocumentsForLanguage;

