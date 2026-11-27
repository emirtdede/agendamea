# Changelog

All notable changes to **Agendamea** are documented in this file.

## [1.1.0] - 2026-11-28

### Added

- **Optional Application PIN / Password Lock & Dictation Security Guard:**
  - Added optional **4, 6, or 8-digit numeric PIN** and **custom Password** (6-128 chars) lock in **Settings -> General & Language**, backed by salted `crypto.scrypt` hashing (`shared/appLockCrypto.cjs`), exponential brute-force lockout, a one-time **Recovery Code** (`XXXX-XXXX-XXXX-XXXX`), configurable idle timeout (`1-60 min` or `Never`), lock-on-minimize/hide, instant manual lock (`Sidebar` / `Ctrl+K`), and zero-flash cold-start boot locking (`window.__AGENDAMEA_INITIAL_LOCK__`).
  - Added server-side HTTP **`423 Locked`** enforcement across data/AI/webhook endpoints (`server/routes/security.ts`, `server/services/appLock.ts`), automatic SSE pause while locked, and **Voice Dictation Lock Guard** in `electron/voiceOverlay.cjs` + `VoiceOverlayApp.tsx` (blocks voice overlay while locked, cancels active microphone/TTS immediately on lock, and refreshes idle timer during unlocked speech).
- **Spotlight Command Palette (`Ctrl+K`), 11-Tab Settings IA v2 & 10-Step Welcome Guide:**
  - Added fast keyboard-first **Command Palette (`Ctrl+K`)** for jumping across tasks, categories, workspace views, Settings tabs, quick task creation, and instant App Lock.
  - Organized Settings into **11 focused tabs** across 3 groups (_Personalization_, _Workspace_, _System_) with unified `<ToggleSwitch />` controls, **73-language deep Settings search**, dedicated **User Guide** tab, collapsible 73-language picker, isolated red **Danger Zone**, and a **10-step Welcome Guide**.
  - Added **Single-Locale Startup** loading only the active language chunk on boot (1,112 localized UI keys x 73 languages, zero leakage) paired with a **Language Restart Modal** for clean language switching.
- **One-Click Local AI Setup, Hybrid RAG & Neural Voice Dictation / TTS:**
  - Hardware auto-profiling (64-bit VRAM detection, RAM, CPU cores, free disk) with **5 GPU + 2 CPU** recommended profiles (100% Apache 2.0 / MIT: **Whisper.cpp**, **Qwen3**, **Multilingual-E5**), zero-download **Ollama / LM Studio** external engine integration, shared Llama runtime (`sharedLlama.cjs`), and an interactive **Live AI Test Playground**.
  - Upgraded 100% offline neural audio pipeline: **Mozilla RNNoise WASM** (`48 kHz` AudioWorklet), **Silero VAD v5 ONNX** neural speech detector with adaptive EMA noise-floor fallback, selectable microphone + live level meter, 5 ready chimes, and compact taskbar voice overlay pill.
  - Local offline **Piper VITS ONNX Neural TTS** engine with 5 verified SHA-256 voices (Turkish Female/Male: Ilkiz, Fahrettin, Fettah; English Female/Male: Kristin, Joe), 5 speaking style presets, seamless Windows OneCore fallback, and zero CDN requests.
  - Chunked hybrid FTS5 + vector RAG search (`ag rag`, `ag ask`, `ag ai status`) and **23-tool MCP server** (`5` static resources, `2` templates, `4` prompts, including `agendamea_semantic_search`, `agendamea_ai_status`, `agendamea_ask`).
- **12-Client Collapsible MCP Hub & Self-Healing Global Shortcuts:**
  - Expanded one-click MCP client integration into a default-collapsed 12-card (`6x2`) grid covering **Claude Desktop**, **Cursor**, **VS Code**, **Windsurf**, **Claude Code**, **Antigravity**, **ChatGPT Codex** (comment-preserving TOML), **OpenCode**, **Bionic (LM Studio)**, **Zed**, **Gemini CLI**, and **Custom MCP** (`.json` / `.jsonc` / `.toml`) with automatic `.bak` backups and live stdio handshake tester.
  - Switched default global voice dictation shortcut across all 73 locales to **`Ctrl+Alt+D`** with automatic startup OS conflict fallback (`autoFallback`), live status re-probing, and 1-click conflict resolution.
- **Notification Center, Due/Upcoming Task Reminders & Universal Context Menus:**
  - Dedicated **Settings -> Notifications** tab with preset profiles (**Balanced**, **All Enabled**, **Focus Mode**, **In-App Only**, **Custom**), configurable lead time (`5-60 min`), per-event 4-way controls (**Both**, **In-App**, **Desktop**, **Off**) across 6 event categories, FIFO toast queue, and persistent reminder deduplication.
  - Viewport-clamped right-click context menus across Task List rows, Kanban & Matrix cards, Calendar pills/day cells, Sidebar categories, Detail Panel subtasks, and Trash items.
