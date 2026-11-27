# Agendamea Architecture & Security Reference (`v1.1.0`)

## 1. Process Model

Agendamea runs as a modular, four-layer local-first architecture:

1. **Sandboxed Renderer (`src/`)**: React 19 + TypeScript 7 + Tailwind CSS v4 SPA running without Node.js access (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). Uses isolated zero-dependency `useSyncExternalStore` selector domain stores (`src/store/`: `appLockStore`, `preferencesStore`, `webhookStore`, `shortcutStore`, `notificationStore`, `updaterStore`, `workspaceSnapshotStore`, `workspaceUiStore`) for fine-grained updates, `VirtualizedTodoList` for large task lists, Spotlight `CommandPalette` (`Ctrl+K`), lazy-loaded `AppLockScreen` & `AppLockModal`, single-locale startup loading only the active language chunk (`src/i18n/localeLoader.ts`), self-hosted WOFF2 fonts (`public/fonts/`), a 100% offline neural voice pipeline (`src/voice/`: Mozilla RNNoise WASM, Silero VAD v5 ONNX, Piper VITS ONNX Neural TTS), and a shared singleton SSE event bus (`src/api/eventStream.ts`).
2. **Electron Main Process (`electron/main.cjs` + `electron/modules/`)**: Modular desktop shell managing the frameless window, tray, Jump List, taskbar voice overlay (`electron/voiceOverlay.cjs` with App Lock cancel and activity hooks), single-instance lock, backend lifecycle (`electron/modules/backendProcess.cjs`), allowlisted IPC handlers (`electron/modules/ipcHandlers.cjs`), WinRT MSIX `StartupTask` / classic login-item management (`electron/modules/shortcutManager.cjs`), and channel-aware delta auto-updates (`electron/modules/updater.cjs`).
3. **Loopback Local Server (`server.ts` + `server/` -> `dist-server/server.mjs`)**: Modular Express 4 server bound exclusively to `127.0.0.1` (default port `38721` / `47821` with Windows Hyper-V/WinNAT fallback). Injects `window.__AGENDAMEA_INITIAL_LOCK__` on cold-start HTML boot for zero-flash locking, enforces HTTP `423 Locked` across protected routes while App Lock is active, and organizes endpoints across `server/middleware/security.ts`, `server/routes/{core,security,webhooks,mcp,onedrive,ai}.ts`, and `server/services/{appLock,cloudSync,webhooks,aiRuntime,mcpInProcessStore}.ts`. Streamable HTTP MCP (`POST /api/mcp`) executes strictly in-process against the live database and services.
4. **Shared Zero-Drift Domain Layer (`shared/`) & Native .NET 10 Tooling (`installer/`)**: Canonical CJS modules shared between the Express server, CLI (`cli/`), and stdio/HTTP MCP (`mcp/server.cjs`), including `sqliteCore.cjs`, `todoRepository.cjs`, `settingsCodec.cjs`, `appLockCrypto.cjs`, `webhookEngine.cjs`, `localStore.cjs`, `modelManager.cjs`, `aiCatalog.cjs`, and `piperVoices.cjs`; paired with native 64-bit `Agendamea.Cli` (`ag.exe`), `Agendamea.Setup` (`640x420` WPF), and `Agendamea.Portable` (NativeAOT + Brotli `AGM_SFX2`).

## 2. Database Schema (`shared/sqliteCore.cjs` & `src/db/database.ts`)

Agendamea uses `better-sqlite3` with:

- `PRAGMA journal_mode = WAL`
- `PRAGMA synchronous = NORMAL`
- `PRAGMA foreign_keys = ON`
- `PRAGMA busy_timeout = 5000`
- `PRAGMA user_version = 5`

### Tables

- `categories`: `id`, `name`, `color`, `pinned`, `sort_order`, `created_at`, `deleted_at`
- `todos`: `id`, `title`, `notes`, `completed`, `important`, `pinned`, `priority`, `start_date`, `due_date`, `due_time`, `tags` (JSON array, max 12), `category_id`, `sort_order`, `created_at`, `updated_at`, `deleted_at`
- `subtasks`: `id`, `todo_id` (`ON DELETE CASCADE`), `title`, `completed`, `sort_order`
- `rag_chunks` & `rag_chunks_fts`: Chunked task/note FTS5 full-text index and vector embedding cache (`content_hash`) for hybrid local RAG search
- `webhook_logs`, `webhook_outbox`, & `webhook_reminder_dispatches`: Persistent delivery audit log, Standard Webhooks v1 retry/dead-letter queue, and deduplicated due-date reminder tracker
- `settings`: Key-value preferences decoded via `shared/settingsCodec.cjs` (theme, icons, accessibility, 73-language locale, custom keyboard shortcuts, notification profiles/channels, optional App PIN/Password Lock hashes & lockout metadata, cloud sync, webhooks, local AI tiers/Ollama, voice mic/VAD/TTS/chime)

### Self-Healing Startup Recovery

