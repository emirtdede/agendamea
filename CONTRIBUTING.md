# Contributing to Agendamea

## Prerequisites

- Node.js 22+ (LTS)
- .NET 10 SDK (for Windows WPF Setup & Uninstaller tests)

## Engineering Standards

1. **Formatting & Linting:** Run `npm run check:biome` (Biome 2.x enforces formatting, import boundaries, React 19 hook rules, and no empty catch blocks).
2. **Type Safety:** Run `npm run lint` (`tsc --noEmit` with `strict: true` + `noUncheckedIndexedAccess: true`, plus `tsc -p tsconfig.cjs.json --noEmit`).
3. **Typography Rule:** Never use em-dash (`U+2014`) or en-dash (`U+2013`) in source files, localization strings, or documentation. Use standard ASCII hyphen `-`.
4. **Localization Rule:** Zero hardcoded Turkish UI strings inside `src/components/` or `src/overlay/`. All user-visible labels belong in `src/i18n/`.
5. **Architectural Boundaries:** UI components under `src/components/` must never import `src/db/` or `server/` directly; use `src/api/client.ts` or `src/store/`.

## Pre-PR Verification Checklist

```bash
npm run check:biome
npm run lint
npm test
npm run test:ui
npm run test:setup
npm run check:licenses
npm run build
npm run check:budget
```
