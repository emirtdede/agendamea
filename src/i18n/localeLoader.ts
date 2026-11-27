import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { LegalDocId, LegalDocumentContent, UiDictionary } from './core/types';
import type { LanguageCode } from './languages';

export interface LocaleBundle {
  readonly dict: UiDictionary;
  readonly legal: Record<LegalDocId, LegalDocumentContent>;
}

const EMPTY_DICT_FALLBACK = new Proxy({} as UiDictionary, {
  get(_target, prop) {
    return typeof prop === 'string' ? '' : undefined;
  },
});

const EMPTY_LEGAL_DOC: LegalDocumentContent = {
  id: 'privacy',
  title: '',
  subtitle: '',
  sections: [],
};

const EMPTY_LEGAL_FALLBACK: Record<LegalDocId, LegalDocumentContent> = {
  privacy: { ...EMPTY_LEGAL_DOC, id: 'privacy' },
  terms: { ...EMPTY_LEGAL_DOC, id: 'terms' },
  gdpr: { ...EMPTY_LEGAL_DOC, id: 'gdpr' },
  opensource: { ...EMPTY_LEGAL_DOC, id: 'opensource' },
  accessibility: { ...EMPTY_LEGAL_DOC, id: 'accessibility' },
};

export const EMPTY_LOCALE_BUNDLE: LocaleBundle = {
  dict: EMPTY_DICT_FALLBACK,
  legal: EMPTY_LEGAL_FALLBACK,
};

const LOCALE_IMPORTERS: Record<LanguageCode, () => Promise<LocaleBundle>> = {
  tr: () => import('./locales/tr'),
  en: () => import('./locales/en'),
  de: () => import('./locales/de'),
  fr: () => import('./locales/fr'),
  es: () => import('./locales/es'),
  it: () => import('./locales/it'),
  pt: () => import('./locales/pt'),
  'pt-BR': () => import('./locales/pt-BR'),
  ru: () => import('./locales/ru'),
  ja: () => import('./locales/ja'),
  ko: () => import('./locales/ko'),
  'zh-CN': () => import('./locales/zh-CN'),
  'zh-TW': () => import('./locales/zh-TW'),
  ar: () => import('./locales/ar'),
  hi: () => import('./locales/hi'),
  bn: () => import('./locales/bn'),
  pa: () => import('./locales/pa'),
  ur: () => import('./locales/ur'),
  fa: () => import('./locales/fa'),
  he: () => import('./locales/he'),
  nl: () => import('./locales/nl'),
  pl: () => import('./locales/pl'),
  uk: () => import('./locales/uk'),
  cs: () => import('./locales/cs'),
  sk: () => import('./locales/sk'),
  hu: () => import('./locales/hu'),
  ro: () => import('./locales/ro'),
  bg: () => import('./locales/bg'),
  el: () => import('./locales/el'),
  sv: () => import('./locales/sv'),
  da: () => import('./locales/da'),
  no: () => import('./locales/no'),
  fi: () => import('./locales/fi'),
  is: () => import('./locales/is'),
  et: () => import('./locales/et'),
  lv: () => import('./locales/lv'),
  lt: () => import('./locales/lt'),
  hr: () => import('./locales/hr'),
  sr: () => import('./locales/sr'),
  sl: () => import('./locales/sl'),
  bs: () => import('./locales/bs'),
  mk: () => import('./locales/mk'),
  sq: () => import('./locales/sq'),
  az: () => import('./locales/az'),
  kk: () => import('./locales/kk'),
  uz: () => import('./locales/uz'),
  ky: () => import('./locales/ky'),
  tk: () => import('./locales/tk'),
  ka: () => import('./locales/ka'),
  hy: () => import('./locales/hy'),
  id: () => import('./locales/id'),
  ms: () => import('./locales/ms'),
  vi: () => import('./locales/vi'),
  th: () => import('./locales/th'),
  tl: () => import('./locales/tl'),
  km: () => import('./locales/km'),
  lo: () => import('./locales/lo'),
  my: () => import('./locales/my'),
  ta: () => import('./locales/ta'),
  te: () => import('./locales/te'),
  mr: () => import('./locales/mr'),
  gu: () => import('./locales/gu'),
  kn: () => import('./locales/kn'),
  ml: () => import('./locales/ml'),
  si: () => import('./locales/si'),
  ne: () => import('./locales/ne'),
  sw: () => import('./locales/sw'),
  am: () => import('./locales/am'),
  af: () => import('./locales/af'),
  ca: () => import('./locales/ca'),
  eu: () => import('./locales/eu'),
  gl: () => import('./locales/gl'),
  cy: () => import('./locales/cy'),
};