- **Native .NET 10 WPF Setup, NativeAOT Brotli Portable & Native C# CLI (`ag.exe`):**
  - Replaced legacy Win32 NSIS wizard with native .NET 10 WPF single-card frameless `640x420` monochrome setup and uninstaller (`Agendamea.Setup`) with 73-language live switching, custom scrollbar, bundled `uninstall.exe`, and silent headless flags (`/S`, `/P`, `/DIR="..."`, `--uninstall`, `--delete-data`).
  - Built **NativeAOT + parallel Brotli `AGM_SFX2`** single-file Portable launcher (`Agendamea.Portable`) for fast warm starts and smaller footprint.
  - Replaced batch CLI wrappers with native 64-bit C# console shims (`ag.exe`, `agenda.exe`, `agendamea.exe`, compiled with `/highentropyva+` High-Entropy ASLR/DEP).
- **Encoding, Performance, Fonts & Microsoft Store MSIX Readiness:**
  - Self-hosted all UI fonts (`DM Sans`, `Plus Jakarta Sans`, `JetBrains Mono`) as local WOFF2 files under strict `'self'` CSP with zero external network calls on boot.
  - Added strict UTF-8 JSON body decoding with transparent Windows-1254 / ISO-8859-9 fallback, on-demand disk streaming for WASM/ONNX assets, shared singleton SSE bus, `VirtualizedTodoList`, and isolated `useSyncExternalStore` domain stores.
  - Added MSIX `windows.startupTask` extension (`electron-resources/appx-extensions.xml`), native MSIX AUMID preservation (`!process.windowsStore`), Store Policy 10.2.2/10.2.7 updater isolation, and updated all 5 offline legal documents across 73 languages.

## [1.0.0] - 2026-11-22

### Added

- **4-Way Workspace Views:** Flat List (with automatic Date Range search filtering), Kanban Board (grouped by Priority or Status with drag-and-drop), Calendar Planner (scheduled tasks sorted chronologically by `HH:mm` + collapsible Undated Tasks drawer with drag-to-schedule), and Eisenhower Matrix (4 quadrants I-IV with automatic classification and drag-and-drop).
- **100% Headless Terminal CLI (`ag` / `agenda` / `agendamea`):** Short quote-free natural commands (`@today`, `@tomorrow`, `@start..due`, `14:30`, `!`, `*`, `^`, `#tag`, `/Category`, `--note`, `--sub`), 1-2-3 numbered lists, batch multi-selection (`ag ok 1 2 3`, `ag rm 1 2`), stdin piping (`ag import -`, `ag +`), terminal views (`ag cal`, `ag kanban`, `ag matris`), zero-GUI PATH installer (`ag install` / `ag uninstall`), and OS preference bridge.
- **Built-in 20-Tool MCP Server (`ag mcp`):** JSON-RPC 2.0 stdio server supporting Claude Desktop, Cursor, Antigravity, Windsurf, and VS Code with zero external Node.js dependency and Live API / Cold-Start Offline SQLite parity.
- **Headless Webhook Daemon (`ag serve`) & Bi-Directional Automation:** Run the loopback API and incoming webhook listener without opening the GUI (`ag serve start|stop|status`); outgoing Discord/Slack/JSON webhooks with multi-URL delivery, retries, event filtering, persistent `webhook_logs`, HMAC-SHA256 verified incoming webhooks, and live SSE refresh.
- **Zero-Cost Multi-Cloud Folder Sync:** Auto-detects OneDrive, Google Drive, iCloud Drive, and Dropbox with atomic writes, 15-day rolling daily snapshots, corrupted primary fallback, reinstall recovery banner, and headless sync commands.
- **Self-Healing SQLite Engine, Searchable Trash & Clean Start:** WAL-mode `better-sqlite3` storage (`PRAGMA user_version = 3`), searchable/sortable/date-range-filtered Trash with 12-second hover-pausing Undo toast, atomic JSON export/import (5 MB limit), and 2-step **Reset All Data** reset.
- **28+ Themes, Custom HEX, Dynamic App Icons & 73 Languages:** 14 dual-mode themes + unlimited Custom HEX creator, system-wide dynamic `.ico` icons, tabbed Settings, Welcome Guide, accessibility suite (`80%-150%` zoom, High Contrast, Reduced Motion), 73 zero-leakage languages with RTL mirroring, and 5 offline localized legal documents.
- **Windows Desktop, Delta Auto-Updates & Store Compliance:** Electron 45 frameless window with single-instance lock, Windows Hyper-V/WinNAT `EACCES` port fallback, SHA-512 verified `electron-updater` silent/delta updates, Setup `.exe`, Portable `.exe`, Microsoft Store `.appx`/MSIX packaging, and WinGet 1.6.0 manifests.
