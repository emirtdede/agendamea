# Changelog

All notable changes to **Agendamea** are documented in this file.

## [1.1.0] - 2026-11-24

### Added

- **Settings IA v2, 12-Client Collapsible MCP Hub & Self-Healing Shortcuts:**
  - Consolidated 12 Settings tabs into 10 focused tabs with a single ARIA `tablist`, unified `<ToggleSwitch />` controls, 73-language deep Settings search, collapsible 73-language picker, isolated red **Danger Zone**, always-visible Trash retention controls, and Cold-Start local AI setup guidance.
  - Expanded one-click MCP client integration into a default-collapsed 12-card (`6x2`) grid covering **Claude Desktop**, **Cursor**, **VS Code**, **Windsurf**, **Claude Code**, **Antigravity**, **ChatGPT Codex** (comment-preserving TOML), **OpenCode** (`mcp.agendamea`), **Bionic (LM Studio)**, **Zed** (`context_servers`), **Gemini CLI**, and **Custom MCP (`.json` / `.jsonc` / `.toml`)** auto-detecting file picker.
  - Switched default global voice dictation shortcut across all 73 locales from `Ctrl+Alt+Space` (which collides with Claude Desktop Quick Entry on Windows) to **`Ctrl+Alt+D`**, with automatic startup OS conflict fallback (`autoFallback`), live status re-probing, and 1-click conflict auto-resolution.
  - Updated all 5 offline legal documents (Privacy Policy, Terms of Use, KVKK/GDPR, Open Source Licenses, Accessibility) for v1.1.0 compliance (SQLite WAL, Hugging Face SHA-256 downloads, Webhooks SSRF/HMAC, MCP third-party boundaries, Piper neural voice licenses, and KVKK/GDPR statutory rights).
- **On-Device Local AI, Hybrid RAG & Neural Voice Dictation:**
  - Hardware auto-profiling (64-bit VRAM detection, RAM, CPU cores, free disk) with 3 local model tiers (Light / Medium / Strong - 100% Apache 2.0 / MIT: Whisper.cpp, Qwen3, Multilingual-E5) plus zero-download **External Local Engine (Ollama / LM Studio)** model picker and automatic runtime server detection.
  - Upgraded 100% offline neural audio pipeline: **Mozilla RNNoise WASM** deep-learning noise suppression (`48 kHz` AudioWorklet), **Silero VAD v5 ONNX** neural speech detector with continuous EMA adaptive noise-floor fallback (`Auto`, `Low`, `Medium`, `High`), selectable microphone device + live level meter, 5 selectable ready chimes (`Soft`, `Crystal`, `Studio`, `Minimal`, `None`), and automatic no-speech timeout.
  - Local offline **Piper VITS ONNX Neural TTS** engine with 5 verified SHA-256 voices (Turkish Female/Male: İlkiz, Fahrettin, Fettah; English Female/Male: Kristin, Joe), 5 speaking style presets (`Natural`, `Crisp`, `Calm`, `Bright`, `Studio`), seamless Windows OneCore fallback, and zero CDN requests.
  - Redesigned taskbar voice overlay pill with clean centered 7-bar audio equalizer, live elapsed timer, confirmation lock for destructive actions, multi-match disambiguation, and keyboard command fallback.
  - Chunked hybrid FTS5 + vector RAG search (`ag rag`, `ag ask`, `ag ai status`) and 22-tool MCP server (`agendamea_semantic_search`, `agendamea_ai_status`).
- **Encoding, Security & Performance Hardening:**
  - Strict UTF-8 JSON request body decoder with transparent Windows-1254 / ISO-8859-9 fallback (`src/utils/jsonBodyDecoder.ts`), preventing Turkish mojibake (`U+FFFD`) from legacy Windows PowerShell 5.1 / `curl.exe` / ANSI webhook callers, plus UTF-8 `chcp 65001` CLI shims in `Agendamea.Setup`.
  - Production CSP updated with `'wasm-unsafe-eval'`, `media-src 'self' blob:`, and `connect-src 'self' data: blob:`, explicit `application/wasm` MIME delivery, on-demand disk streaming for large voice WASM/ONNX assets (eliminating ~49 MB startup RAM preload), and shared singleton SSE event bus (`src/api/eventStream.ts`).
- **Notification Center, Due/Upcoming Task Reminders & Profiles:**
  - Dedicated **Settings > Notifications** tab with one-click preset profiles (**Balanced**, **All Enabled**, **Focus Mode** [silences all channels], **In-App Only**, plus automatic **Custom**), configurable upcoming lead time (`5 / 10 / 15 / 30 / 60 min`), and per-event 4-way channel controls (**Both**, **In-App**, **Desktop**, **Off**) across 6 event categories.
  - Live background due/upcoming task reminder engine dispatching in-app toasts and native Windows desktop notifications with click-to-focus task support.
- **Fully Customizable Keyboard Shortcuts:**
  - Interactive keybind recorder in **Settings > General** and **Settings > AI & Dictation** for ALL global OS shortcuts (Quick Add, Voice Dictation) and ALL in-app shortcuts (New Task, Search, Open Settings, Reorder Up/Down, List/Kanban/Calendar/Matrix views) with one-click reset to defaults.
