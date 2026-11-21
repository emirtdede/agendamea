# 73-Language Localization Architecture (`v1.0.0`)

Agendamea ships with **73 supported languages** and zero runtime dependency on external translation APIs.

## Architecture (`src/i18n/`)

| File | Responsibility |
| :--- | :--- |
| `languages.ts` | Canonical list of 73 `LanguageMeta` entries (`code`, `nativeName`, `englishName`, `intlLocale`, `dir`) and OS/browser BCP-47 matcher `resolveSystemLanguage()` |
| `translations.ts` | Full TypeScript `UiDictionary` interface, native Turkish (`tr`) and English (`en`) dictionaries, localized legal documents, and `localizeErrorMessage()` |
| `localeBuilder.ts` | Deterministic dictionary builder expanding compact localized seeds into complete `UiDictionary` objects for all non-TR/EN locales |
| `localeExtensions.ts` | Extended feature strings (Kanban, Calendar, Eisenhower Matrix, `#tags`, time picker, OneDrive sync & recovery) across all 73 locales |
| `localesEurope.ts`, `localesAsiaAfrica.ts`, `localesWorld.ts` | Regional locale seed bundles |
| `I18nContext.tsx` | React provider syncing `<html lang="..." dir="...">` and formatting localized dates |

## Right-to-Left (RTL) Support

Four locales automatically set `document.documentElement.dir = 'rtl'`:
- Arabic (`ar`)
- Persian (`fa`)
- Hebrew (`he`)
- Urdu (`ur`)

## First-Launch Locale Detection

On first launch, `resolveSystemLanguage(navigator.languages)` matches exact BCP-47 tags (`pt-BR`, `zh-TW`, `zh-CN`), legacy aliases (`nb`/`nn` -> `no`, `fil` -> `tl`, `iw` -> `he`, `in` -> `id`), and base language prefixes. Unrecognized OS locales fall back safely to English (`en`).

## Automated Quality Checks

`npm test` (`src/utils/todoLogic.test.ts`) verifies on every CI run:
1. All 73 `LanguageCode` values resolve to complete, non-empty `UiDictionary` objects.
2. Zero Turkish or English string leakage in localized UI keys across all 73 languages.
3. Zero forbidden em-dash (`U+2014`) or en-dash (`U+2013`) characters across source files, docs, scripts, and manifests.