If SQLite encounters confirmed database corruption (`SQLITE_CORRUPT` / `SQLITE_NOTADB`), `TodoDatabase.openDatabaseWithRecovery()` quarantines the broken file to `<db>.corrupt-<timestamp>.bak`, removes stale `-wal`/`-shm` sidecars, and initializes a fresh database cleanly. Non-corruption OS errors (such as `EISDIR` or permissions lock) fail safely without wiping user files.

## 3. Loopback REST, Security, MCP & Webhook Endpoints

| Group                    | Endpoints                                                                                                                                                                                                                                                                      |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health, Bootstrap & SSE  | `GET /api/health`, `GET /api/bootstrap`, `GET /api/events`                                                                                                                                                                                                                     |
| App Lock & Security      | `GET /api/security/lock/status`, `POST /api/security/lock/setup`, `POST /api/security/lock/unlock`, `POST /api/security/lock/recover`, `POST /api/security/lock/lock`, `POST /api/security/lock/change`, `POST /api/security/lock/disable`, `PATCH /api/security/lock/options` |
| Categories               | `POST /api/categories`, `PATCH /api/categories/reorder`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id`, `POST /api/categories/:id/restore`, `DELETE /api/categories/:id/permanent`                                                                                 |
| Todos                    | `POST /api/todos`, `PATCH /api/todos/reorder`, `DELETE /api/todos/completed`, `PATCH /api/todos/:id`, `DELETE /api/todos/:id`, `POST /api/todos/:id/restore`, `DELETE /api/todos/:id/permanent`                                                                                |
| Subtasks                 | `POST /api/todos/:id/subtasks`, `PATCH /api/subtasks/:id`, `DELETE /api/subtasks/:id`                                                                                                                                                                                          |
| Trash, Settings & Backup | `DELETE /api/trash`, `PATCH /api/settings`, `GET /api/export`, `POST /api/import`, `POST /api/reset`                                                                                                                                                                           |
| MCP Streamable HTTP      | `POST /api/mcp`, `DELETE /api/mcp` (in-process JSON-RPC 2.0, MCP `2025-11-25`, 23 tools, 5 resources, 2 templates, 4 prompts)                                                                                                                                                  |
| Webhooks                 | `POST /api/webhooks/test`, `GET /api/webhooks/logs`, `DELETE /api/webhooks/logs`, `GET /api/webhooks/outbox`, `POST /api/webhooks/outbox/:id/replay`, `POST /api/webhooks/incoming`                                                                                            |
| Local AI, RAG & Voice    | `GET /api/ai/status`, `GET /api/ai/models`, `POST /api/ai/models/:id/download`, `POST /api/ai/transcribe`, `POST /api/ai/ask`, `POST /api/ai/rag/query`, `POST /api/ai/rag/reindex`, `GET /api/ai/tts/voices`                                                                  |
| Cloud Sync & Updates     | `GET /api/onedrive/status`, `POST /api/onedrive/connect`, `POST /api/onedrive/disconnect`, `POST /api/onedrive/sync-push`, `POST /api/onedrive/sync-pull`, `POST /api/onedrive/open-folder`, `GET /api/update-check`                                                           |

## 4. Zero-Cost Cloud Folder Sync Protocol

- **Primary snapshot:** `<SyncFolder>\agendamea-onedrive-sync.json`
- **Previous backup & daily rolling history:** `<SyncFolder>\agendamea-onedrive-previous.json` and `agendamea-backup-YYYY-MM-DD.json` (15-day retention)
- **Non-blocking atomic writes:** Background auto-sync cycles use async `fs.promises` temp-file + atomic rename (`atomicWriteJsonFileAsync`) to keep the Express event loop responsive, while shutdown flushes synchronously.
- **Corrupt-primary fallback & empty-install protection:** If the primary JSON fails validation, the server falls back to previous/daily snapshots. Empty fresh installations never overwrite non-empty cloud backups and prompt the user to restore or start fresh.

## 5. Security Controls

- **Optional App PIN / Password Lock:** Salted `crypto.scrypt` (`N=16384`, `r=8`, `p=1`, `64-byte` key) with `crypto.timingSafeEqual`, exponential brute-force lockout, one-time Recovery Code (`XXXX-XXXX-XXXX-XXXX`), HTTP `423 Locked` backend enforcement, SSE pause, and Voice Overlay lock cancellation.
- **DNS Rebinding Defense:** Rejects non-localhost `Host` headers.
- **CSRF Defense:** Mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) verify `Sec-Fetch-Site` and `Origin` against the loopback origin (`403` on cross-site attempts).
- **SSRF & Webhook Defense:** Standard Webhooks v1 HMAC-SHA256 signing, DNS resolution SSRF checks (blocking cloud metadata IPs and private ranges when `webhookAllowLocalNetwork` is false), and redirect blocking.
- **Security Headers & Local Fonts:** `Content-Security-Policy` (strict `'self'`, self-hosted WOFF2 fonts), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- **External Navigation Allowlist:** Electron intercepts `setWindowOpenHandler` and `will-navigate` so only `vellium.dev` and `github.com` URLs can open in the system browser.
- **No Telemetry:** Zero third-party analytics, crash-upload endpoints, or background network beacons.
