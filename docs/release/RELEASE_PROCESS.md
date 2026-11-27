# Release Process & Update Channels (`v1.1.0`)

## 1. Branch & Version Parity Checklist

Agendamea maintains two canonical branches: **`main`** (release-ready production) and **`development`** (active integration).

Before cutting a release tag (`vX.Y.Z`), confirm version parity across:
- `package.json` (`"version"`)
- `shared/version.cjs` (shared runtime version source for `server.ts`, `electron/main.cjs`, `cli/`, `mcp/`)
- `CHANGELOG.md`
- `README.md` (`Release-vX.Y.Z` badge and package filenames)
- `winget/manifests/v/Vellium/Agendamea/<version>/`

## 2. Automated Verification Gates

Run all local checks before tagging:

```bash
npm run clean          # Clean all previous build, installer, and generated asset outputs
npm run check:biome    # Biome lint & format check
npm run lint           # Strict TypeScript + CJS checkJs type-check
npm run check:licenses # Production dependency license compliance check
npm run test:coverage  # 118 Node unit, AI, App Lock, MCP, CLI, webhook, security & 73-language tests + coverage
npm run test:ui:coverage # 48 Vitest + React Testing Library UI tests + coverage
npm run test:setup     # 19 .NET 10 WPF modern setup, SFX2, Zip-Slip & 73-locale tests
npm run build          # Sync offline voice assets + build ag.exe shim + Vite bundle + esbuild server
npm run check:budget   # Verify strict JS/CSS production bundle size budgets
npm run test:e2e       # Real Electron BrowserWindow Playwright E2E smoke test
```

GitHub Actions executes the same gates automatically via `.github/workflows/ci.yml` on pushes and pull requests to `main` and `development`.

## 3. Windows Packaging Targets

Three Windows x64 distribution packages are produced under `release/`:

| Target | Command | Output Artifact (`release/`) |
| :--- | :--- | :--- |
| Modern Frameless WPF Setup | `npm run dist:win` | `Agendamea-Setup-1.1.0-win-x64.exe` |
| NativeAOT + Brotli `AGM_SFX2` Portable | `npm run dist:win` | `Agendamea-Portable-1.1.0-win-x64.exe` |
| Microsoft Store APPX | `npm run dist:win:appx` | `Agendamea-Store-1.1.0-win-x64.appx` |

Run `node scripts/update-winget-hashes.mjs 1.1.0` after packaging Setup so `winget/manifests/v/Vellium/Agendamea/1.1.0/Vellium.Agendamea.installer.yaml` matches the exact published `InstallerSha256`.

## 4. Publishing a GitHub Release

Push an annotated tag matching `v*`:

```bash
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

`.github/workflows/release.yml` runs on `windows-latest`, executes full quality gates, packages Modern WPF Setup `.exe`, NativeAOT Portable `.exe`, and Store `.appx`, generates `SHA256SUMS.txt` and `latest.yml`, and publishes all assets to GitHub Releases.

## 5. Distribution Channel Update Behavior

- **Microsoft Store (`process.windowsStore === true`)**: In-app self-updater downloads are disabled in compliance with Microsoft Store Policy 10.2.2 / 10.2.7; Microsoft Store manages automatic updates and package signatures natively.
- **Direct GitHub Setup / Portable Builds**: Settings -> Updates queries `https://api.github.com/repos/emirtdede/agendamea/releases/latest` (respecting the `autoUpdateCheck` preference), verifies SHA-512 checksums via `latest.yml`, and updates cleanly.
