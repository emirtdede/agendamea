## Summary

- What changed and why:
- Related issue / ticket:

## Architecture & Safety Checklist

- [ ] No new em-dash (`U+2014`) or en-dash (`U+2013`) characters added anywhere
- [ ] Zero hardcoded single-language UI strings in `src/components/**` or `src/overlay/**`
- [ ] All backend/shared errors route through `shared/logger.cjs` (Pino) with PII/secret redaction
- [ ] UI components do not import `src/db/**` or `server/**` directly
- [ ] Any new API/MCP payloads are validated through `shared/schemas/index.cjs`

## Verification

- [ ] `npm run check:biome` (0 errors, 0 warnings)
- [ ] `npm run lint` (TS strict + CJS `checkJs`)
- [ ] `npm run test:coverage` & `npm run test:ui:coverage`
- [ ] `npm run test:setup` (.NET 10 Release)
- [ ] `npm run build` & `npm run check:budget`
- [ ] `npm run test:e2e` (Electron Playwright smoke)
