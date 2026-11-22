# Agendamea Documentation

This directory collects the architecture, keyboard accessibility, localization, release, and Microsoft Store packaging references for **Agendamea v1.1.0**. Only product entry files (`README.md`, `CHANGELOG.md`, `LICENSE`) and source configuration stay in the repository root.

## Quick Access

| Topic | Document |
| :--- | :--- |
| Product overview (EN / TR) | [`../README.md`](../README.md) |
| Release history | [`../CHANGELOG.md`](../CHANGELOG.md) |
| License | [`../LICENSE`](../LICENSE) |

## Directory Structure

### `architecture/`
System architecture, loopback security boundaries, SQLite schema, OneDrive sync protocol, and keyboard navigation:
- [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)
- [`architecture/KEYBOARD_SHORTCUTS.md`](architecture/KEYBOARD_SHORTCUTS.md)

### `i18n/`
73-language localization architecture, RTL support, and automated zero-leakage checks:
- [`i18n/LANGUAGES.md`](i18n/LANGUAGES.md)

### `release/`
Versioning parity, CI/CD pipelines, Windows packaging targets, and update channel behavior:
- [`release/RELEASE_PROCESS.md`](release/RELEASE_PROCESS.md)

### `store/`
Microsoft Store Partner Center submission checklist, `appx` manifest metadata, and Store policy compliance:
- [`store/STORE_CHECKLIST.md`](store/STORE_CHECKLIST.md)