const loadedBundles = new Map<LanguageCode, LocaleBundle>();
const inFlightLoads = new Map<LanguageCode, Promise<LocaleBundle>>();
const listeners = new Set<() => void>();
let lastLoadedLang: LanguageCode | null = null;
let storeVersion = 0;

function notifyLocaleLoaded(): void {
  storeVersion += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function seedLoadedLocaleBundle(lang: LanguageCode, bundle: LocaleBundle): void {
  loadedBundles.set(lang, bundle);
  lastLoadedLang = lang;
  notifyLocaleLoaded();
}

export function subscribeLocaleLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocaleStoreVersion(): number {
  return storeVersion;
}

export function isLocaleLoaded(lang: LanguageCode): boolean {
  return loadedBundles.has(lang);
}

export function getLoadedLocaleCodes(): LanguageCode[] {
  return Array.from(loadedBundles.keys());
}

export function getCachedLocaleBundle(lang: LanguageCode): LocaleBundle {
  return (
    loadedBundles.get(lang) ??
    (lastLoadedLang ? loadedBundles.get(lastLoadedLang) : undefined) ??
    loadedBundles.get('en') ??
    EMPTY_LOCALE_BUNDLE
  );
}

export function getCachedDictionary(lang: LanguageCode): UiDictionary {
  return getCachedLocaleBundle(lang).dict;
}

export function getCachedLegalDocuments(
  lang: LanguageCode,
): Record<LegalDocId, LegalDocumentContent> {
  return getCachedLocaleBundle(lang).legal;
}

export function loadLocaleBundle(lang: LanguageCode): Promise<LocaleBundle> {
  const existing = loadedBundles.get(lang);
  if (existing) {
    return Promise.resolve(existing);
  }
  const pending = inFlightLoads.get(lang);
  if (pending) {
    return pending;
  }
  const importer = LOCALE_IMPORTERS[lang] ?? LOCALE_IMPORTERS.en;
  const promise = importer()
    .then((mod) => {
      const bundle: LocaleBundle = { dict: mod.dict, legal: mod.legal };
      loadedBundles.set(lang, bundle);
      lastLoadedLang = lang;
      inFlightLoads.delete(lang);
      notifyLocaleLoaded();
      return bundle;
    })
    .catch(async () => {
      inFlightLoads.delete(lang);
      if (lang !== 'en') {
        const fallback = loadedBundles.get('en') ?? (await loadLocaleBundle('en'));
        return fallback;
      }
      return EMPTY_LOCALE_BUNDLE;
    });
  inFlightLoads.set(lang, promise);
  return promise;
}

export function useResolvedLocaleBundle(lang: LanguageCode): {
  dict: UiDictionary;
  legalDocs: Record<LegalDocId, LegalDocumentContent>;
  isLoading: boolean;
} {
  const version = useSyncExternalStore(
    subscribeLocaleLoaded,
    getLocaleStoreVersion,
    getLocaleStoreVersion,
  );

  useEffect(() => {
    if (!loadedBundles.has(lang)) {
      void loadLocaleBundle(lang);
    }
  }, [lang]);

  return useMemo(() => {
    void version;
    const loaded = loadedBundles.get(lang);
    const active = loaded ?? getCachedLocaleBundle(lang);
    return {
      dict: active.dict,
      legalDocs: active.legal,
      isLoading: !loaded,
    };
  }, [lang, version]);
}
