import type React from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import {
  getLanguageMeta,
  isValidLanguageCode,
  type LanguageCode,
  type LanguageMeta,
  resolveSystemLanguage,
  SUPPORTED_LANGUAGES,
} from './languages';
import { useResolvedLocaleBundle } from './localeLoader';
import {
  type LegalDocId,
  type LegalDocumentContent,
  resolveCategoryColorName,
  resolveThemeColorName,
  TR_DICTIONARY,
  TR_LEGAL_DOCUMENTS,
  type UiDictionary,
} from './translations';

interface I18nContextValue {
  lang: LanguageCode;
  meta: LanguageMeta;
  t: UiDictionary;
  languages: readonly LanguageMeta[];
  onChangeLanguage: (code: LanguageCode) => void;
  getThemeDisplayName: (themeId: string, fallbackName: string) => string;
  getCategoryColorDisplayName: (hex: string, fallbackName: string) => string;
  legalDocs: Record<LegalDocId, LegalDocumentContent>;
}

const DEFAULT_META = getLanguageMeta('tr');

const I18nContext = createContext<I18nContextValue>({
  lang: 'tr',
  meta: DEFAULT_META,
  t: TR_DICTIONARY,
  languages: SUPPORTED_LANGUAGES,
  onChangeLanguage: () => {
    /* noop */
  },
  getThemeDisplayName: (themeId, fallback) =>
    resolveThemeColorName(themeId, fallback, TR_DICTIONARY),
  getCategoryColorDisplayName: (hex, fallback) =>
    resolveCategoryColorName(hex, fallback, TR_DICTIONARY),
  legalDocs: TR_LEGAL_DOCUMENTS,
});

export function readInitialLanguage(): {
  code: LanguageCode;
  hasStoredPreference: boolean;
} {
  try {
    const saved = localStorage.getItem('agendamea-language');
    if (saved && isValidLanguageCode(saved)) {
      return { code: saved, hasStoredPreference: true };
    }
  } catch {
    // Ignore storage read failure
  }
  if (typeof navigator !== 'undefined') {
    const navList =
      Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : typeof navigator.language === 'string' && navigator.language
          ? [navigator.language]
          : [];
    if (navList.length > 0) {
      return {
        code: resolveSystemLanguage(navList, 'en'),
        hasStoredPreference: false,
      };
    }
  }
  return { code: 'tr', hasStoredPreference: false };
}

export function I18nProvider({
  lang,
  onChangeLanguage,
  children,
}: {
  lang: LanguageCode;
  onChangeLanguage: (code: LanguageCode) => void;
  children: React.ReactNode;
}) {
  const meta = useMemo(() => getLanguageMeta(lang), [lang]);
  const { dict, legalDocs } = useResolvedLocaleBundle(lang);

  useEffect(() => {
    const nextTitle = `Agendamea - ${dict.appTitleSuffix}`;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = meta.code;
      document.documentElement.dir = meta.dir;
      document.title = nextTitle;
    }
    try {
      localStorage.setItem('agendamea-language', meta.code);
      localStorage.setItem('agendamea-app-title', nextTitle);
    } catch {
      // Ignore storage errors
    }
  }, [meta, dict.appTitleSuffix]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang: meta.code,
      meta,
      t: dict,
      languages: SUPPORTED_LANGUAGES,
      onChangeLanguage,
      getThemeDisplayName: (themeId: string, fallbackName: string) =>
        resolveThemeColorName(themeId, fallbackName, dict),
      getCategoryColorDisplayName: (hex: string, fallbackName: string) =>
        resolveCategoryColorName(hex, fallbackName, dict),
      legalDocs,
    }),
    [meta, dict, onChangeLanguage, legalDocs],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
