# 73-Language Localization Architecture (`v1.1.0`)

Agendamea ships with **73 supported languages** across the desktop UI, CLI, local server errors, and native WPF installer, with zero runtime dependency on external translation APIs and **single-locale fast boot**.

## Architecture (`src/i18n/`, `shared/cliLocales/`, `shared/serverLocales/`)

| File / Directory                                      | Responsibility                                                                                                                                                 |
| :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/languages.ts`                               | Canonical list of 73 `LanguageMeta` entries (`code`, `nativeName`, `englishName`, `intlLocale`, `dir`) and OS/browser BCP-47 matcher `resolveSystemLanguage()` |
| `src/i18n/core/types.ts`                              | Canonical TypeScript `UiDictionary` interface (**1,112 localized UI keys**), `LegalDocId`, and `LegalDocuments` types                                          |
| `src/i18n/core/enDictionary.ts` & `trDictionary.ts`   | Reference English (`en`) and Turkish (`tr`) dictionaries paired with `enLegalDocs.ts` and `trLegalDocs.ts`                                                     |
| `src/i18n/localeLoader.ts`                            | Single-locale dynamic code-splitting loader fetching only the active language chunk at boot (including separate `en.ts` / `tr.ts` chunks)                      |
| `src/i18n/locales/*.ts`                               | 73 standalone per-language async chunk modules (`en`, `tr`, plus 71 world languages)                                                                           |
| `src/i18n/localesWorld.ts`                            | Synchronous Node/test lookup registry across all 73 standalone locale modules                                                                                  |
| `src/i18n/I18nContext.tsx`                            | React provider syncing `<html lang="..." dir="...">`, loading single-locale chunk, formatting localized dates, and coordinating the **Language Restart Modal** |
| `shared/cliLocales/` & `shared/serverLocales/`        | 73-language CLI and backend message bundles                                                                                                                    |
| `installer/Agendamea.Setup/Localization/locales.json` | 73-language embedded localization bundle for the native .NET 10 WPF Setup & Uninstaller                                                                        |

## Right-to-Left (RTL) Support

Four locales automatically set `document.documentElement.dir = 'rtl'`:

- Arabic (`ar`)
- Persian (`fa`)
- Hebrew (`he`)
- Urdu (`ur`)

## First-Launch Locale Detection & Switching

- On first launch, `resolveSystemLanguage(navigator.languages)` matches exact BCP-47 tags (`pt-BR`, `zh-TW`, `zh-CN`), legacy aliases (`nb`/`nn` -> `no`, `fil` -> `tl`, `iw` -> `he`, `in` -> `id`), and base language prefixes. Unrecognized OS locales fall back safely to English (`en`).
- Changing the display language in Settings persists the new language immediately and opens the **Language Restart Modal** (`LanguageRestartModal.tsx`) so the app relaunches cleanly with only the newly selected single locale in memory.

## Automated Quality Checks

`npm test` (`tests/unit/i18nAndDashPolicy.test.ts`, `tests/unit/singleLocaleStartup.test.ts`, and `tests/i18n73.test.ts`) verifies on every CI run:

1. All 73 `LanguageCode` values resolve to complete, non-empty **1,112-key** `UiDictionary` objects.
2. Zero Turkish or English string leakage in localized UI keys across all 73 languages.
3. Zero forbidden em-dash (`U+2014`) or en-dash (`U+2013`) characters across source files, docs, scripts, and manifests.
4. Initial production boot bundle loads strictly the single active locale chunk with zero eager multi-locale bloat.
