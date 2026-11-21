# Agendamea Architecture & Security Reference (`v1.0.0`)

## 1. Process Model

Agendamea runs as a three-layer local-first architecture:

1. **Renderer (`src/`)**: React 19 + TypeScript 7 + Tailwind CSS v4 SPA. Runs without Node.js access (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
2. **Electron Main Process (`electron/main.cjs` + `electron/preload.cjs`)**: Manages the frameless desktop window, enforces `app.requestSingleInstanceLock()`, resolves the physical `.ico` asset from `app.asar.unpacked`, starts the embedded Express server on loopback, and exposes a strictly allowlisted `window.agendameaWindow` IPC bridge.
3. **Loopback Local Server (`server.ts` -> `dist-server/server.mjs`)**: Express 4 HTTP server bound exclusively to `127.0.0.1` (default port `47821`, with automatic fallback to `47822..47840` or OS-assigned ephemeral port if Windows Hyper-V/WinNAT reserves a port range). Production static files from `dist/` are served with `node:zlib` memory-cached gzip compression.

## 2. Database Schema (`src/db/database.ts`)

Agendamea uses `better-sqlite3` with:
- `PRAGMA journal_mode = WAL`
- `PRAGMA synchronous = NORMAL`
- `PRAGMA foreign_keys = ON`
- `PRAGMA busy_timeout = 5000`
- `PRAGMA user_version = 3`

### Tables
- `categories`: `id`, `name`, `color`, `pinned`, `sort_order`, `created_at`, `deleted_at`
- `todos`: `id`, `title`, `notes`, `completed`, `important`, `pinned`, `priority`, `start_date`, `due_date`, `due_time`, `tags` (JSON array, max 12), `category_id`, `sort_order`, `created_at`, `updated_at`, `deleted_at`
- `subtasks`: `id`, `todo_id` (`ON DELETE CASCADE`), `title`, `completed`, `sort_order`
- `settings`: Key-value preferences (`themeMode`, `themeId`, `dragLocked`, `sidebarCollapsed`, `themeCustomized`, `language`, `autoUpdateCheck`, `onedriveAutoSync`, `onedriveCustomPath`)

### Self-Healing Startup Recovery
If SQLite fails to open or migrate a corrupted database file, `TodoDatabase.openDatabaseWithRecovery()` moves the broken file to `<db>.corrupt-<timestamp>.bak`, removes stale `-wal`/`-shm` sidecars, and initializes a fresh database cleanly.

## 3. Loopback REST API Endpoints

| Group | Endpoints |
| :--- | :--- |
| Health & Bootstrap | `GET /api/health`, `GET /api/bootstrap` |
| Categories | `POST /api/categories`, `PATCH /api/categories/reorder`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id`, `POST /api/categories/:id/restore`, `DELETE /api/categories/:id/permanent` |
| Todos | `POST /api/todos`, `PATCH /api/todos/reorder`, `DELETE /api/todos/completed`, `PATCH /api/todos/:id`, `DELETE /api/todos/:id`, `POST /api/todos/:id/restore`, `DELETE /api/todos/:id/permanent` |
| Subtasks | `POST /api/todos/:id/subtasks`, `PATCH /api/subtasks/:id`, `DELETE /api/subtasks/:id` |
| Trash & Settings | `DELETE /api/trash`, `PATCH /api/settings` |
| Backup & Restore | `GET /api/export`, `POST /api/import` (strict 5 MB body cap, atomic SQLite transaction) |
| OneDrive Sync | `GET /api/onedrive/status`, `POST /api/onedrive/connect`, `POST /api/onedrive/disconnect`, `POST /api/onedrive/sync-push`, `POST /api/onedrive/sync-pull`, `POST /api/onedrive/open-folder` |
| Updates | `GET /api/update-check` |

## 4. Zero-Cost OneDrive Cloud Sync Protocol

- **Storage path:** `<OneDriveRoot>\Agendamea\agendamea-sync.json`
- **Daily rolling history:** `<OneDriveRoot>\Agendamea\backups\agendamea-YYYY-MM-DD.json` (15-day retention)
- **Atomic writes:** Every snapshot is written to a temporary `.tmp` file in the same directory before atomic rename, preventing half-written JSON during sudden power loss or mid-sync restarts.
- **Corrupt-primary fallback:** On pull/restore, if `agendamea-sync.json` fails JSON parsing or schema validation, the server scans `backups/` in reverse chronological order and automatically restores from the newest valid snapshot.
- **Empty-install protection:** Connecting an empty local database does not overwrite an existing OneDrive backup; on first launch with `0` local tasks, the UI presents a recovery banner offering **Restore Backup** or **Start Fresh**.

## 5. Security Controls

- **DNS Rebinding Defense:** Rejects non-localhost `Host` headers.
- **CSRF Defense:** Mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) verify `Sec-Fetch-Site` and `Origin` against the loopback origin (`403` on cross-site attempts).
- **Security Headers:** `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- **External Navigation Allowlist:** Electron intercepts `setWindowOpenHandler` and `will-navigate` so only `vellium.dev` and `github.com` URLs can open in the system browser.
- **No Telemetry:** Zero third-party analytics, crash-upload endpoints, or background network beacons.
