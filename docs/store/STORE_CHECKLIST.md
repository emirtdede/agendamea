# Microsoft Store Submission Checklist (`v1.1.0`)

## 1. Partner Center Identity Configuration (`electron-builder.yml`)

Verified official identity from Microsoft Partner Center (`Store ID: 9MT5X1NGZJXZ`, `PFN: Vellium.Agendamea_3ktyfn38rr7qr`):

```yaml
appx:
  applicationId: Agendamea
  identityName: Vellium.Agendamea
  displayName: Agendamea
  publisher: "CN=1DDB196A-421B-4090-8DC2-62C1AD43C8F0"
  publisherDisplayName: Vellium
  backgroundColor: "#09090b"
  showNameOnTiles: false
  minVersion: "10.0.17763.0"
  maxVersionTested: "10.0.26100.0"
  customExtensionsPath: electron-resources/appx-extensions.xml
  capabilities:
    - runFullTrust
    - internetClient
    - microphone
  languages:
    - tr-TR
    - en-US
  artifactName: "Agendamea-Store-${version}-win-${arch}.${ext}"
```

## 2. Store Policy Compliance Verification

- **No External Self-Updater in Store Builds (Policy 10.2.2 / 10.2.7):** `electron/preload.cjs` exposes `isWindowsStore: Boolean(process.windowsStore)`, `electron/modules/updater.cjs` and `UpdateSettingsSection.tsx` disable external downloads, and `backendProcess.cjs` propagates `AGENDAMEA_WINDOWS_STORE=1` so `GET /api/update-check` returns `{ storeManaged: true }` with zero external binary URLs.
- **Native MSIX AUMID & StartupTask:** `electron/main.cjs` preserves Windows' official MSIX package AUMID (`!process.windowsStore`), and `electron-resources/appx-extensions.xml` declares `windows.startupTask` (`TaskId="AgendameaStartup"`, `Enabled="false"` by default, opt-in via WinRT `StartupTask` API).
- **Binary Security (WACK):** `cli/bin/ag.exe` compiles as 64-bit PE with `/highentropyva+` (High-Entropy ASLR + DEP).
- **Zero External Network on Boot:** Fonts (`DM Sans`, `Plus Jakarta Sans`, `JetBrains Mono`) are self-hosted locally in `/fonts/*.woff2` with strict `'self'` CSP.
- **Notes for Certification (Restricted Capabilities):**
  - `runFullTrust`: Required for the packaged Electron + local SQLite (`better-sqlite3`) desktop database, local loopback API, and optional on-device AI inference runtime (`node-llama-cpp` / `whisper.node`).
  - `microphone`: Used strictly for opt-in, on-device voice dictation; audio is never uploaded to external servers.
  - Optional AI model downloads retrieve strictly data weights (`.gguf` / `.bin` / `.onnx`), never executable binaries or installers.
