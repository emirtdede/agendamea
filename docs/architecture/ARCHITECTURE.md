# Agendamea Architecture & Security Reference (`v1.1.0`)

## 1. Process Model

Agendamea runs as a modular, three-layer local-first architecture:

1. **Sandboxed Renderer (`src/`)**: React 19 + TypeScript 7 + Tailwind CSS v4 SPA running without Node.js access (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). Uses isolated zero-dependency `useSyncExternalStore` selector domain stores (`src/store/`: `preferencesStore`, `webhookStore`, `shortcutStore`, `notificationStore`, `updaterStore`, `workspaceSnapshotStore`) for zero-God-Context, zero-mirroring fine-grained updates, `VirtualizedTodoList` for large task lists, dynamic on-demand loading for 71 non-core locales (`src/i18n/localeLoader.ts`), a 100% offline neural voice pipeline (`src/voice/`: Mozilla RNNoise WASM, Silero VAD v5 ONNX, Piper VITS ONNX Neural TTS), and a shared singleton SSE event bus (`src/api/eventStream.ts`).
2. **Electron Main Process (`electron/main.cjs` + `electron/modules/`)**: Modular desktop shell managing the frameless window, tray, Jump List, taskbar voice overlay (`electron/voiceOverlay.cjs`), single-instance lock, backend lifecycle (`electron/modules/backendProcess.cjs`), allowlisted IPC handlers (`electron/modules/ipcHandlers.cjs`), and delta auto-updates (`electron/modules/updater.cjs`).
3. **Loopback Local Server (`server.ts` + `server/` -> `dist-server/server.mjs`)**: Modular Express 4 server bound exclusively to `127.0.0.1` (default port `38721` / `47821` with Windows Hyper-V/WinNAT fallback). Organized into `server/middleware/security.ts`, `server/routes/{core,webhooks,mcp,onedrive,ai}.ts`, and `server/services/{cloudSync,webhooks,aiRuntime,mcpInProcessStore}.ts`. Streamable HTTP MCP (`POST /api/mcp`) executes strictly in-process against the live database and services with zero loopback HTTP hops.
4. **Shared Zero-Drift Domain Layer (`shared/`)**: Canonical CJS modules shared between the Express server, CLI (`cli/`), and stdio/HTTP MCP (`mcp/server.cjs`), including `sqliteCore.cjs`, `todoRepository.cjs`, `settingsCodec.cjs`, `webhookEngine.cjs`, `localStore.cjs`, `modelManager.cjs`, `aiCatalog.cjs`, and `piperVoices.cjs`.

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
- `settings`: Key-value preferences decoded via `shared/settingsCodec.cjs` (theme, icons, accessibility, 73-language locale, custom keyboard shortcuts, notification profiles/channels, cloud sync, webhooks, local AI tiers/Ollama, voice mic/VAD/TTS/chime)

### Self-Healing Startup Recovery

If SQLite encounters confirmed database corruption (`SQLITE_CORRUPT` / `SQLITE_NOTADB`), `TodoDatabase.openDatabaseWithRecovery()` quarantines the broken file to `<db>.corrupt-<timestamp>.bak`, removes stale `-wal`/`-shm` sidecars, and initializes a fresh database cleanly. Non-corruption OS errors (such as `EISDIR` or permissions lock) fail safely without wiping user files.

## 3. Loopback REST, MCP & Webhook Endpoints

| Group                    | Endpoints                                                                                                                                                                                                            |
| :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health, Bootstrap & SSE  | `GET /api/health`, `GET /api/bootstrap`, `GET /api/events`                                                                                                                                                           |
| Categories               | `POST /api/categories`, `PATCH /api/categories/reorder`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id`, `POST /api/categories/:id/restore`, `DELETE /api/categories/:id/permanent`                       |
| Todos                    | `POST /api/todos`, `PATCH /api/todos/reorder`, `DELETE /api/todos/completed`, `PATCH /api/todos/:id`, `DELETE /api/todos/:id`, `POST /api/todos/:id/restore`, `DELETE /api/todos/:id/permanent`                      |
| Subtasks                 | `POST /api/todos/:id/subtasks`, `PATCH /api/subtasks/:id`, `DELETE /api/subtasks/:id`                                                                                                                                |
| Trash, Settings & Backup | `DELETE /api/trash`, `PATCH /api/settings`, `GET /api/export`, `POST /api/import`, `POST /api/reset`                                                                                                                 |
| MCP Streamable HTTP      | `POST /api/mcp`, `DELETE /api/mcp` (in-process JSON-RPC 2.0, MCP `2025-11-25`)                                                                                                                                       |
| Webhooks                 | `POST /api/webhooks/test`, `GET /api/webhooks/logs`, `DELETE /api/webhooks/logs`, `GET /api/webhooks/outbox`, `POST /api/webhooks/outbox/:id/replay`, `POST /api/webhooks/incoming`                                  |
| Local AI, RAG & Voice    | `GET /api/ai/status`, `GET /api/ai/models`, `POST /api/ai/models/:id/download`, `POST /api/ai/transcribe`, `POST /api/ai/ask`, `POST /api/ai/rag/query`, `POST /api/ai/rag/reindex`, `GET /api/ai/tts/voices`        |
| Cloud Sync & Updates     | `GET /api/onedrive/status`, `POST /api/onedrive/connect`, `POST /api/onedrive/disconnect`, `POST /api/onedrive/sync-push`, `POST /api/onedrive/sync-pull`, `POST /api/onedrive/open-folder`, `GET /api/update-check` |

## 4. Zero-Cost Cloud Folder Sync Protocol

- **Primary snapshot:** `<SyncFolder>\agendamea-onedrive-sync.json`
- **Previous backup & daily rolling history:** `<SyncFolder>\agendamea-onedrive-previous.json` and `agendamea-backup-YYYY-MM-DD.json` (15-day retention)
- **Non-blocking atomic writes:** Background auto-sync cycles use async `fs.promises` temp-file + atomic rename (`atomicWriteJsonFileAsync`) to keep the Express event loop responsive, while shutdown flushes synchronously.
- **Corrupt-primary fallback & empty-install protection:** If the primary JSON fails validation, the server falls back to previous/daily snapshots. Empty fresh installations never overwrite non-empty cloud backups and prompt the user to restore or start fresh.

## 5. Security Controls

- **DNS Rebinding Defense:** Rejects non-localhost `Host` headers.
- **CSRF Defense:** Mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) verify `Sec-Fetch-Site` and `Origin` against the loopback origin (`403` on cross-site attempts).
- **SSRF & Webhook Defense:** Standard Webhooks v1 HMAC-SHA256 signing, DNS resolution SSRF checks (blocking cloud metadata IPs and private ranges when `webhookAllowLocalNetwork` is false), and redirect blocking.
- **Security Headers:** `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- **External Navigation Allowlist:** Electron intercepts `setWindowOpenHandler` and `will-navigate` so only `vellium.dev` and `github.com` URLs can open in the system browser.
- **No Telemetry:** Zero third-party analytics, crash-upload endpoints, or background network beacons.
