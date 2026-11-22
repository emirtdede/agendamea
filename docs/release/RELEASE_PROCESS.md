# Release Process & Update Channels (`v1.1.0`)

## 1. Version Parity Checklist

Before cutting a release tag (`vX.Y.Z`), confirm version parity across:
- `package.json` (`"version"`)
- `shared/version.cjs` (shared runtime version source for `server.ts`, `electron/main.cjs`, `cli/`, `mcp/`)
- `CHANGELOG.md`
- `README.md` (`Release-vX.Y.Z` badge and package filenames)
- `winget/manifests/v/Vellium/Agendamea/<version>/`

## 2. Automated Verification Gates

Run all local checks before tagging:

```bash
npm run lint        # Strict TypeScript type-check (tsc --noEmit)
npm test            # 54 Node unit, AI, security, i18n zero-leakage & hygiene tests
npm run test:setup  # 13 .NET 10 WPF modern setup & SFX engine tests
npm run build       # Sync offline voice assets + Vite production bundle + esbuild server bundle
```

GitHub Actions executes the same gates automatically via `.github/workflows/ci.yml` on every push and pull request to `main`.

## 3. Windows Packaging Targets

Three Windows x64 distribution packages are produced under `release/`:

| Target | Command | Output Artifact (`release/`) |
| :--- | :--- | :--- |
| Modern Frameless WPF Setup | `npm run dist:win` | `Agendamea-Setup-1.1.0-win-x64.exe` |
| Portable Single-File | `npm run dist:win` | `Agendamea-Portable-1.1.0-win-x64.exe` |
| Microsoft Store APPX | `npm run dist:win:appx` | `Agendamea-Store-1.1.0-win-x64.appx` |

## 4. Publishing a GitHub Release

Push an annotated tag matching `v*`:

```bash
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

`.github/workflows/release.yml` runs on `windows-latest`, executes lint + Node tests + .NET Setup tests + build, packages Modern WPF Setup `.exe`, Portable `.exe`, and Store `.appx`, generates `SHA256SUMS.txt`, and publishes all assets to GitHub Releases.

## 5. Distribution Channel Update Behavior

- **Microsoft Store (`process.windowsStore === true`)**: In-app self-updater downloads are disabled in compliance with Microsoft Store Policy 10.2.7; Windows Store manages automatic updates and package signatures natively.
- **Direct GitHub NSIS / Portable Builds**: Settings -> Updates queries `https://api.github.com/repos/emirtdede/agendamea/releases/latest` (respecting the `autoUpdateCheck` preference), selects the matching channel asset (`.exe` Setup, `.exe` Portable, or `.msix`/`.appx`), downloads with progress streaming, and hands off safely to the installer.