- **Universal Right-Click Context Menus:**
  - Viewport-clamped context menus across Task List rows, Kanban & Matrix cards, Calendar task pills & Calendar day cells (quick add on date), Sidebar categories, Detail Panel subtasks, and Trash items.
- **Modern Frameless Monochrome Windows Setup & Uninstaller (`Agendamea.Setup`):**
  - Native .NET 10 WPF single-card frameless `640x420` monochrome setup and uninstaller replacing the legacy Win32 NSIS wizard: 30 FPS ambient `SoftBackdrop`, draggable 42px title bar, animated sliding **Options Sheet** with 73-language live switching (including RTL), folder picker, shortcut/startup/CLI PATH toggles, animated `ShimmerBar` progress, `CheckBurst` completion, bundled `uninstall.exe` with optional user data removal, and full silent headless CLI flags (`/S`, `/SILENT`, `/VERYSILENT`, `/P`, `/DIR="..."`, `--uninstall`, `--delete-data`).
- **UI Polish, SelectField Unification, Smooth Animations & 1:1 Skeletons:**
  - Unified `SelectField` dropdown component fixing right-edge-sticking chevrons across the entire application.
  - Added GPU-accelerated micro-transitions (`.animate-context-menu`, `.animate-accordion`, `.animate-slide-in-left`) respecting Reduced Motion, plus 1:1 layout-matched loading skeletons for Calendar (7x6 grid), AI Hardware & Models, and Cloud Sync providers.

## [1.0.0] - 2026-11-22

### Added

- **4-Way Workspace Views:** Flat List (with automatic Date Range search filtering), Kanban Board (grouped by Priority or Status with drag-and-drop), Calendar Planner (scheduled tasks sorted chronologically by `HH:mm` + collapsible Undated Tasks drawer with drag-to-schedule), and Eisenhower Matrix (4 quadrants I-IV with automatic classification and drag-and-drop).
- **100% Headless Terminal CLI (`ag` / `agenda` / `agendamea`):** Short quote-free natural commands (`@today`, `@tomorrow`, `@start..due`, `14:30`, `!`, `*`, `^`, `#tag`, `/Category`, `--note`, `--sub`), 1-2-3 numbered lists, batch multi-selection (`ag ok 1 2 3`, `ag rm 1 2`), stdin piping (`ag import -`, `ag +`), terminal views (`ag cal`, `ag kanban`, `ag matris`), zero-GUI PATH installer (`ag install` / `ag uninstall`), OS preference bridge, and Windows interactive console stdout wrapper (`run-cli.ps1`).
- **Built-in 20-Tool MCP Server (`ag mcp`):** JSON-RPC 2.0 stdio server supporting Claude Desktop, Cursor, Antigravity, Windsurf, and VS Code with zero external Node.js dependency, full Live API and Cold-Start Offline SQLite parity across tasks, subtasks, categories, trash, views, Eisenhower matrix, settings, backups, cloud sync, updates, webhooks, and headless server control.
- **Headless Webhook Daemon (`ag serve`) & Bi-Directional Automation:** Run the loopback API and incoming webhook listener without opening the GUI (`ag serve start|stop|status`); outgoing Discord/Slack/JSON webhooks with multi-URL delivery, 2-attempt retry, event filtering (`webhookEvents`), persistent `webhook_logs` (`ag hook logs`), and constant-time HMAC-SHA256 verified incoming webhooks (`POST /api/webhook/incoming`) plus live SSE UI refresh (`/api/events`).
- **Zero-Cost Multi-Cloud Folder Sync:** Auto-detects OneDrive, Google Drive (`D:`-`Z:` + localized names), iCloud Drive, and Dropbox (`info.json`), with equal-width multi-cloud controls, atomic temp-file writes, 15-day rolling daily snapshots, corrupted primary fallback, reinstall recovery banner, and offline cloud auto-connect/pull (`ag sync auto|pull`).
- **Self-Healing SQLite Engine, Searchable Trash & Clean Start:** WAL-mode `better-sqlite3` storage (`PRAGMA user_version = 3`), searchable/sortable/date-range-filtered Trash with 12-second hover-pausing Undo toast, atomic JSON export/import (5 MB limit), and 2-step **Reset All Data (Clean Start)** with optional preferences reset.
- **28+ Themes, Custom HEX, Dynamic App Icons & 73 Languages:** 14 dual-mode themes + unlimited Custom HEX creator with one-click copyable HEX badges, system-wide dynamic `.ico` icons (window, taskbar, tray, Jump List, Desktop/Start Menu shortcuts), full-page tabbed Settings, 7-step Welcome Guide, accessibility suite (`80%-150%` zoom, High Contrast, Reduced Motion), 73 zero-leakage languages with RTL mirroring, and 5 offline localized legal documents.
- **Windows Desktop, Delta Auto-Updates & Store Compliance:** Electron 45 frameless window with single-instance lock, Windows Hyper-V/WinNAT `EACCES` port fallback, SHA-512 verified `electron-updater` silent/delta updates (`latest.yml` + `.blockmap`, strictly isolated from Store builds via `!process.windowsStore`), NSIS Setup `.exe`, Portable `.exe`, Microsoft Store `.appx`/MSIX packaging, and WinGet 1.6.0 manifests.
