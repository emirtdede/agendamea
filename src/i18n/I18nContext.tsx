import type React from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { resolveCategoryColorName, resolveThemeColorName } from './core/errorLocalizer';
import type { LegalDocId, LegalDocumentContent, UiDictionary } from './core/types';
import {
  getLanguageMeta,
  isValidLanguageCode,
  type LanguageCode,
  type LanguageMeta,
  resolveSystemLanguage,
  SUPPORTED_LANGUAGES,
} from './languages';
import { EMPTY_LOCALE_BUNDLE, useResolvedLocaleBundle } from './localeLoader';

interface I18nContextValue {
  lang: LanguageCode;
  pendingLanguage: LanguageCode | null;
  meta: LanguageMeta;
  t: UiDictionary;
  languages: readonly LanguageMeta[];
  onChangeLanguage: (code: LanguageCode) => void;
  onRestartApp?: () => Promise<void> | void;
  getThemeDisplayName: (themeId: string, fallbackName: string) => string;
  getCategoryColorDisplayName: (hex: string, fallbackName: string) => string;
  legalDocs: Record<LegalDocId, LegalDocumentContent>;
}

const DEFAULT_META = getLanguageMeta('tr');

const I18nContext = createContext<I18nContextValue>({
  lang: 'tr',
  pendingLanguage: null,
  meta: DEFAULT_META,
  t: EMPTY_LOCALE_BUNDLE.dict,
  languages: SUPPORTED_LANGUAGES,
  onChangeLanguage: () => {
    /* noop */
  },
  getThemeDisplayName: (_themeId, fallback) => fallback,
  getCategoryColorDisplayName: (_hex, fallback) => fallback,
  legalDocs: EMPTY_LOCALE_BUNDLE.legal,
});

declare global {
  interface Window {
    __AGENDAMEA_INITIAL_LANG__?: string;
  }
}

export function readInitialLanguage(): {
  code: LanguageCode;
  hasStoredPreference: boolean;
  fromServerBoot: boolean;
} {
  if (typeof window !== 'undefined') {
    const serverBootLang = window.__AGENDAMEA_INITIAL_LANG__;
    if (typeof serverBootLang === 'string' && isValidLanguageCode(serverBootLang)) {
      return { code: serverBootLang, hasStoredPreference: true, fromServerBoot: true };
    }
  }
  try {
    const saved = localStorage.getItem('agendamea-language');
    if (saved && isValidLanguageCode(saved)) {
      return { code: saved, hasStoredPreference: true, fromServerBoot: false };
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
        fromServerBoot: false,
      };
    }
  }
  return { code: 'tr', hasStoredPreference: false, fromServerBoot: false };
}

export function I18nProvider({
  lang,
  pendingLanguage = null,
  onChangeLanguage,
  onRestartApp,
  children,
}: {
  lang: LanguageCode;
  pendingLanguage?: LanguageCode | null;
  onChangeLanguage: (code: LanguageCode) => void;
  onRestartApp?: () => Promise<void> | void;
  children: React.ReactNode;
}) {
  const meta = useMemo(() => getLanguageMeta(lang), [lang]);
  const { dict, legalDocs } = useResolvedLocaleBundle(lang);

  useEffect(() => {
    const nextTitle = dict.appTitleSuffix ? `Agendamea - ${dict.appTitleSuffix}` : 'Agendamea';
    if (typeof document !== 'undefined') {
      document.documentElement.lang = meta.code;
      document.documentElement.dir = meta.dir;
      document.title = nextTitle;
    }
    try {
      if (!pendingLanguage) {
        localStorage.setItem('agendamea-language', meta.code);
      }
      if (dict.appTitleSuffix) {
        localStorage.setItem('agendamea-app-title', nextTitle);
      }
    } catch {
      // Ignore storage errors
    }
  }, [meta, dict.appTitleSuffix, pendingLanguage]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang: meta.code,
      pendingLanguage,
      meta,
      t: dict,
      languages: SUPPORTED_LANGUAGES,
      onChangeLanguage,
      onRestartApp,
      getThemeDisplayName: (themeId: string, fallbackName: string) =>
        resolveThemeColorName(themeId, fallbackName, dict),
      getCategoryColorDisplayName: (hex: string, fallbackName: string) =>
        resolveCategoryColorName(hex, fallbackName, dict),
      legalDocs,
    }),
    [meta, pendingLanguage, dict, onChangeLanguage, onRestartApp, legalDocs],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
