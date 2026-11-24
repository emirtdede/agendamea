# 73-Language Localization Architecture (`v1.1.0`)

Agendamea ships with **73 supported languages** across the desktop UI, CLI, local server errors, and native WPF installer, with zero runtime dependency on external translation APIs.

## Architecture (`src/i18n/`, `shared/cliLocales/`, `shared/serverLocales/`)

| File / Directory                                      | Responsibility                                                                                                                                                           |
| :---------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/languages.ts`                               | Canonical list of 73 `LanguageMeta` entries (`code`, `nativeName`, `englishName`, `intlLocale`, `dir`) and OS/browser BCP-47 matcher `resolveSystemLanguage()`           |
| `src/i18n/translations.ts`                            | Full TypeScript `UiDictionary` interface (821 keys), native Turkish (`tr`) and English (`en`) dictionaries, localized legal documents, and `localizeErrorMessage()`      |
| `src/i18n/localeLoader.ts`                            | Dynamic code-splitting loader keeping only `tr` and `en` in the initial `i18n-core` bundle (~122 kB / ~43 kB gzip) while lazy-loading the remaining 71 locales on demand |
| `src/i18n/locales/*.ts`                               | 71 standalone per-language async chunk modules (~18-23 kB gzip each)                                                                                                     |
| `src/i18n/localesWorld.ts`                            | Synchronous Node/test lookup registry across all 73 standalone locale modules                                                                                            |
| `src/i18n/I18nContext.tsx`                            | React provider syncing `<html lang="..." dir="...">`, loading dynamic locale chunks, and formatting localized dates                                                      |
| `shared/cliLocales/` & `shared/serverLocales/`        | 73-language CLI and backend message bundles                                                                                                                              |
| `installer/Agendamea.Setup/Localization/locales.json` | 73-language embedded localization bundle for the native .NET 10 WPF Setup & Uninstaller                                                                                  |

## Right-to-Left (RTL) Support

Four locales automatically set `document.documentElement.dir = 'rtl'`:

- Arabic (`ar`)
- Persian (`fa`)
- Hebrew (`he`)
- Urdu (`ur`)

## First-Launch Locale Detection

On first launch, `resolveSystemLanguage(navigator.languages)` matches exact BCP-47 tags (`pt-BR`, `zh-TW`, `zh-CN`), legacy aliases (`nb`/`nn` -> `no`, `fil` -> `tl`, `iw` -> `he`, `in` -> `id`), and base language prefixes. Unrecognized OS locales fall back safely to English (`en`).

## Automated Quality Checks

`npm test` (`tests/unit/i18nAndDashPolicy.test.ts` and `tests/i18n73.test.ts`) verifies on every CI run:

1. All 73 `LanguageCode` values resolve to complete, non-empty 821-key `UiDictionary` objects.
2. Zero Turkish or English string leakage in localized UI keys across all 73 languages.
3. Zero forbidden em-dash (`U+2014`) or en-dash (`U+2013`) characters across source files, docs, scripts, and manifests.
