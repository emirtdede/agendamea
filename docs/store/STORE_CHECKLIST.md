# Microsoft Store Submission Checklist (`v1.0.0`)

## 1. Partner Center Identity Configuration (`electron-builder.yml`)

Before generating the final `.appx` / `.msix` upload package, update the `appx:` block in `electron-builder.yml` with the exact values from Microsoft Partner Center -> Product Management -> Product Identity:

```yaml
appx:
  applicationId: Agendamea
  identityName: <PartnerCenter.IdentityName>
  displayName: Agendamea
  publisher: "CN=<PartnerCenter-Publisher-GUID>"
  publisherDisplayName: Vellium
  backgroundColor: "#09090b"
  showNameOnTiles: false
  languages:
    - tr-TR
    - en-US
  artifactName: "Agendamea-Store-${version}-win-${arch}.${ext}"
```

## 2. Store Policy Compliance Verification

- **No External Self-Updater in Store Builds**: `electron/preload.cjs` exposes `isWindowsStore: Boolean(process.windowsStore)`, and both `electron/main.cjs` and `UpdateSettingsSection.tsx` disable external binary downloads when running inside the MSIX/APPX sandbox.
- **No Unnecessary Capabilities / No Elevation**: `requestedExecutionLevel: asInvoker`; app runs strictly under standard user privileges with zero UAC prompts.
- **Offline Capability**: Core task management, SQLite storage, 28 themes, 73 languages, and all 5 legal documents operate 100% offline.
- **Zero Telemetry & Clear Privacy Disclosure**: All data stays on-device (or inside the user's own OneDrive folder when explicitly enabled).
- **Custom Icon & Brand Assets**: All Store tiles (`StoreLogo`, `Square44x44Logo`, `Square150x150Logo`, `Wide310x150Logo`, `LargeTile`, `SmallTile`, `BadgeLogo`, `SplashScreen`) are generated cleanly in `electron-resources/appx/` with zero default Electron fallback icons.

## 3. Build & Pre-Submission Verification

```bash
# Clean previous artifacts, test, lint, and build APPX
npm run clean
npm test
npm run lint
npm run dist:win:appx
```

Verify the resulting `release/Agendamea-Store-1.0.0-win-x64.appx` package with **Windows App Certification Kit (WACK)** before uploading to Partner Center.
