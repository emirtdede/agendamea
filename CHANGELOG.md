# Changelog

All notable changes to **Agendamea** are documented in this file.

## [1.0.0] - 2026-11-21

### Added
- **4-Way Workspace Views:** Flat List, Kanban Board (grouped by Priority or Status with drag-and-drop), Calendar Planner (scheduled tasks sorted chronologically by time + collapsible Undated Tasks drawer with drag-to-schedule), and Eisenhower Matrix (4 quadrants I-IV with automatic classification and drag-and-drop).
- **Task Planning & Details:** Optional start/end date range (`YYYY-MM-DD`), optional due time (`HH:mm`, auto-assigns today when date is empty), post-creation `#tag` management (batch entry, deduplication, 12-tag limit, instant chip filtering), inline subtasks, auto-saving notes (`keepalive` unmount flush), pinning, priorities, and custom categories with 8 colors.
- **Zero-Cost OneDrive Cloud Sync & Crash Recovery:** Serverless sync via user's local Microsoft OneDrive folder with atomic temp-file writes, 15-day rolling daily snapshots, corrupted primary file fallback to previous snapshot, first-launch format recovery banner, and one-click folder explorer button.
- **Self-Healing Local SQLite Engine:** WAL-mode `better-sqlite3` storage (`PRAGMA user_version = 3`), automatic schema migration, soft-delete Trash bin with 12-second hover-pausing Undo toast, atomic JSON export/import with 5 MB limit and preview confirmation, and automatic `.corrupt-*.bak` database recovery.
- **73-Language Catalog & 28 Theme Palettes:** Full 73-language localization with zero language leakage, automatic RTL mirroring (`ar`, `fa`, `he`, `ur`), 14 dual-mode color themes (Light and Dark), and anti-FOUC theme caching.
- **Windows Desktop & Distribution:** Electron 45 frameless window with single-instance lock, Windows Hyper-V/WinNAT `EACCES` port fallback, gzip-compressed static asset serving, keyboard reordering (`Alt+Up/Down` for both tasks and categories), NSIS Setup `.exe`, Portable `.exe`, and Microsoft Store `.appx`/MSIX packaging.
- **Security & Compliance:** Loopback binding (`127.0.0.1`), DNS rebinding protection, CSRF (`Sec-Fetch-Site` / `Origin`) protection, strict CSP, external URL allowlist, Microsoft Store policy compliance (`isWindowsStore`), and 5 localized legal documents.
