'use strict';

/**
 * Shared 100% Headless Data Engine for Agendamea CLI & MCP Server.
 * 1. Primary path: live local 127.0.0.1 HTTP API when desktop app is running (instant UI SSE sync + cloud backup + webhooks).
 * 2. Offline fallback: direct WAL-safe SQLite access to %APPDATA%\Agendamea\agendamea.db with automatic cold-start schema creation
 *    so 100% of Agendamea features work even if the GUI has never been launched once.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const cliInstaller = require('./cliInstaller.cjs');
const releaseUtils = require('./releaseUtils.cjs');
const hardwareProfiler = require('./hardwareProfiler.cjs');
const aiCatalog = require('./aiCatalog.cjs');
const { ModelManager } = require('./modelManager.cjs');
const sqliteCore = require('./sqliteCore.cjs');
const { APP_VERSION } = require('./version.cjs');
const { VoiceOrchestrator } = require('../electron/ai/voiceOrchestrator.cjs');

const ABI_FALLBACK_EXIT_CODE = 86;
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayStr() {
  return formatLocalDate(new Date());
}

function getTomorrowStr() {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  return formatLocalDate(dt);
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value.trim())) return false;
  const [y, m, d] = value.trim().split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return !Number.isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function normalizeDateRange(startDate, dueDate) {
  const s = typeof startDate === 'string' && isValidIsoDate(startDate) ? startDate.trim() : null;
  const d = typeof dueDate === 'string' && isValidIsoDate(dueDate) ? dueDate.trim() : null;
  if (s && d && s > d) return { startDate: d, dueDate: s };
  return { startDate: s, dueDate: d };
}

function sanitizeDueTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return TIME_24H_RE.test(trimmed) ? trimmed : null;
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function sanitizeTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rawTags) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 28);
    if (!clean) continue;
    const key = normalizeSearchText(clean);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function getCandidateDataDirs() {
  if (process.env.AGENDAMEA_DATA_DIR) {
    return [path.resolve(process.env.AGENDAMEA_DATA_DIR)];
  }
  return [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Agendamea') : null,
    path.join(os.homedir(), 'AppData', 'Roaming', 'Agendamea'),
  ].filter(Boolean);
}

function getCandidateBaseUrls() {
  const urls = [];
  if (process.env.AGENDAMEA_URL) {
    urls.push(String(process.env.AGENDAMEA_URL).replace(/\/+$/, ''));
  }
  if (process.env.AGENDAMEA_PORT) {
    urls.push(`http://127.0.0.1:${process.env.AGENDAMEA_PORT}`);
  }
  for (const dir of getCandidateDataDirs()) {
    try {
      const portFile = path.join(dir, 'runtime-port.json');
      if (fs.existsSync(portFile)) {
        const parsed = JSON.parse(fs.readFileSync(portFile, 'utf8'));
        const port = Number(parsed?.port);
        if (Number.isInteger(port) && port > 0 && port < 65536) {
          urls.push(`http://127.0.0.1:${port}`);
        }
      }
    } catch {
      // Ignore unreadable port file
    }
  }
  if (!process.env.AGENDAMEA_FORCE_OFFLINE && !process.env.AGENDAMEA_DATA_DIR) {
    for (const fallbackPort of [38721, 47821, 39721, 41721, 3000]) {
      urls.push(`http://127.0.0.1:${fallbackPort}`);
    }
  }
  return [...new Set(urls)];
}

async function resolveApiBaseUrl() {
  if (process.env.AGENDAMEA_FORCE_OFFLINE === '1') {
    return null;
  }
  for (const base of getCandidateBaseUrls()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 700);
      const res = await fetch(`${base}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.ok === true && (body.app === 'Agendamea' || typeof body.version === 'string')) {
          return base;
        }
      }
    } catch {
      // Try next port
    }
  }
  return null;
}

async function httpRequest(baseUrl, method, endpoint, body, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (timer && typeof timer.unref === 'function') timer.unref();
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveSqliteDatabasePath() {
  if (process.env.AGENDAMEA_DB_PATH) {
    return path.resolve(process.env.AGENDAMEA_DB_PATH);
  }
  for (const dir of getCandidateDataDirs()) {
    const dbPath = path.join(dir, 'agendamea.db');
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }
  }
  const fallbackDir = getCandidateDataDirs()[0];
  if (fallbackDir) {
    return path.join(fallbackDir, 'agendamea.db');
  }
  return null;
}

function loadBetterSqlite3() {
  const candidates = [
    'better-sqlite3',
    path.resolve(__dirname, '..', 'node_modules', 'better-sqlite3'),
  ];
  for (const modPath of candidates) {
    try {
      return require(modPath);
    } catch {
      // Try next resolution candidate
    }
  }
  return null;
}

/**
 * Cold-start schema initializer delegating to shared/sqliteCore.cjs (1:1 parity with src/db/database.ts).
 */
function ensureOfflineSchema(db) {
  sqliteCore.applyAgendameaSchema(db, { selfHealFts: false });
  sqliteCore.seedDefaultSettings(db);
}

function withOfflineDb(fn) {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    throw new Error('Could not resolve local Agendamea database directory.');
  }
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const Database = loadBetterSqlite3();
  if (!Database) {
    const err = new Error(
      'Agendamea desktop app is not running (offline SQLite driver unavailable in current Node ABI).',
    );
    err.code = 'SQLITE_ABI_MISMATCH';
    throw err;
  }
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    ensureOfflineSchema(db);
    return fn(db, dbPath);
  } finally {
    db.close();
  }
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#2563eb',
    pinned: Boolean(row.pinned),
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    deletedAt: row.deleted_at || null,
  };
}

function mapSubtaskRow(row) {
  return {
    id: row.id,
    todoId: row.todo_id,
    title: row.title,
    completed: Boolean(row.completed),
    sortOrder: Number(row.sort_order) || 0,
  };
}

function mapTodoRow(row, subtasks = []) {
  let tags = [];
  try {
    if (typeof row.tags === 'string' && row.tags.trim()) {
      const parsed = JSON.parse(row.tags);
      if (Array.isArray(parsed)) tags = parsed;
    }
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    notes: row.notes || '',
    completed: Boolean(row.completed),
    important: Boolean(row.important),
    pinned: Boolean(row.pinned),
    priority: row.priority || 'normal',
    startDate: row.start_date || null,
    dueDate: row.due_date || null,
    dueTime: row.due_time || null,
    tags,
    categoryId: row.category_id || null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
    subtasks,
  };
}

function attachSubtasksOffline(db, todoRows) {
  if (!Array.isArray(todoRows) || todoRows.length === 0) return [];
  const byTodo = new Map();
  const ids = todoRows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const subRows = db
      .prepare(`SELECT * FROM subtasks WHERE todo_id IN (${placeholders}) ORDER BY sort_order ASC`)
      .all(...chunk);
    for (const sr of subRows) {
      const list = byTodo.get(sr.todo_id) || [];
      list.push(mapSubtaskRow(sr));
      byTodo.set(sr.todo_id, list);
    }
  }
  return todoRows.map((row) => mapTodoRow(row, byTodo.get(row.id) || []));
}

function readSettingsOffline(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const settings = {
    themeMode: map.get('themeMode') === 'dark' ? 'dark' : map.get('themeMode') === 'system' ? 'system' : 'light',
    themeId: map.get('themeId') || 'obsidian',
    dragLocked: map.get('dragLocked') === '1' || map.get('dragLocked') === 'true',
    sidebarCollapsed: map.get('sidebarCollapsed') === '1' || map.get('sidebarCollapsed') === 'true',
    themeCustomized: map.get('themeCustomized') === '1' || map.get('themeCustomized') === 'true',
    language: map.get('language') || 'tr',
    autoUpdateCheck: map.get('autoUpdateCheck') === undefined ? true : map.get('autoUpdateCheck') === '1' || map.get('autoUpdateCheck') === 'true',
  };
  if (map.get('customThemeColor')) settings.customThemeColor = map.get('customThemeColor');
  if (map.get('appIconId')) settings.appIconId = map.get('appIconId');
  if (map.get('customIconColor')) settings.customIconColor = map.get('customIconColor');
  if (map.get('zoomPercent')) settings.zoomPercent = Number(map.get('zoomPercent')) || 100;
  if (map.get('highContrast') === '1') settings.highContrast = true;
  if (map.get('reducedMotion') === '1') settings.reducedMotion = true;
  if (map.get('closeBehavior')) settings.closeBehavior = map.get('closeBehavior');
  if (map.get('launchAtStartup') === '1') settings.launchAtStartup = true;
  if (map.get('globalQuickAddShortcut') !== undefined) {
    settings.globalQuickAddShortcut = map.get('globalQuickAddShortcut') === '1';
  }
  if (map.get('onedriveAutoSync') === '1') settings.onedriveAutoSync = true;
  if (map.get('onedriveCustomPath')) settings.onedriveCustomPath = map.get('onedriveCustomPath');
  if (map.get('onboardingCompleted') === '1') settings.onboardingCompleted = true;
  if (map.get('webhookEnabled') === '1') settings.webhookEnabled = true;
  if (map.get('webhookUrl')) settings.webhookUrl = map.get('webhookUrl');
  if (map.get('webhookSecret')) settings.webhookSecret = map.get('webhookSecret');
  if (map.get('webhookEvents')) settings.webhookEvents = map.get('webhookEvents');
  const rawAiEnabled = map.get('aiEnabled');
  if (rawAiEnabled === '1' || rawAiEnabled === 'true') settings.aiEnabled = true;
  else if (rawAiEnabled === '0' || rawAiEnabled === 'false') settings.aiEnabled = false;
  const rawAiTier = map.get('aiTier');
  if (
    rawAiTier === 'tier-light' ||
    rawAiTier === 'tier-medium' ||
    rawAiTier === 'tier-strong' ||
    rawAiTier === 'external-ollama' ||
    rawAiTier === 'external-lmstudio'
  ) {
    settings.aiTier = rawAiTier;
  }
  if (map.get('aiLlmModelId')) settings.aiLlmModelId = map.get('aiLlmModelId');
  if (map.get('aiSttModelId')) settings.aiSttModelId = map.get('aiSttModelId');
  if (map.get('aiEmbedModelId')) settings.aiEmbedModelId = map.get('aiEmbedModelId');
  const rawUseOllama = map.get('aiUseExternalOllama');
  if (rawUseOllama === '1' || rawUseOllama === 'true') settings.aiUseExternalOllama = true;
  else if (rawUseOllama === '0' || rawUseOllama === 'false') settings.aiUseExternalOllama = false;
  if (map.get('aiOllamaModel')) settings.aiOllamaModel = map.get('aiOllamaModel');
  if (map.get('voiceShortcut')) settings.voiceShortcut = map.get('voiceShortcut');
  const rawVoiceAutoStop = map.get('voiceAutoStopMs');
  if (rawVoiceAutoStop !== undefined) {
    const ms = Number(rawVoiceAutoStop);
    if (Number.isFinite(ms) && ms >= 600 && ms <= 5000) {
      settings.voiceAutoStopMs = Math.round(ms);
    }
  }
  const rawVoiceTtsEnabled = map.get('voiceTtsEnabled');
  if (rawVoiceTtsEnabled === '1' || rawVoiceTtsEnabled === 'true') settings.voiceTtsEnabled = true;
  else if (rawVoiceTtsEnabled === '0' || rawVoiceTtsEnabled === 'false') settings.voiceTtsEnabled = false;
  if (map.get('voiceTtsVoice')) settings.voiceTtsVoice = map.get('voiceTtsVoice');
  if (map.get('voiceMicDeviceId')) settings.voiceMicDeviceId = map.get('voiceMicDeviceId');
  const rawNoiseSup = map.get('voiceNoiseSuppression');
  if (rawNoiseSup === '1' || rawNoiseSup === 'true') settings.voiceNoiseSuppression = true;
  else if (rawNoiseSup === '0' || rawNoiseSup === 'false') settings.voiceNoiseSuppression = false;
  const rawSens = map.get('voiceSensitivity');
  if (rawSens === 'auto' || rawSens === 'low' || rawSens === 'medium' || rawSens === 'high') {
    settings.voiceSensitivity = rawSens;
  }
  if (map.get('globalQuickAddShortcutKey')) {
    settings.globalQuickAddShortcutKey = map.get('globalQuickAddShortcutKey');
  }
  if (map.get('customShortcuts')) {
    try {
      const parsed = JSON.parse(map.get('customShortcuts'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings.customShortcuts = parsed;
      }
    } catch {
      // Ignore malformed JSON
    }
  }
  const rawNotifProfile = map.get('notificationProfile');
  if (
    rawNotifProfile === 'balanced' ||
    rawNotifProfile === 'all' ||
    rawNotifProfile === 'focus' ||
    rawNotifProfile === 'silent_inapp' ||
    rawNotifProfile === 'custom'
  ) {
    settings.notificationProfile = rawNotifProfile;
  }
  const rawNotifLead = map.get('notificationLeadMinutes');
  if (rawNotifLead !== undefined) {
    const mins = Number(rawNotifLead);
    if (Number.isFinite(mins) && mins >= 1 && mins <= 180) {
      settings.notificationLeadMinutes = Math.round(mins);
    }
  }
  if (map.get('notificationChannels')) {
    try {
      const parsed = JSON.parse(map.get('notificationChannels'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings.notificationChannels = parsed;
      }
    } catch {
      // Ignore malformed JSON
    }
  }
  return settings;
}

function writeSettingsPatchOffline(db, patch) {
  if (!patch || typeof patch !== 'object') return;
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const boolKeys = [
    'dragLocked',
    'sidebarCollapsed',
    'autoUpdateCheck',
    'highContrast',
    'reducedMotion',
    'launchAtStartup',
    'globalQuickAddShortcut',
    'onedriveAutoSync',
    'onboardingCompleted',
    'webhookEnabled',
    'aiEnabled',
    'aiUseExternalOllama',
    'voiceTtsEnabled',
    'voiceNoiseSuppression',
  ];
  for (const key of boolKeys) {
    if (typeof patch[key] === 'boolean') {
      stmt.run(key, patch[key] ? '1' : '0');
    }
  }
  if (
    patch.aiTier === 'tier-light' ||
    patch.aiTier === 'tier-medium' ||
    patch.aiTier === 'tier-strong' ||
    patch.aiTier === 'external-ollama' ||
    patch.aiTier === 'external-lmstudio'
  ) {
    stmt.run('aiTier', patch.aiTier);
  }
  if (typeof patch.aiLlmModelId === 'string') {
    const id = patch.aiLlmModelId.trim().slice(0, 120);
    if (id === '' || aiCatalog.MODELS_BY_ID[id]?.role === 'llm') {
      stmt.run('aiLlmModelId', id);
    }
  }
  if (typeof patch.aiSttModelId === 'string') {
    const id = patch.aiSttModelId.trim().slice(0, 120);
    if (id === '' || aiCatalog.MODELS_BY_ID[id]?.role === 'stt') {
      stmt.run('aiSttModelId', id);
    }
  }
  if (typeof patch.aiEmbedModelId === 'string') {
    const id = patch.aiEmbedModelId.trim().slice(0, 120);
    if (id === '' || aiCatalog.MODELS_BY_ID[id]?.role === 'embed') {
      stmt.run('aiEmbedModelId', id);
    }
  }
  if (typeof patch.aiOllamaModel === 'string') {
    stmt.run('aiOllamaModel', patch.aiOllamaModel.trim().slice(0, 160));
  }
  if (typeof patch.voiceShortcut === 'string' && patch.voiceShortcut.trim().length > 0) {
    stmt.run('voiceShortcut', patch.voiceShortcut.trim().slice(0, 64));
  }
  if (typeof patch.voiceAutoStopMs === 'number' && Number.isFinite(patch.voiceAutoStopMs)) {
    const clamped = Math.max(600, Math.min(5000, Math.round(patch.voiceAutoStopMs)));
    stmt.run('voiceAutoStopMs', String(clamped));
  }
  if (typeof patch.voiceTtsVoice === 'string') {
    stmt.run('voiceTtsVoice', patch.voiceTtsVoice.trim().slice(0, 160));
  }
  if (typeof patch.voiceMicDeviceId === 'string') {
    stmt.run('voiceMicDeviceId', patch.voiceMicDeviceId.trim().slice(0, 200));
  }
  if (
    patch.voiceSensitivity === 'auto' ||
    patch.voiceSensitivity === 'low' ||
    patch.voiceSensitivity === 'medium' ||
    patch.voiceSensitivity === 'high'
  ) {
    stmt.run('voiceSensitivity', patch.voiceSensitivity);
  }
  if (typeof patch.globalQuickAddShortcutKey === 'string' && patch.globalQuickAddShortcutKey.trim().length > 0) {
    stmt.run('globalQuickAddShortcutKey', patch.globalQuickAddShortcutKey.trim().slice(0, 64));
  }
  if (patch.customShortcuts && typeof patch.customShortcuts === 'object' && !Array.isArray(patch.customShortcuts)) {
    stmt.run('customShortcuts', JSON.stringify(patch.customShortcuts));
  }
  if (
    patch.notificationProfile === 'balanced' ||
    patch.notificationProfile === 'all' ||
    patch.notificationProfile === 'focus' ||
    patch.notificationProfile === 'silent_inapp' ||
    patch.notificationProfile === 'custom'
  ) {
    stmt.run('notificationProfile', patch.notificationProfile);
  }
  if (typeof patch.notificationLeadMinutes === 'number' && Number.isFinite(patch.notificationLeadMinutes)) {
    const clamped = Math.max(1, Math.min(180, Math.round(patch.notificationLeadMinutes)));
    stmt.run('notificationLeadMinutes', String(clamped));
  }
  if (
    patch.notificationChannels &&
    typeof patch.notificationChannels === 'object' &&
    !Array.isArray(patch.notificationChannels)
  ) {
    stmt.run('notificationChannels', JSON.stringify(patch.notificationChannels));
  }
  if (patch.themeMode === 'light' || patch.themeMode === 'dark' || patch.themeMode === 'system') {
    stmt.run('themeMode', patch.themeMode);
    stmt.run('themeCustomized', '1');
  }
  if (typeof patch.themeId === 'string' && patch.themeId.trim()) {
    stmt.run('themeId', patch.themeId.trim());
    stmt.run('themeCustomized', '1');
  }
  if (typeof patch.customThemeColor === 'string') {
    const norm = normalizeHexColor(patch.customThemeColor);
    if (norm) stmt.run('customThemeColor', norm);
  }
  if (typeof patch.appIconId === 'string' && patch.appIconId.trim()) {
    stmt.run('appIconId', patch.appIconId.trim());
  }
  if (typeof patch.customIconColor === 'string') {
    const norm = normalizeHexColor(patch.customIconColor);
    if (norm) stmt.run('customIconColor', norm);
  }
  if (typeof patch.zoomPercent === 'number' && Number.isFinite(patch.zoomPercent)) {
    const clamped = Math.max(80, Math.min(150, Math.round(patch.zoomPercent)));
    stmt.run('zoomPercent', String(clamped));
  }
  if (patch.closeBehavior === 'ask' || patch.closeBehavior === 'tray' || patch.closeBehavior === 'quit') {
    stmt.run('closeBehavior', patch.closeBehavior);
  }
  if (typeof patch.language === 'string' && patch.language.trim()) {
    stmt.run('language', patch.language.trim());
  }
  if (typeof patch.onedriveCustomPath === 'string') {
    const trimmedPath = patch.onedriveCustomPath.trim().slice(0, 500);
    if (trimmedPath === '') {
      stmt.run('onedriveCustomPath', '');
    } else {
      stmt.run('onedriveCustomPath', assertSafeLocalSyncFolder(trimmedPath));
    }
  }
  if (typeof patch.webhookUrl === 'string') {
    const trimmed = patch.webhookUrl.trim().slice(0, 4000);
    if (trimmed === '') {
      stmt.run('webhookUrl', '');
    } else {
      const validUrls = parseWebhookUrlsOffline(trimmed);
      if (validUrls.length > 0) stmt.run('webhookUrl', validUrls.join(','));
    }
  }
  if (typeof patch.webhookSecret === 'string') {
    stmt.run('webhookSecret', patch.webhookSecret.trim().slice(0, 256));
  }
  if (typeof patch.webhookEvents === 'string') {
    const cleaned = patch.webhookEvents
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(',')
      .slice(0, 500);
    stmt.run('webhookEvents', cleaned);
  }
}

function getBootstrapOffline(db) {
  const categories = db
    .prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at ASC')
    .all()
    .map(mapCategoryRow);
  const trashedCategories = db
    .prepare('SELECT * FROM categories WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all()
    .map(mapCategoryRow);
  const todoRows = db
    .prepare('SELECT * FROM todos WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC')
    .all();
  const trashedTodoRows = db
    .prepare('SELECT * FROM todos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all();
  return {
    categories,
    todos: attachSubtasksOffline(db, todoRows),
    trashedCategories,
    trashedTodos: attachSubtasksOffline(db, trashedTodoRows),
    settings: readSettingsOffline(db),
  };
}

function orderActiveFirst(todos) {
  return [...todos].sort((a, b) => {
    if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function resolveTaskSelector(todos, selector) {
  const raw = String(selector || '').trim();
  if (!raw) throw new Error('Task number, title keyword, or ID is required.');

  const ordered = orderActiveFirst(todos);
  const activeOnly = ordered.filter((t) => !t.completed);

  if (/^\d+$/.test(raw)) {
    const idx = Number.parseInt(raw, 10);
    const pool = activeOnly.length > 0 ? activeOnly : ordered;
    if (idx >= 1 && idx <= pool.length) return pool[idx - 1];
    throw new Error(`Task #${idx} not found (1-${pool.length}).`);
  }

  const lower = raw.toLowerCase();
  const exact = ordered.find((t) => t.id.toLowerCase() === lower);
  if (exact) return exact;

  const prefixMatches = ordered.filter((t) => {
    const idLow = t.id.toLowerCase();
    const shortLow = idLow.startsWith('todo-') ? idLow.slice(5) : idLow;
    return idLow.startsWith(lower) || shortLow.startsWith(lower);
  });
  if (prefixMatches.length === 1) return prefixMatches[0];
  if (prefixMatches.length > 1) {
    throw new Error(`Ambiguous ID prefix "${raw}" (${prefixMatches.length} matches).`);
  }

  const qTr = normalizeSearchText(raw);
  const titleMatches = ordered.filter(
    (t) =>
      normalizeSearchText(t.title).includes(qTr) ||
      String(t.title || '').toLowerCase().includes(lower),
  );
  if (titleMatches.length === 1) return titleMatches[0];
  if (titleMatches.length > 1) {
    const activeMatches = titleMatches.filter((t) => !t.completed);
    if (activeMatches.length === 1) return activeMatches[0];
    const preview = titleMatches
      .slice(0, 4)
      .map((t, i) => `${i + 1}. ${t.title}`)
      .join(' | ');
    throw new Error(`Multiple tasks matched "${raw}": ${preview}`);
  }

  throw new Error(`Task not found: "${raw}".`);
}

function resolveCategorySelector(categories, selector) {
  const raw = String(selector || '').trim();
  if (!raw) throw new Error('Category number, name, or ID is required.');
  if (/^\d+$/.test(raw)) {
    const idx = Number.parseInt(raw, 10);
    if (idx >= 1 && idx <= categories.length) return categories[idx - 1];
    throw new Error(`Category #${idx} not found (1-${categories.length}).`);
  }
  const lower = raw.toLowerCase();
  const exactId = categories.find((c) => c.id.toLowerCase() === lower);
  if (exactId) return exactId;
  const qTr = normalizeSearchText(raw);
  const exactName = categories.find((c) => normalizeSearchText(c.name) === qTr);
  if (exactName) return exactName;
  const partial = categories.filter(
    (c) =>
      c.id.toLowerCase().startsWith(lower) ||
      normalizeSearchText(c.name).includes(qTr) ||
      String(c.name || '').toLowerCase().includes(lower),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`Multiple categories matched "${raw}".`);
  }
  throw new Error(`Category not found: "${raw}".`);
}

function resolveSubtaskSelector(subtasks, selector) {
  const list = Array.isArray(subtasks) ? subtasks : [];
  const raw = String(selector || '').trim();
  if (!raw) throw new Error('Subtask number, keyword, or ID is required.');
  if (/^\d+$/.test(raw)) {
    const idx = Number.parseInt(raw, 10);
    if (idx >= 1 && idx <= list.length) return list[idx - 1];
    throw new Error(`Subtask #${idx} not found (1-${list.length}).`);
  }
  const lower = raw.toLowerCase();
  const exact = list.find((s) => s.id.toLowerCase() === lower);
  if (exact) return exact;
  const qTr = normalizeSearchText(raw);
  const matches = list.filter(
    (s) =>
      s.id.toLowerCase().startsWith(lower) ||
      normalizeSearchText(s.title).includes(qTr) ||
      String(s.title || '').toLowerCase().includes(lower),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Multiple subtasks matched "${raw}".`);
  throw new Error(`Subtask not found: "${raw}".`);
}

function matchesTaskDateRange(todo, dateFrom, dateTo) {
  const from = typeof dateFrom === 'string' && isValidIsoDate(dateFrom) ? dateFrom.trim() : '';
  const to = typeof dateTo === 'string' && isValidIsoDate(dateTo) ? dateTo.trim() : '';
  if (!from && !to) return true;
  const minBound = from && to && from > to ? to : from;
  const maxBound = from && to && from > to ? from : to;
  const start = todo.startDate || todo.dueDate || null;
  const end = todo.dueDate || todo.startDate || null;
  if (!start || !end) return false;
  if (minBound && end < minBound) return false;
  if (maxBound && start > maxBound) return false;
  return true;
}

function isScheduledToday(todo, today) {
  const { startDate, dueDate } = normalizeDateRange(todo.startDate, todo.dueDate);
  if (dueDate && dueDate <= today) return true;
  if (startDate && startDate <= today && (!dueDate || dueDate >= today)) return true;
  return false;
}

function applyTaskFilters(todos, categories, options = {}) {
  const filter = options.filter || 'active';
  const today = getTodayStr();
  let list = orderActiveFirst(todos);
  if (filter === 'active') list = list.filter((t) => !t.completed);
  else if (filter === 'completed') list = list.filter((t) => t.completed);
  else if (filter === 'today') list = list.filter((t) => !t.completed && isScheduledToday(t, today));
  else if (filter === 'important') list = list.filter((t) => !t.completed && t.important);
  else if (filter === 'pinned') list = list.filter((t) => !t.completed && t.pinned);

  if (typeof options.category === 'string' && options.category.trim()) {
    const matchedCat = resolveCategorySelector(categories || [], options.category.trim());
    list = list.filter((t) => t.categoryId === matchedCat.id);
  }

  if (options.priority === 'high' || options.priority === 'normal' || options.priority === 'low') {
    list = list.filter((t) => t.priority === options.priority);
  }

  if (typeof options.tag === 'string' && options.tag.trim()) {
    const wantedTag = normalizeSearchText(options.tag.trim().replace(/^#+/, ''));
    list = list.filter(
      (t) => Array.isArray(t.tags) && t.tags.some((tg) => normalizeSearchText(tg) === wantedTag),
    );
  }

  if (options.dateFrom || options.dateTo) {
    list = list.filter((t) => matchesTaskDateRange(t, options.dateFrom, options.dateTo));
  }

  if (typeof options.query === 'string' && options.query.trim()) {
    const qTr = normalizeSearchText(options.query);
    const qStd = options.query.trim().toLowerCase();
    const qTag = qTr.startsWith('#') ? qTr.slice(1) : qTr;
    list = list.filter((t) => {
      const inTitle =
        normalizeSearchText(t.title).includes(qTr) || String(t.title || '').toLowerCase().includes(qStd);
      const inNotes =
        normalizeSearchText(t.notes).includes(qTr) || String(t.notes || '').toLowerCase().includes(qStd);
      const inTags =
        Array.isArray(t.tags) &&
        t.tags.some((tg) => normalizeSearchText(tg).includes(qTag) || String(tg).toLowerCase().includes(qTag));
      const inSubtasks =
        Array.isArray(t.subtasks) &&
        t.subtasks.some(
          (s) => normalizeSearchText(s.title).includes(qTr) || String(s.title || '').toLowerCase().includes(qStd),
        );
      return inTitle || inNotes || inTags || inSubtasks;
    });
  }

  const sortBy = options.sortBy || 'manual';
  if (sortBy !== 'manual') {
    const priRank = { high: 0, normal: 1, low: 2 };
    list = [...list].sort((a, b) => {
      if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (sortBy === 'priority') {
        const diff = (priRank[a.priority] ?? 1) - (priRank[b.priority] ?? 1);
        if (diff !== 0) return diff;
      } else if (sortBy === 'dueDate') {
        const ad = a.dueDate || a.startDate || '9999-12-31';
        const bd = b.dueDate || b.startDate || '9999-12-31';
        if (ad !== bd) return ad.localeCompare(bd);
        const at = a.dueTime || '99:99';
        const bt = b.dueTime || '99:99';
        if (at !== bt) return at.localeCompare(bt);
      } else if (sortBy === 'newest') {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      }
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }
  return list;
}

function atomicWriteJsonFileOffline(targetPath, jsonText) {
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, jsonText, 'utf8');
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch {
    fs.copyFileSync(tmpPath, targetPath);
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

function listCloudBackupFilesOffline(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) return [];
    const entries = fs.readdirSync(folderPath);
    const primary = 'agendamea-onedrive-sync.json';
    const previous = 'agendamea-onedrive-previous.json';
    const rolling = entries
      .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
      .sort()
      .reverse();
    const out = [];
    if (entries.includes(primary)) out.push(path.join(folderPath, primary));
    if (entries.includes(previous)) out.push(path.join(folderPath, previous));
    for (const f of rolling) out.push(path.join(folderPath, f));
    return out;
  } catch {
    return [];
  }
}

function readValidCloudBackupOffline(folderPath) {
  for (const filePath of listCloudBackupFilesOffline(folderPath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || !raw.trim()) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      if (!Array.isArray(parsed.todos) && !Array.isArray(parsed.categories)) continue;
      const stat = fs.statSync(filePath);
      return {
        filePath,
        mtimeIso: stat.mtime.toISOString(),
        todoCount: Array.isArray(parsed.todos) ? parsed.todos.length : 0,
        categoryCount: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
        payload: parsed,
      };
    } catch {
      // Fall back to next valid backup file
    }
  }
  return null;
}

function writeCloudSnapshotOffline(db, folderOverride, allowEmptyOverwrite = false) {
  const settings = readSettingsOffline(db);
  const folder = (folderOverride || settings.onedriveCustomPath || '').trim();
  if (!folder) return null;
  const resolved = path.resolve(folder);
  fs.mkdirSync(resolved, { recursive: true });
  const snapshot = getBootstrapOffline(db);
  const isLocalEmpty =
    snapshot.todos.length === 0 &&
    snapshot.categories.length === 0 &&
    snapshot.trashedTodos.length === 0 &&
    snapshot.trashedCategories.length === 0;
  const existing = readValidCloudBackupOffline(resolved);
  if (
    isLocalEmpty &&
    !allowEmptyOverwrite &&
    existing &&
    (existing.todoCount > 0 || existing.categoryCount > 0)
  ) {
    return {
      ok: true,
      connected: true,
      mode: 'offline-folder',
      folderPath: resolved,
      syncFilePath: path.join(resolved, 'agendamea-onedrive-sync.json'),
      lastSyncedAt: existing.mtimeIso,
    };
  }
  const syncFile = path.join(resolved, 'agendamea-onedrive-sync.json');
  const prevFile = path.join(resolved, 'agendamea-onedrive-previous.json');
  const dailyFile = path.join(resolved, `agendamea-backup-${getTodayStr()}.json`);
  if (fs.existsSync(syncFile) && existing && existing.filePath === syncFile) {
    try {
      fs.copyFileSync(syncFile, prevFile);
    } catch {
      // Ignore copy failure
    }
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'Agendamea',
    version: APP_VERSION,
    ...snapshot,
  };
  const jsonText = JSON.stringify(payload, null, 2);
  atomicWriteJsonFileOffline(syncFile, jsonText);
  if (!isLocalEmpty) {
    try {
      atomicWriteJsonFileOffline(dailyFile, jsonText);
      const dailies = fs
        .readdirSync(resolved)
        .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
        .sort()
        .reverse();
      for (const oldFile of dailies.slice(15)) {
        try {
          fs.rmSync(path.join(resolved, oldFile), { force: true });
        } catch {
          // Ignore old snapshot cleanup failure
        }
      }
    } catch {
      // Ignore rolling backup failure
    }
  }
  return {
    ok: true,
    connected: true,
    mode: 'offline-folder',
    folderPath: resolved,
    syncFilePath: syncFile,
    lastSyncedAt: payload.exportedAt,
  };
}

function flushOfflineAutoSync(db) {
  try {
    const settings = readSettingsOffline(db);
    if (settings.onedriveAutoSync && settings.onedriveCustomPath) {
      writeCloudSnapshotOffline(db, settings.onedriveCustomPath, false);
    }
  } catch {
    // Never fail primary mutation on background cloud sync error
  }
}

function findFirstExistingDirOffline(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Ignore inaccessible path
    }
  }
  return null;
}

function detectCloudProvidersOffline() {
  const home = os.homedir();
  const oneDriveRoot = findFirstExistingDirOffline([
    process.env.OneDriveConsumer,
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    path.join(home, 'OneDrive'),
  ]);
  const googleCandidates = [
    path.join(home, 'Google Drive'),
    path.join(home, 'My Drive'),
    path.join(home, "Drive'ım"),
  ];
  if (process.platform === 'win32') {
    for (const letter of ['G', 'H', 'I', 'D', 'E', 'F', 'J', 'K', 'M', 'Z']) {
      googleCandidates.push(`${letter}:\\My Drive`);
      googleCandidates.push(`${letter}:\\Drive'ım`);
      googleCandidates.push(`${letter}:\\Mon Drive`);
      googleCandidates.push(`${letter}:\\Meine Ablage`);
      googleCandidates.push(`${letter}:\\Mi unidad`);
    }
  }
  const googleDriveRoot = findFirstExistingDirOffline(googleCandidates);
  const iCloudRoot = findFirstExistingDirOffline([
    path.join(home, 'iCloudDrive'),
    path.join(home, 'iCloud Drive'),
    path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
  ]);
  const dropboxCandidates = [path.join(home, 'Dropbox'), path.join(home, 'Dropbox (Personal)')];
  for (const infoBase of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
    if (!infoBase) continue;
    try {
      const infoPath = path.join(infoBase, 'Dropbox', 'info.json');
      if (fs.existsSync(infoPath)) {
        const parsed = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        if (parsed?.personal?.path) dropboxCandidates.unshift(parsed.personal.path);
        if (parsed?.business?.path) dropboxCandidates.push(parsed.business.path);
      }
    } catch {
      // Ignore unreadable Dropbox metadata
    }
  }
  const dropboxRoot = findFirstExistingDirOffline(dropboxCandidates);
  return [
    {
      id: 'onedrive',
      label: 'OneDrive',
      folderPath: oneDriveRoot ? path.join(oneDriveRoot, 'Agendamea') : path.join(home, 'OneDrive', 'Agendamea'),
      detected: Boolean(oneDriveRoot),
    },
    {
      id: 'googledrive',
      label: 'Google Drive',
      folderPath: googleDriveRoot ? path.join(googleDriveRoot, 'Agendamea') : path.join(home, 'Google Drive', 'Agendamea'),
      detected: Boolean(googleDriveRoot),
    },
    {
      id: 'icloud',
      label: 'iCloud Drive',
      folderPath: iCloudRoot ? path.join(iCloudRoot, 'Agendamea') : path.join(home, 'iCloudDrive', 'Agendamea'),
      detected: Boolean(iCloudRoot),
    },
    {
      id: 'dropbox',
      label: 'Dropbox',
      folderPath: dropboxRoot ? path.join(dropboxRoot, 'Agendamea') : path.join(home, 'Dropbox', 'Agendamea'),
      detected: Boolean(dropboxRoot),
    },
  ];
}

function detectProviderForFolderOffline(folderPath, providers) {
  const normalized = path.resolve(folderPath).toLowerCase();
  for (const p of providers) {
    const pNorm = path.resolve(p.folderPath).toLowerCase();
    const pParent = path.dirname(pNorm);
    if (normalized === pNorm || normalized.startsWith(`${pParent}${path.sep}`)) return p.id;
  }
  if (normalized.includes('onedrive')) return 'onedrive';
  if (normalized.includes('google drive') || normalized.includes('my drive') || normalized.includes("drive'ım")) {
    return 'googledrive';
  }
  if (normalized.includes('icloud')) return 'icloud';
  if (normalized.includes('dropbox')) return 'dropbox';
  return 'custom';
}

const BLOCKED_WEBHOOK_HOSTS_OFFLINE = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  '[fd00:ec2::254]',
]);

function isValidWebhookUrlOffline(raw) {
  if (!raw) return false;
  try {
    const p = new URL(raw);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return false;
    const host = p.hostname.toLowerCase();
    if (BLOCKED_WEBHOOK_HOSTS_OFFLINE.has(host) || host.startsWith('169.254.')) return false;
    return true;
  } catch {
    return false;
  }
}

function assertSafeLocalSyncFolder(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) {
    throw new Error('Bulut senkronizasyon klasör yolu boş olamaz.');
  }
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
    throw new Error('Güvenlik nedeniyle ağ paylaşımı (UNC) yolları desteklenmemektedir.');
  }
  const resolved = path.resolve(trimmed);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error('Kök sürücü dizini doğrudan senkronizasyon klasörü olarak kullanılamaz.');
  }
  const winDir = (process.env.WINDIR || 'C:\\Windows').toLowerCase();
  if (resolved.toLowerCase() === winDir || resolved.toLowerCase().startsWith(`${winDir}\\`)) {
    throw new Error('Sistem klasörleri senkronizasyon klasörü olarak kullanılamaz.');
  }
  return resolved;
}

function parseWebhookUrlsOffline(rawUrl) {
  return String(rawUrl || '')
    .split(/[\r\n,]+/)
    .map((u) => u.trim())
    .filter((u) => isValidWebhookUrlOffline(u));
}

function isWebhookEventAllowedOffline(configuredEvents, event) {
  if (event === 'webhook.test') return true;
  const raw = String(configuredEvents || '').trim();
  if (!raw || raw === '*') return true;
  const allowed = raw
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0 || allowed.includes('*')) return true;
  const lower = String(event || '').toLowerCase();
  return allowed.some((pat) => (pat.endsWith('.*') ? lower.startsWith(pat.slice(0, -1)) : lower === pat));
}

function recordWebhookLogOffline(entry) {
  try {
    withOfflineDb((db) => {
      const id = `whlog-${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO webhook_logs (id, direction, event, target_url, status_code, ok, attempts, latency_ms, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        entry.direction === 'incoming' ? 'incoming' : 'outgoing',
        String(entry.event || 'unknown').slice(0, 100),
        String(entry.targetUrl || '').slice(0, 500),
        typeof entry.statusCode === 'number' ? entry.statusCode : null,
        entry.ok ? 1 : 0,
        Math.max(1, Number(entry.attempts) || 1),
        Math.max(0, Math.round(Number(entry.latencyMs) || 0)),
        String(entry.error || '').slice(0, 500),
        createdAt,
      );
      db.prepare(
        'DELETE FROM webhook_logs WHERE id NOT IN (SELECT id FROM webhook_logs ORDER BY created_at DESC LIMIT 200)',
      ).run();
    });
  } catch {
    // Ignore logging errors
  }
}

async function deliverSingleWebhookOffline(targetUrl, secret, event, data, maxAttempts = 2) {
  const startedAt = Date.now();
  const titlePreview =
    data && typeof data === 'object' && typeof data.title === 'string'
      ? `: ${data.title}`
      : data && typeof data === 'object' && typeof data.name === 'string'
        ? `: ${data.name}`
        : '';
  const summaryLine = `[Agendamea] ${event}${titlePreview}`;
  const bodyJson = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    app: 'Agendamea',
    version: APP_VERSION,
    content: summaryLine,
    text: summaryLine,
    data,
  });
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': `Agendamea-Webhook/${APP_VERSION}`,
    'X-Agendamea-Event': event,
  };
  const cleanSecret = String(secret || '').trim();
  if (cleanSecret) {
    const sig = crypto.createHmac('sha256', cleanSecret).update(bodyJson).digest('hex');
    headers['X-Agendamea-Signature'] = `sha256=${sig}`;
  }

  let lastResult = { ok: false, latencyMs: 0, attempts: 1, error: 'Webhook failed' };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(String(targetUrl).trim(), {
        method: 'POST',
        headers,
        body: bodyJson,
        signal: controller.signal,
      });
      lastResult = {
        ok: res.ok,
        statusCode: res.status,
        latencyMs: Date.now() - startedAt,
        attempts: attempt,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
      if (res.ok || (res.status >= 400 && res.status < 500)) break;
    } catch (err) {
      lastResult = {
        ok: false,
        latencyMs: Date.now() - startedAt,
        attempts: attempt,
        error: err instanceof Error ? err.message : 'Webhook failed',
      };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  recordWebhookLogOffline({
    direction: 'outgoing',
    event,
    targetUrl: String(targetUrl).trim(),
    statusCode: lastResult.statusCode ?? null,
    ok: lastResult.ok,
    attempts: lastResult.attempts,
    latencyMs: lastResult.latencyMs,
    error: lastResult.error || '',
  });
  return lastResult;
}

async function deliverWebhookOffline(targetUrlsRaw, secret, event, data) {
  const urls = parseWebhookUrlsOffline(targetUrlsRaw);
  if (urls.length === 0) {
    return { ok: false, latencyMs: 0, error: 'Invalid webhook URL (http/https required).' };
  }
  if (urls.length === 1) {
    return deliverSingleWebhookOffline(urls[0], secret, event, data, 2);
  }
  const startedAt = Date.now();
  const results = await Promise.all(
    urls.map(async (url) => {
      const r = await deliverSingleWebhookOffline(url, secret, event, data, 2);
      return { url, ok: r.ok, statusCode: r.statusCode, error: r.error };
    }),
  );
  const allOk = results.every((r) => r.ok);
  const firstFail = results.find((r) => !r.ok);
  return {
    ok: allOk,
    statusCode: results[0]?.statusCode,
    latencyMs: Date.now() - startedAt,
    error: firstFail?.error,
    results,
  };
}

async function dispatchConfiguredWebhookOffline(settings, event, data) {
  if (!settings?.webhookEnabled || !settings?.webhookUrl) return;
  if (!isWebhookEventAllowedOffline(settings.webhookEvents, event)) return;
  try {
    await deliverWebhookOffline(settings.webhookUrl, settings.webhookSecret || '', event, data);
  } catch {
    // Never fail primary offline mutation on webhook error
  }
}

const ICON_COLOR_MAP = {
  obsidian: { bg: '#18181b', fg: '#ffffff' },
  'obsidian-light': { bg: '#f4f4f5', fg: '#09090b' },
  slate: { bg: '#475569', fg: '#ffffff' },
  navy: { bg: '#1e3a8a', fg: '#ffffff' },
  blue: { bg: '#2563eb', fg: '#ffffff' },
  cyan: { bg: '#0891b2', fg: '#ffffff' },
  indigo: { bg: '#4f46e5', fg: '#ffffff' },
  purple: { bg: '#7c3aed', fg: '#ffffff' },
  pink: { bg: '#db2777', fg: '#ffffff' },
  red: { bg: '#dc2626', fg: '#ffffff' },
  orange: { bg: '#ea580c', fg: '#ffffff' },
  yellow: { bg: '#ca8a04', fg: '#09090b' },
  emerald: { bg: '#059669', fg: '#ffffff' },
  grass: { bg: '#16a34a', fg: '#ffffff' },
  lime: { bg: '#65a30d', fg: '#09090b' },
};

function syncOsSettingsBridge(patch, mergedSettings) {
  if (!patch || typeof patch !== 'object') return;
  const dataDir = getCandidateDataDirs()[0];
  if (!dataDir) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    // 1. Keep Electron window-prefs.json strictly in sync with SQLite preferences!
    if (
      patch.closeBehavior !== undefined ||
      patch.launchAtStartup !== undefined ||
      patch.globalQuickAddShortcut !== undefined ||
      patch.voiceShortcut !== undefined
    ) {
      const prefsPath = path.join(dataDir, 'window-prefs.json');
      let existing = {};
      try {
        if (fs.existsSync(prefsPath)) existing = JSON.parse(fs.readFileSync(prefsPath, 'utf8')) || {};
      } catch {
        existing = {};
      }
      const nextPrefs = {
        closeBehavior: mergedSettings.closeBehavior || existing.closeBehavior || 'ask',
        launchAtStartup:
          mergedSettings.launchAtStartup !== undefined
            ? Boolean(mergedSettings.launchAtStartup)
            : Boolean(existing.launchAtStartup),
        globalQuickAdd:
          mergedSettings.globalQuickAddShortcut !== undefined
            ? Boolean(mergedSettings.globalQuickAddShortcut)
            : existing.globalQuickAdd !== undefined
              ? Boolean(existing.globalQuickAdd)
              : true,
        voiceShortcut:
          typeof mergedSettings.voiceShortcut === 'string' && mergedSettings.voiceShortcut.trim()
            ? mergedSettings.voiceShortcut.trim()
            : typeof existing.voiceShortcut === 'string' && existing.voiceShortcut.trim()
              ? existing.voiceShortcut.trim()
              : 'CommandOrControl+Alt+Space',
      };
      fs.writeFileSync(prefsPath, JSON.stringify(nextPrefs, null, 2), 'utf8');

      // Update Windows HKCU Run registry key only in real user profile (never in isolated test dirs!)
      if (
        process.platform === 'win32' &&
        patch.launchAtStartup !== undefined &&
        !process.env.AGENDAMEA_DATA_DIR
      ) {
        const exeCandidates = [
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Agendamea', 'Agendamea.exe') : null,
          process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Agendamea', 'Agendamea.exe') : null,
        ].filter(Boolean);
        const appExe = exeCandidates.find((p) => fs.existsSync(p));
        if (appExe) {
          const regArgs = nextPrefs.launchAtStartup
            ? ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'Agendamea', '/t', 'REG_SZ', '/d', `"${appExe}" --minimized`, '/f']
            : ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'Agendamea', '/f'];
          execFile('reg.exe', regArgs, { windowsHide: true, timeout: 2500 }, () => {});
        }
      }
    }

    // 2. Regenerate dynamic .ico + active-icon.json immediately when icon/theme settings change!
    if (
      patch.appIconId !== undefined ||
      patch.customIconColor !== undefined ||
      patch.themeId !== undefined ||
      patch.customThemeColor !== undefined
    ) {
      const iconGenPath = path.resolve(__dirname, '..', 'electron', 'iconGenerator.cjs');
      if (fs.existsSync(iconGenPath)) {
        const iconGen = require(iconGenPath);
        const iconId = mergedSettings.appIconId || 'match-theme';
        let bg = '#18181b';
        let fg = '#ffffff';
        if (iconId === 'custom' && mergedSettings.customIconColor) {
          bg = mergedSettings.customIconColor;
        } else if (iconId === 'match-theme') {
          if (mergedSettings.themeId === 'custom' && mergedSettings.customThemeColor) {
            bg = mergedSettings.customThemeColor;
          } else if (ICON_COLOR_MAP[mergedSettings.themeId]) {
            bg = ICON_COLOR_MAP[mergedSettings.themeId].bg;
            fg = ICON_COLOR_MAP[mergedSettings.themeId].fg;
          }
        } else if (ICON_COLOR_MAP[iconId]) {
          bg = ICON_COLOR_MAP[iconId].bg;
          fg = ICON_COLOR_MAP[iconId].fg;
        }
        iconGen.ensureDynamicIconFiles(dataDir, bg, fg);
      }
    }
  } catch {
    // Non-critical OS sync must never break core setting persistence
  }
}

async function getBootstrap() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    return { mode: 'live-api', endpoint: baseUrl, bootstrap: boot };
  }
  return withOfflineDb((db, dbPath) => ({
    mode: 'offline-sqlite',
    endpoint: dbPath,
    bootstrap: getBootstrapOffline(db),
  }));
}

async function getPreferredLanguage() {
  if (process.env.AGENDAMEA_CLI_LANG) {
    return String(process.env.AGENDAMEA_CLI_LANG).trim().toLowerCase();
  }
  try {
    const { bootstrap } = await getBootstrap();
    if (typeof bootstrap?.settings?.language === 'string' && bootstrap.settings.language) {
      return bootstrap.settings.language.toLowerCase();
    }
  } catch {
    // Fall back to system locale
  }
  const sysLocale = Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || 'en';
  return String(sysLocale).toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

async function getStatus() {
  const { mode, endpoint, bootstrap } = await getBootstrap();
  const today = getTodayStr();
  const active = bootstrap.todos.filter((t) => !t.completed);
  return {
    ok: true,
    mode,
    endpoint,
    version: APP_VERSION,
    activeTasks: active.length,
    dueToday: active.filter((t) => isScheduledToday(t, today)).length,
    important: active.filter((t) => t.important).length,
    pinned: active.filter((t) => t.pinned).length,
    completedTasks: bootstrap.todos.filter((t) => t.completed).length,
    categories: bootstrap.categories.length,
    trashCount: bootstrap.trashedTodos.length + bootstrap.trashedCategories.length,
  };
}

async function listTasks(options = {}) {
  const { bootstrap } = await getBootstrap();
  return applyTaskFilters(bootstrap.todos, bootstrap.categories, options);
}

async function getTask(selector) {
  const { bootstrap } = await getBootstrap();
  const task = resolveTaskSelector(bootstrap.todos, selector);
  const category = task.categoryId
    ? bootstrap.categories.find((c) => c.id === task.categoryId) || null
    : null;
  return { ...task, categoryName: category ? category.name : null };
}

async function getMatrix() {
  const { bootstrap } = await getBootstrap();
  const today = getTodayStr();
  const active = orderActiveFirst(bootstrap.todos).filter((t) => !t.completed);
  const matrix = { q1: [], q2: [], q3: [], q4: [] };
  for (const todo of active) {
    const isImp = Boolean(todo.important || todo.priority === 'high');
    const isUrg = isScheduledToday(todo, today);
    if (isImp && isUrg) matrix.q1.push(todo);
    else if (isImp && !isUrg) matrix.q2.push(todo);
    else if (!isImp && isUrg) matrix.q3.push(todo);
    else matrix.q4.push(todo);
  }
  return matrix;
}

async function listCategories() {
  const { bootstrap } = await getBootstrap();
  const counts = new Map();
  for (const todo of bootstrap.todos) {
    if (!todo.completed && todo.categoryId) {
      counts.set(todo.categoryId, (counts.get(todo.categoryId) || 0) + 1);
    }
  }
  return bootstrap.categories.map((cat) => ({
    ...cat,
    activeTaskCount: counts.get(cat.id) || 0,
  }));
}

async function createCategory(input) {
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 60) : '';
  if (!name) throw new Error('Category name is required.');
  const color = normalizeHexColor(input?.color) || '#2563eb';
  const pinned = Boolean(input?.pinned);

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/categories', { name, color, pinned });
  }
  const { created, settings } = withOfflineDb((db) => {
    const id = `cat-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM categories WHERE deleted_at IS NULL')
      .get();
    const sortOrder = Number(maxRow?.maxOrder ?? -1) + 1;
    db.prepare(
      'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    ).run(id, name, color, pinned ? 1 : 0, sortOrder, now);
    const createdRow = mapCategoryRow(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
    flushOfflineAutoSync(db);
    return { created: createdRow, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'category.created', created);
  return created;
}

async function moveCategory(selector, targetPosition) {
  const pos = Number.parseInt(String(targetPosition), 10);
  if (!Number.isInteger(pos) || pos < 1) {
    throw new Error('Target position must be a positive integer (1, 2, 3...).');
  }
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const cats = [...boot.categories];
    const target = resolveCategorySelector(cats, selector);
    const remaining = cats.filter((c) => c.id !== target.id);
    const insertIdx = Math.min(pos - 1, remaining.length);
    remaining.splice(insertIdx, 0, target);
    const orderedIds = remaining.map((c) => c.id);
    await httpRequest(baseUrl, 'PATCH', '/api/categories/reorder', { orderedIds });
    return { ok: true, id: target.id, name: target.name, position: insertIdx + 1, orderedIds };
  }
  return withOfflineDb((db) => {
    const cats = db
      .prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at ASC')
      .all()
      .map(mapCategoryRow);
    const target = resolveCategorySelector(cats, selector);
    const remaining = cats.filter((c) => c.id !== target.id);
    const insertIdx = Math.min(pos - 1, remaining.length);
    remaining.splice(insertIdx, 0, target);
    const orderedIds = remaining.map((c) => c.id);
    const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    db.transaction(() => {
      orderedIds.forEach((id, idx) => stmt.run(idx, id));
    })();
    flushOfflineAutoSync(db);
    return { ok: true, id: target.id, name: target.name, position: insertIdx + 1, orderedIds };
  });
}

async function updateCategory(selector, patch) {
  const cleanPatch = {};
  if (typeof patch?.name === 'string' && patch.name.trim()) cleanPatch.name = patch.name.trim().slice(0, 60);
  if (typeof patch?.color === 'string') {
    const norm = normalizeHexColor(patch.color);
    if (norm) cleanPatch.color = norm;
  }
  if (typeof patch?.pinned === 'boolean') cleanPatch.pinned = patch.pinned;

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveCategorySelector(boot.categories, selector);
    let updated = target;
    if (Object.keys(cleanPatch).length > 0) {
      updated = await httpRequest(baseUrl, 'PATCH', `/api/categories/${encodeURIComponent(target.id)}`, cleanPatch);
    }
    if (patch?.position !== undefined) {
      await moveCategory(target.id, patch.position);
    }
    return updated;
  }
  const { updated, settings } = withOfflineDb((db) => {
    const cats = db
      .prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC')
      .all()
      .map(mapCategoryRow);
    const target = resolveCategorySelector(cats, selector);
    db.prepare('UPDATE categories SET name = ?, color = ?, pinned = ? WHERE id = ?').run(
      cleanPatch.name !== undefined ? cleanPatch.name : target.name,
      cleanPatch.color !== undefined ? cleanPatch.color : target.color,
      (cleanPatch.pinned !== undefined ? cleanPatch.pinned : target.pinned) ? 1 : 0,
      target.id,
    );
    flushOfflineAutoSync(db);
    return {
      updated: mapCategoryRow(db.prepare('SELECT * FROM categories WHERE id = ?').get(target.id)),
      settings: readSettingsOffline(db),
    };
  });
  if (patch?.position !== undefined) {
    await moveCategory(updated.id, patch.position);
  }
  await dispatchConfiguredWebhookOffline(settings, 'category.updated', updated);
  return updated;
}

async function deleteCategory(selector) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveCategorySelector(boot.categories, selector);
    await httpRequest(baseUrl, 'DELETE', `/api/categories/${encodeURIComponent(target.id)}`);
    return { ok: true, id: target.id, name: target.name, movedToTrash: true };
  }
  const { res, target, settings } = withOfflineDb((db) => {
    const cats = db
      .prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC')
      .all()
      .map(mapCategoryRow);
    const found = resolveCategorySelector(cats, selector);
    const now = new Date().toISOString();
    db.prepare('UPDATE categories SET deleted_at = ? WHERE id = ?').run(now, found.id);
    flushOfflineAutoSync(db);
    return {
      res: { ok: true, id: found.id, name: found.name, movedToTrash: true },
      target: { ...found, deletedAt: now },
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'category.deleted', target);
  return res;
}

async function addTask(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('Task title is required.');
  const { startDate, dueDate } = normalizeDateRange(input?.startDate, input?.dueDate);
  const dueTime = sanitizeDueTime(input?.dueTime);
  const tags = sanitizeTags(input?.tags);
  const subtasksInput = Array.isArray(input?.subtasks)
    ? input.subtasks
        .map((s) => (typeof s === 'string' ? { title: s.trim(), completed: false } : s))
        .filter((s) => s && typeof s.title === 'string' && s.title.trim())
        .map((s) => ({ title: s.title.trim().slice(0, 200), completed: Boolean(s.completed) }))
    : [];

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    let resolvedCategoryId = typeof input?.categoryId === 'string' && input.categoryId ? input.categoryId : null;
    if (!resolvedCategoryId && typeof input?.category === 'string' && input.category.trim()) {
      const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
      resolvedCategoryId = resolveCategorySelector(boot.categories, input.category.trim()).id;
    }
    return httpRequest(baseUrl, 'POST', '/api/todos', {
      title,
      notes: typeof input?.notes === 'string' ? input.notes : '',
      startDate,
      dueDate,
      dueTime,
      priority:
        input?.priority === 'high' || input?.priority === 'low' || input?.priority === 'normal'
          ? input.priority
          : 'normal',
      important: Boolean(input?.important),
      pinned: Boolean(input?.pinned),
      tags,
      categoryId: resolvedCategoryId,
      subtasks: subtasksInput,
    });
  }

  const { created, settings } = withOfflineDb((db) => {
    let resolvedCategoryId = typeof input?.categoryId === 'string' && input.categoryId ? input.categoryId : null;
    if (!resolvedCategoryId && typeof input?.category === 'string' && input.category.trim()) {
      const cats = db
        .prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC')
        .all()
        .map(mapCategoryRow);
      resolvedCategoryId = resolveCategorySelector(cats, input.category.trim()).id;
    }

    const id = `todo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const minRow = db
      .prepare('SELECT COALESCE(MIN(sort_order), 1) AS minOrder FROM todos WHERE deleted_at IS NULL')
      .get();
    const sortOrder = Number(minRow?.minOrder ?? 1) - 1;
    const priority =
      input?.priority === 'high' || input?.priority === 'low' || input?.priority === 'normal'
        ? input.priority
        : 'normal';

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO todos (id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        id,
        title,
        typeof input?.notes === 'string' ? input.notes : '',
        input?.important ? 1 : 0,
        input?.pinned ? 1 : 0,
        priority,
        startDate,
        dueDate,
        dueTime,
        JSON.stringify(tags),
        resolvedCategoryId,
        sortOrder,
        now,
        now,
      );
      const subStmt = db.prepare(
        'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, ?, ?)',
      );
      subtasksInput.forEach((sub, idx) => {
        subStmt.run(`sub-${crypto.randomUUID()}`, id, sub.title, sub.completed ? 1 : 0, idx);
      });
    });
    tx();

    const createdRow = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    const hydrated = attachSubtasksOffline(db, [createdRow])[0];
    flushOfflineAutoSync(db);
    return { created: hydrated, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'todo.created', created);
  return created;
}

async function moveTask(selector, targetPosition) {
  const pos = Number.parseInt(String(targetPosition), 10);
  if (!Number.isInteger(pos) || pos < 1) {
    throw new Error('Target position must be a positive integer (1, 2, 3...).');
  }
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const ordered = orderActiveFirst(boot.todos);
    const target = resolveTaskSelector(ordered, selector);
    const active = ordered.filter((t) => !t.completed);
    const completed = ordered.filter((t) => t.completed);
    const listToEdit = target.completed ? completed : active;
    const remaining = listToEdit.filter((t) => t.id !== target.id);
    const insertIdx = Math.min(pos - 1, remaining.length);
    remaining.splice(insertIdx, 0, target);
    const orderedIds = target.completed
      ? [...active.map((t) => t.id), ...remaining.map((t) => t.id)]
      : [...remaining.map((t) => t.id), ...completed.map((t) => t.id)];
    await httpRequest(baseUrl, 'PATCH', '/api/todos/reorder', { orderedIds });
    return { ok: true, id: target.id, title: target.title, position: insertIdx + 1, orderedIds };
  }
  return withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const ordered = orderActiveFirst(boot.todos);
    const target = resolveTaskSelector(ordered, selector);
    const active = ordered.filter((t) => !t.completed);
    const completed = ordered.filter((t) => t.completed);
    const listToEdit = target.completed ? completed : active;
    const remaining = listToEdit.filter((t) => t.id !== target.id);
    const insertIdx = Math.min(pos - 1, remaining.length);
    remaining.splice(insertIdx, 0, target);
    const orderedIds = target.completed
      ? [...active.map((t) => t.id), ...remaining.map((t) => t.id)]
      : [...remaining.map((t) => t.id), ...completed.map((t) => t.id)];
    const stmt = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');
    db.transaction(() => {
      orderedIds.forEach((id, idx) => stmt.run(idx, id));
    })();
    flushOfflineAutoSync(db);
    return { ok: true, id: target.id, title: target.title, position: insertIdx + 1, orderedIds };
  });
}

async function updateTask(selector, patch) {
  const cleanPatch = {};
  if (typeof patch?.title === 'string' && patch.title.trim()) cleanPatch.title = patch.title.trim();
  if (typeof patch?.notes === 'string') cleanPatch.notes = patch.notes;
  if (typeof patch?.completed === 'boolean') cleanPatch.completed = patch.completed;
  if (typeof patch?.important === 'boolean') cleanPatch.important = patch.important;
  if (typeof patch?.pinned === 'boolean') cleanPatch.pinned = patch.pinned;
  if (patch?.priority === 'high' || patch?.priority === 'normal' || patch?.priority === 'low') {
    cleanPatch.priority = patch.priority;
  }
  if (patch?.startDate === null || typeof patch?.startDate === 'string') cleanPatch.startDate = patch.startDate;
  if (patch?.dueDate === null || typeof patch?.dueDate === 'string') cleanPatch.dueDate = patch.dueDate;
  if (patch?.dueTime === null || typeof patch?.dueTime === 'string') {
    cleanPatch.dueTime = patch.dueTime === null ? null : sanitizeDueTime(patch.dueTime);
  }
  if (Array.isArray(patch?.tags)) cleanPatch.tags = sanitizeTags(patch.tags);
  if (patch?.categoryId === null || typeof patch?.categoryId === 'string') cleanPatch.categoryId = patch.categoryId;

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveTaskSelector(boot.todos, selector);
    if (typeof patch?.category === 'string') {
      cleanPatch.categoryId = patch.category.trim()
        ? resolveCategorySelector(boot.categories, patch.category.trim()).id
        : null;
    }
    let updated = target;
    if (Object.keys(cleanPatch).length > 0) {
      updated = await httpRequest(baseUrl, 'PATCH', `/api/todos/${encodeURIComponent(target.id)}`, cleanPatch);
    }
    if (patch?.position !== undefined) {
      await moveTask(target.id, patch.position);
    }
    return updated;
  }

  const { updated, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const target = resolveTaskSelector(boot.todos, selector);
    if (typeof patch?.category === 'string') {
      cleanPatch.categoryId = patch.category.trim()
        ? resolveCategorySelector(boot.categories, patch.category.trim()).id
        : null;
    }
    const nextRange = normalizeDateRange(
      cleanPatch.startDate !== undefined ? cleanPatch.startDate : target.startDate,
      cleanPatch.dueDate !== undefined ? cleanPatch.dueDate : target.dueDate,
    );
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE todos SET title = ?, notes = ?, completed = ?, important = ?, pinned = ?, priority = ?, start_date = ?, due_date = ?, due_time = ?, tags = ?, category_id = ?, updated_at = ? WHERE id = ?`,
    ).run(
      cleanPatch.title !== undefined ? cleanPatch.title : target.title,
      cleanPatch.notes !== undefined ? cleanPatch.notes : target.notes,
      (cleanPatch.completed !== undefined ? cleanPatch.completed : target.completed) ? 1 : 0,
      (cleanPatch.important !== undefined ? cleanPatch.important : target.important) ? 1 : 0,
      (cleanPatch.pinned !== undefined ? cleanPatch.pinned : target.pinned) ? 1 : 0,
      cleanPatch.priority !== undefined ? cleanPatch.priority : target.priority,
      nextRange.startDate,
      nextRange.dueDate,
      cleanPatch.dueTime !== undefined ? cleanPatch.dueTime : target.dueTime,
      JSON.stringify(cleanPatch.tags !== undefined ? cleanPatch.tags : target.tags || []),
      cleanPatch.categoryId !== undefined ? cleanPatch.categoryId : target.categoryId,
      now,
      target.id,
    );
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(target.id);
    const hydrated = attachSubtasksOffline(db, [row])[0];
    flushOfflineAutoSync(db);
    return { updated: hydrated, settings: readSettingsOffline(db) };
  });
  if (patch?.position !== undefined) {
    await moveTask(updated.id, patch.position);
  }
  await dispatchConfiguredWebhookOffline(
    settings,
    cleanPatch.completed === true ? 'todo.completed' : 'todo.updated',
    updated,
  );
  return updated;
}

async function completeTask(selector, completedOpt) {
  const { bootstrap } = await getBootstrap();
  const target = resolveTaskSelector(bootstrap.todos, selector);
  const nextCompleted = completedOpt === undefined ? !target.completed : Boolean(completedOpt);
  return updateTask(target.id, { completed: nextCompleted });
}

async function batchCompleteTasks(selectors, completedOpt) {
  const { bootstrap } = await getBootstrap();
  const targets = selectors.map((sel) => resolveTaskSelector(bootstrap.todos, sel));
  const seen = new Set();
  const results = [];
  for (const target of targets) {
    if (seen.has(target.id)) continue;
    seen.add(target.id);
    const nextCompleted = completedOpt === undefined ? !target.completed : Boolean(completedOpt);
    results.push(await updateTask(target.id, { completed: nextCompleted }));
  }
  return results;
}

async function pinTask(selector, pinnedOpt) {
  const { bootstrap } = await getBootstrap();
  const target = resolveTaskSelector(bootstrap.todos, selector);
  const nextPinned = pinnedOpt === undefined ? !target.pinned : Boolean(pinnedOpt);
  return updateTask(target.id, { pinned: nextPinned });
}

async function batchPinTasks(selectors, pinnedOpt) {
  const { bootstrap } = await getBootstrap();
  const targets = selectors.map((sel) => resolveTaskSelector(bootstrap.todos, sel));
  const seen = new Set();
  const results = [];
  for (const target of targets) {
    if (seen.has(target.id)) continue;
    seen.add(target.id);
    const nextPinned = pinnedOpt === undefined ? !target.pinned : Boolean(pinnedOpt);
    results.push(await updateTask(target.id, { pinned: nextPinned }));
  }
  return results;
}

async function batchDeleteTasks(selectors) {
  const { bootstrap } = await getBootstrap();
  const targets = selectors.map((sel) => resolveTaskSelector(bootstrap.todos, sel));
  const seen = new Set();
  const results = [];
  for (const target of targets) {
    if (seen.has(target.id)) continue;
    seen.add(target.id);
    results.push(await deleteTask(target.id));
  }
  return results;
}

async function deleteTask(selector) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveTaskSelector(boot.todos, selector);
    await httpRequest(baseUrl, 'DELETE', `/api/todos/${encodeURIComponent(target.id)}`);
    return { ok: true, id: target.id, title: target.title, movedToTrash: true };
  }
  const { result, target, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const found = resolveTaskSelector(boot.todos, selector);
    const now = new Date().toISOString();
    db.prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, found.id);
    flushOfflineAutoSync(db);
    return {
      result: { ok: true, id: found.id, title: found.title, movedToTrash: true },
      target: { ...found, deletedAt: now },
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'todo.deleted', target);
  return result;
}

async function clearCompleted(categoryOpt) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    let catId = null;
    if (typeof categoryOpt === 'string' && categoryOpt.trim()) {
      const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
      catId = resolveCategorySelector(boot.categories, categoryOpt.trim()).id;
    }
    const query = catId ? `?categoryId=${encodeURIComponent(catId)}` : '';
    const res = await httpRequest(baseUrl, 'DELETE', `/api/todos/completed${query}`);
    return { ok: true, clearedCount: Array.isArray(res?.trashedTodos) ? res.trashedTodos.length : 0 };
  }
  const { res, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    let catId = null;
    if (typeof categoryOpt === 'string' && categoryOpt.trim()) {
      catId = resolveCategorySelector(boot.categories, categoryOpt.trim()).id;
    }
    const now = new Date().toISOString();
    const info = catId
      ? db
          .prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL AND category_id = ?')
          .run(now, now, catId)
      : db
          .prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL')
          .run(now, now);
    flushOfflineAutoSync(db);
    return { res: { ok: true, clearedCount: info.changes, categoryId: catId }, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'todos.cleared_completed', res);
  return res;
}

async function addSubtask(taskSelector, title) {
  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 200) : '';
  if (!cleanTitle) throw new Error('Subtask title is required.');

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const task = resolveTaskSelector(boot.todos, taskSelector);
    return httpRequest(baseUrl, 'POST', `/api/todos/${encodeURIComponent(task.id)}/subtasks`, {
      title: cleanTitle,
    });
  }
  const { created, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM subtasks WHERE todo_id = ?')
      .get(task.id);
    const id = `sub-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, 0, ?)').run(
      id,
      task.id,
      cleanTitle,
      Number(maxRow?.maxOrder ?? -1) + 1,
    );
    const row = mapSubtaskRow(db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id));
    flushOfflineAutoSync(db);
    return { created: row, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'subtask.created', created);
  return created;
}

async function updateSubtask(taskSelector, subtaskSelector, patch) {
  const cleanPatch = {};
  if (typeof patch?.title === 'string' && patch.title.trim()) {
    cleanPatch.title = patch.title.trim().slice(0, 200);
  }
  if (typeof patch?.completed === 'boolean') {
    cleanPatch.completed = patch.completed;
  }
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    return httpRequest(baseUrl, 'PATCH', `/api/subtasks/${encodeURIComponent(sub.id)}`, cleanPatch);
  }
  const { updated, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    db.prepare('UPDATE subtasks SET title = ?, completed = ? WHERE id = ?').run(
      cleanPatch.title !== undefined ? cleanPatch.title : sub.title,
      (cleanPatch.completed !== undefined ? cleanPatch.completed : sub.completed) ? 1 : 0,
      sub.id,
    );
    flushOfflineAutoSync(db);
    return {
      updated: mapSubtaskRow(db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sub.id)),
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'subtask.updated', updated);
  return updated;
}

async function toggleSubtask(taskSelector, subtaskSelector, completedOpt) {
  const { bootstrap } = await getBootstrap();
  const task = resolveTaskSelector(bootstrap.todos, taskSelector);
  const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
  const nextCompleted = completedOpt === undefined ? !sub.completed : Boolean(completedOpt);
  return updateSubtask(task.id, sub.id, { completed: nextCompleted });
}

async function deleteSubtask(taskSelector, subtaskSelector) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    await httpRequest(baseUrl, 'DELETE', `/api/subtasks/${encodeURIComponent(sub.id)}`);
    return { ok: true, id: sub.id, title: sub.title };
  }
  const { res, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(sub.id);
    flushOfflineAutoSync(db);
    return { res: { ok: true, id: sub.id, title: sub.title }, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'subtask.deleted', res);
  return res;
}

async function listTrash(options = {}) {
  const { bootstrap } = await getBootstrap();
  const typeFilter = options.typeFilter || 'all';
  const sortBy = options.sortBy || 'newest';
  const qTr = normalizeSearchText(options.query || '');
  const qStd = String(options.query || '').toLowerCase().trim();
  const qTag = qTr.startsWith('#') ? qTr.slice(1) : qTr;
  const from = typeof options.dateFrom === 'string' && isValidIsoDate(options.dateFrom) ? options.dateFrom.trim() : '';
  const to = typeof options.dateTo === 'string' && isValidIsoDate(options.dateTo) ? options.dateTo.trim() : '';
  const minB = from && to && from > to ? to : from;
  const maxB = from && to && from > to ? from : to;

  const matchDelDate = (iso) => {
    if (!minB && !maxB) return true;
    if (!iso) return false;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return false;
    const key = formatLocalDate(dt);
    if (minB && key < minB) return false;
    if (maxB && key > maxB) return false;
    return true;
  };

  const sortItems = (items, getName) => {
    return [...items].sort((a, b) => {
      if (sortBy === 'oldest') return String(a.deletedAt || '').localeCompare(String(b.deletedAt || ''));
      if (sortBy === 'az') return String(getName(a) || '').localeCompare(String(getName(b) || ''), 'tr-TR');
      if (sortBy === 'za') return String(getName(b) || '').localeCompare(String(getName(a) || ''), 'tr-TR');
      return String(b.deletedAt || '').localeCompare(String(a.deletedAt || ''));
    });
  };

  const categories = sortItems(
    typeFilter === 'todos'
      ? []
      : (bootstrap.trashedCategories || []).filter((c) => {
          if (!matchDelDate(c.deletedAt)) return false;
          if (!qTr) return true;
          return normalizeSearchText(c.name).includes(qTr) || String(c.name).toLowerCase().includes(qStd);
        }),
    (c) => c.name,
  );

  const todos = sortItems(
    typeFilter === 'categories'
      ? []
      : (bootstrap.trashedTodos || []).filter((t) => {
          if (!matchDelDate(t.deletedAt)) return false;
          if (!qTr) return true;
          return (
            normalizeSearchText(t.title).includes(qTr) ||
            String(t.title).toLowerCase().includes(qStd) ||
            normalizeSearchText(t.notes).includes(qTr) ||
            (Array.isArray(t.tags) && t.tags.some((tg) => normalizeSearchText(tg).includes(qTag))) ||
            (Array.isArray(t.subtasks) && t.subtasks.some((s) => normalizeSearchText(s.title).includes(qTr)))
          );
        }),
    (t) => t.title,
  );

  return { categories, todos };
}

async function restoreItem(selectorOpt, itemType = 'auto') {
  const pickTarget = (boot) => {
    const trashedTodos = [...(boot.trashedTodos || [])].sort((a, b) =>
      String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')),
    );
    const trashedCats = [...(boot.trashedCategories || [])].sort((a, b) =>
      String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')),
    );
    const cleanSel = selectorOpt ? String(selectorOpt).trim() : '';

    if (itemType === 'category') {
      if (trashedCats.length === 0) throw new Error('No deleted categories in Trash.');
      return { kind: 'category', item: cleanSel ? resolveCategorySelector(trashedCats, cleanSel) : trashedCats[0] };
    }
    if (itemType === 'todo' || (trashedTodos.length > 0 && (!cleanSel || itemType === 'auto'))) {
      if (cleanSel) {
        try {
          return { kind: 'todo', item: resolveTaskSelector(trashedTodos, cleanSel) };
        } catch {
          if (itemType === 'auto' && trashedCats.length > 0) {
            return { kind: 'category', item: resolveCategorySelector(trashedCats, cleanSel) };
          }
          throw new Error(`Trashed item not found: "${cleanSel}".`);
        }
      }
      if (trashedTodos.length > 0) return { kind: 'todo', item: trashedTodos[0] };
    }
    if (trashedCats.length > 0) {
      return { kind: 'category', item: cleanSel ? resolveCategorySelector(trashedCats, cleanSel) : trashedCats[0] };
    }
    throw new Error('Trash is empty.');
  };

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const picked = pickTarget(boot);
    const pathUrl =
      picked.kind === 'category'
        ? `/api/categories/${encodeURIComponent(picked.item.id)}/restore`
        : `/api/todos/${encodeURIComponent(picked.item.id)}/restore`;
    const restored = await httpRequest(baseUrl, 'POST', pathUrl);
    return { kind: picked.kind, item: restored };
  }
  const { result, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const picked = pickTarget(boot);
    const now = new Date().toISOString();
    if (picked.kind === 'category') {
      db.prepare('UPDATE categories SET deleted_at = NULL WHERE id = ?').run(picked.item.id);
      const item = mapCategoryRow(db.prepare('SELECT * FROM categories WHERE id = ?').get(picked.item.id));
      flushOfflineAutoSync(db);
      return { result: { kind: 'category', item }, settings: readSettingsOffline(db) };
    }
    db.prepare('UPDATE todos SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, picked.item.id);
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(picked.item.id);
    const item = attachSubtasksOffline(db, [row])[0];
    flushOfflineAutoSync(db);
    return { result: { kind: 'todo', item }, settings: readSettingsOffline(db) };
  });
  if (result.kind === 'todo') {
    await dispatchConfiguredWebhookOffline(settings, 'todo.restored', result.item);
  } else if (result.kind === 'category') {
    await dispatchConfiguredWebhookOffline(settings, 'category.restored', result.item);
  }
  return result;
}

async function restoreLastTrashed(selectorOpt) {
  const res = await restoreItem(selectorOpt, 'auto');
  return res.item;
}

async function permanentDeleteItem(selector, itemType = 'auto') {
  const baseUrl = await resolveApiBaseUrl();
  const findInBoot = (boot) => {
    const trashedTodos = boot.trashedTodos || [];
    const trashedCats = boot.trashedCategories || [];
    if (itemType === 'category') {
      return { kind: 'category', item: resolveCategorySelector(trashedCats, selector) };
    }
    try {
      return { kind: 'todo', item: resolveTaskSelector(trashedTodos, selector) };
    } catch {
      if (itemType === 'auto' && trashedCats.length > 0) {
        return { kind: 'category', item: resolveCategorySelector(trashedCats, selector) };
      }
      throw new Error(`Trashed item not found: "${selector}".`);
    }
  };

  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const picked = findInBoot(boot);
    const endpoint =
      picked.kind === 'category'
        ? `/api/categories/${encodeURIComponent(picked.item.id)}/permanent`
        : `/api/todos/${encodeURIComponent(picked.item.id)}/permanent`;
    await httpRequest(baseUrl, 'DELETE', endpoint);
    return { ok: true, kind: picked.kind, id: picked.item.id, label: picked.item.title || picked.item.name };
  }
  return withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const picked = findInBoot(boot);
    if (picked.kind === 'category') {
      db.prepare('DELETE FROM categories WHERE id = ? AND deleted_at IS NOT NULL').run(picked.item.id);
    } else {
      db.prepare('DELETE FROM todos WHERE id = ? AND deleted_at IS NOT NULL').run(picked.item.id);
    }
    flushOfflineAutoSync(db);
    return { ok: true, kind: picked.kind, id: picked.item.id, label: picked.item.title || picked.item.name };
  });
}

async function emptyTrash() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'DELETE', '/api/trash');
  }
  const { res, settings } = withOfflineDb((db) => {
    const delTodos = db.prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL').run().changes;
    const delCats = db.prepare('DELETE FROM categories WHERE deleted_at IS NOT NULL').run().changes;
    flushOfflineAutoSync(db);
    return {
      res: { ok: true, deletedTodos: delTodos, deletedCategories: delCats },
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'trash.emptied', res);
  return res;
}

async function getSettings() {
  const { bootstrap } = await getBootstrap();
  return bootstrap.settings;
}

async function updateSettings(patch) {
  const baseUrl = await resolveApiBaseUrl();
  let updated;
  if (baseUrl) {
    updated = await httpRequest(baseUrl, 'PATCH', '/api/settings', patch);
  } else {
    updated = withOfflineDb((db) => {
      db.transaction(() => {
        writeSettingsPatchOffline(db, patch);
      })();
      return readSettingsOffline(db);
    });
  }
  syncOsSettingsBridge(patch, updated);
  return updated;
}

async function exportBackup(outFilePath) {
  const { bootstrap } = await getBootstrap();
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'Agendamea',
    version: APP_VERSION,
    ...bootstrap,
  };
  if (typeof outFilePath === 'string' && outFilePath.trim()) {
    const resolved = path.resolve(outFilePath.trim());
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, filePath: resolved, todos: bootstrap.todos.length, categories: bootstrap.categories.length };
  }
  return payload;
}

async function importBackup(payloadOrFilePath) {
  let payload = payloadOrFilePath;
  if (typeof payloadOrFilePath === 'string') {
    const resolved = path.resolve(payloadOrFilePath.trim());
    if (!fs.existsSync(resolved)) throw new Error(`Backup file not found: ${resolved}`);
    payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid JSON backup payload.');
  }

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/import', payload);
  }

  const { restored, settings } = withOfflineDb((db) => {
    const now = new Date().toISOString();
    const allCats = [
      ...(Array.isArray(payload.categories) ? payload.categories.map((c) => ({ ...c, _t: false })) : []),
      ...(Array.isArray(payload.trashedCategories) ? payload.trashedCategories.map((c) => ({ ...c, _t: true })) : []),
    ];
    const allTodos = [
      ...(Array.isArray(payload.todos) ? payload.todos.map((t) => ({ ...t, _t: false })) : []),
      ...(Array.isArray(payload.trashedTodos) ? payload.trashedTodos.map((t) => ({ ...t, _t: true })) : []),
    ];

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM todo_embedding_chunks').run();
      db.prepare('DELETE FROM subtasks').run();
      db.prepare('DELETE FROM todos').run();
      db.prepare('DELETE FROM categories').run();

      const validCatIds = new Set();
      const catStmt = db.prepare(
        'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      allCats.forEach((c, idx) => {
        if (!c || typeof c.name !== 'string' || !c.name.trim()) return;
        const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `cat-${crypto.randomUUID()}`;
        if (validCatIds.has(id)) return;
        validCatIds.add(id);
        catStmt.run(
          id,
          c.name.trim().slice(0, 60),
          normalizeHexColor(c.color) || '#2563eb',
          c.pinned ? 1 : 0,
          Number.isFinite(Number(c.sortOrder)) ? Math.trunc(Number(c.sortOrder)) : idx,
          typeof c.createdAt === 'string' ? c.createdAt : now,
          c._t || c.deletedAt ? (typeof c.deletedAt === 'string' ? c.deletedAt : now) : null,
        );
      });

      const seenTodoIds = new Set();
      const todoStmt = db.prepare(
        `INSERT INTO todos (id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const subStmt = db.prepare(
        'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, ?, ?)',
      );
      allTodos.forEach((t, idx) => {
        if (!t || typeof t.title !== 'string' || !t.title.trim()) return;
        const id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `todo-${crypto.randomUUID()}`;
        if (seenTodoIds.has(id)) return;
        seenTodoIds.add(id);
        const norm = normalizeDateRange(t.startDate, t.dueDate);
        const catId = typeof t.categoryId === 'string' && validCatIds.has(t.categoryId) ? t.categoryId : null;
        todoStmt.run(
          id,
          t.title.trim().slice(0, 300),
          typeof t.notes === 'string' ? t.notes.slice(0, 10000) : '',
          t.completed ? 1 : 0,
          t.important ? 1 : 0,
          t.pinned ? 1 : 0,
          t.priority === 'high' || t.priority === 'low' ? t.priority : 'normal',
          norm.startDate,
          norm.dueDate,
          sanitizeDueTime(t.dueTime),
          JSON.stringify(sanitizeTags(t.tags)),
          catId,
          Number.isFinite(Number(t.sortOrder)) ? Math.trunc(Number(t.sortOrder)) : idx,
          typeof t.createdAt === 'string' ? t.createdAt : now,
          typeof t.updatedAt === 'string' ? t.updatedAt : now,
          t._t || t.deletedAt ? (typeof t.deletedAt === 'string' ? t.deletedAt : now) : null,
        );
        if (Array.isArray(t.subtasks)) {
          t.subtasks.forEach((s, sIdx) => {
            if (!s || typeof s.title !== 'string' || !s.title.trim()) return;
            subStmt.run(
              typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `sub-${crypto.randomUUID()}`,
              id,
              s.title.trim().slice(0, 200),
              s.completed ? 1 : 0,
              sIdx,
            );
          });
        }
      });

      if (payload.settings && typeof payload.settings === 'object') {
        writeSettingsPatchOffline(db, payload.settings);
      }
      db.exec("INSERT INTO todos_fts(todos_fts) VALUES('rebuild')");
    });
    tx();
    const restored = getBootstrapOffline(db);
    flushOfflineAutoSync(db);
    return { restored, settings: restored.settings };
  });
  await dispatchConfiguredWebhookOffline(settings, 'backup.imported', {
    todos: restored.todos.length,
    categories: restored.categories.length,
  });
  return restored;
}

async function getCloudStatus() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', '/api/onedrive/status');
  }
  return withOfflineDb((db) => {
    const settings = readSettingsOffline(db);
    const detectedProviders = detectCloudProvidersOffline();
    const folder = (settings.onedriveCustomPath || '').trim();
    const connected = folder.length > 0;
    const firstDetected = detectedProviders.find((p) => p.detected);
    const resolvedFolder = connected
      ? path.resolve(folder)
      : firstDetected
        ? firstDetected.folderPath
        : null;
    const validBackup = resolvedFolder ? readValidCloudBackupOffline(resolvedFolder) : null;
    const candidates = resolvedFolder ? listCloudBackupFilesOffline(resolvedFolder) : [];
    return {
      available: true,
      connected,
      mode: connected ? 'offline-folder' : 'none',
      folderPath: resolvedFolder,
      syncFilePath: resolvedFolder ? path.join(resolvedFolder, 'agendamea-onedrive-sync.json') : null,
      lastSyncedAt: validBackup ? validBackup.mtimeIso : null,
      autoSync: Boolean(settings.onedriveAutoSync),
      hasRemoteBackup: Boolean(validBackup),
      remoteTodoCount: validBackup ? validBackup.todoCount : 0,
      remoteCategoryCount: validBackup ? validBackup.categoryCount : 0,
      backupFilesCount: candidates.length,
      activeProvider: connected ? detectProviderForFolderOffline(resolvedFolder, detectedProviders) : null,
      detectedProviders,
    };
  });
}

async function connectCloud(folderPath, autoSync = true) {
  const cleanFolder = typeof folderPath === 'string' ? folderPath.trim() : '';
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/onedrive/connect', {
      ...(cleanFolder ? { folderPath: cleanFolder } : {}),
      autoSync: Boolean(autoSync),
    });
  }
  let resolved = cleanFolder ? assertSafeLocalSyncFolder(cleanFolder) : '';
  if (!resolved) {
    const detected = detectCloudProvidersOffline().find((p) => p.detected);
    if (detected) {
      resolved = detected.folderPath;
    } else {
      const baseDataDir = getCandidateDataDirs()[0];
      if (!baseDataDir) {
        throw new Error('No cloud provider detected. Pass an explicit folder: ag sync set "<folder>"');
      }
      resolved = path.join(baseDataDir, 'OneDrive-Agendamea');
    }
  }
  return withOfflineDb((db) => {
    db.transaction(() => {
      writeSettingsPatchOffline(db, {
        onedriveCustomPath: resolved,
        onedriveAutoSync: Boolean(autoSync),
      });
    })();
    fs.mkdirSync(resolved, { recursive: true });
    return writeCloudSnapshotOffline(db, resolved, false);
  });
}

async function disconnectCloud() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/onedrive/disconnect');
  }
  return withOfflineDb((db) => {
    db.transaction(() => {
      writeSettingsPatchOffline(db, { onedriveCustomPath: '', onedriveAutoSync: false });
    })();
    return { ok: true, connected: false, mode: 'none', folderPath: null, autoSync: false };
  });
}

async function syncCloud() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/onedrive/sync-push');
  }
  return withOfflineDb((db) => {
    const settings = readSettingsOffline(db);
    const folder = (settings.onedriveCustomPath || '').trim();
    if (!folder) {
      throw new Error('No cloud sync folder configured yet. Run: ag sync set "<folder>" or ag sync auto');
    }
    return writeCloudSnapshotOffline(db, folder, true);
  });
}

async function pullCloud() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/onedrive/sync-pull');
  }
  const folder = withOfflineDb((db) => (readSettingsOffline(db).onedriveCustomPath || '').trim());
  if (!folder) {
    throw new Error('No cloud sync folder configured yet. Run: ag sync set "<folder>"');
  }
  const validBackup = readValidCloudBackupOffline(path.resolve(folder));
  if (!validBackup) {
    throw new Error(`No valid cloud backup found in ${path.resolve(folder)}`);
  }
  const bootstrap = await importBackup(validBackup.payload);
  const status = await getCloudStatus();
  return { ok: true, status, bootstrap };
}

async function resetAllData(options = {}) {
  const resetSettings = Boolean(options?.resetSettings);
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/reset', { resetSettings });
  }
  const { fresh, settingsBefore } = withOfflineDb((db) => {
    const before = readSettingsOffline(db);
    const currentLang = before.language || 'tr';
    db.transaction(() => {
      db.prepare('DELETE FROM todo_embedding_chunks').run();
      db.prepare('DELETE FROM subtasks').run();
      db.prepare('DELETE FROM todos').run();
      db.prepare('DELETE FROM categories').run();
      db.exec("INSERT INTO todos_fts(todos_fts) VALUES('rebuild')");
      if (resetSettings) {
        db.prepare('DELETE FROM settings').run();
        ensureOfflineSchema(db);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('language', currentLang);
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('onboardingCompleted', '1');
      }
    })();
    return { fresh: getBootstrapOffline(db), settingsBefore: before };
  });
  await dispatchConfiguredWebhookOffline(settingsBefore, 'data.reset', { resetSettings });
  return fresh;
}

async function testWebhook(urlOverride, secretOverride) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/webhooks/test', {
      ...(urlOverride ? { url: urlOverride } : {}),
      ...(secretOverride !== undefined ? { secret: secretOverride } : {}),
    });
  }
  const settings = await getSettings();
  const targetUrl = (urlOverride || settings.webhookUrl || '').trim();
  const secret = (secretOverride !== undefined ? secretOverride : settings.webhookSecret || '').trim();
  if (!targetUrl) {
    throw new Error('No webhook URL configured. Run: ag hook set <url>');
  }
  return deliverWebhookOffline(targetUrl, secret, 'webhook.test', {
    title: 'Agendamea Webhook Test',
    mode: 'offline-cli',
  });
}

async function getWebhookLogs(limit = 30) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 30)));
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', `/api/webhooks/logs?limit=${safeLimit}`);
  }
  return withOfflineDb((db) => {
    const rows = db.prepare('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT ?').all(safeLimit);
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction === 'incoming' ? 'incoming' : 'outgoing',
      event: r.event,
      targetUrl: r.target_url,
      statusCode: r.status_code,
      ok: Boolean(r.ok),
      attempts: Number(r.attempts) || 1,
      latencyMs: Number(r.latency_ms) || 0,
      error: r.error || '',
      createdAt: r.created_at,
    }));
  });
}

async function clearWebhookLogs() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'DELETE', '/api/webhooks/logs');
  }
  return withOfflineDb((db) => {
    const cleared = db.prepare('DELETE FROM webhook_logs').run().changes;
    return { ok: true, cleared };
  });
}

async function getCalendarAgenda(options = {}) {
  const { bootstrap } = await getBootstrap();
  const list = applyTaskFilters(bootstrap.todos, bootstrap.categories, {
    filter: options.includeCompleted ? 'all' : 'active',
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    sortBy: 'dueDate',
  });
  const grouped = {};
  const undated = [];
  for (const todo of list) {
    const key = todo.dueDate || todo.startDate || null;
    if (!key) {
      undated.push(todo);
    } else {
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(todo);
    }
  }
  const orderedGrouped = {};
  for (const key of Object.keys(grouped).sort()) {
    orderedGrouped[key] = grouped[key];
  }
  return { grouped: orderedGrouped, undated };
}

async function getKanbanBoard(groupBy = 'priority') {
  const { bootstrap } = await getBootstrap();
  if (groupBy === 'status') {
    const ordered = orderActiveFirst(bootstrap.todos);
    return {
      groupBy: 'status',
      columns: {
        active: ordered.filter((t) => !t.completed),
        completed: ordered.filter((t) => t.completed),
      },
    };
  }
  const active = orderActiveFirst(bootstrap.todos).filter((t) => !t.completed);
  return {
    groupBy: 'priority',
    columns: {
      high: active.filter((t) => t.priority === 'high'),
      normal: active.filter((t) => t.priority === 'normal'),
      low: active.filter((t) => t.priority === 'low'),
    },
  };
}

async function checkForUpdates() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', '/api/update-check?force=1');
  }
  const checkedAt = new Date().toISOString();
  const releasesHtml = 'https://github.com/emirtdede/agendamea/releases/latest';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch('https://api.github.com/repos/emirtdede/agendamea/releases/latest', {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Agendamea/${APP_VERSION} (Vellium)`,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        updateAvailable: false,
        releaseUrl: releasesHtml,
        checkedAt,
        error: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return releaseUtils.parseGitHubRelease(data, APP_VERSION, releasesHtml, checkedAt);
  } catch (err) {
    return {
      ok: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      updateAvailable: false,
      releaseUrl: releasesHtml,
      checkedAt,
      error: err instanceof Error ? err.message : 'Update check failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

function findAvailableLoopbackPort(preferred = 38721) {
  const candidates = preferred && preferred > 0 ? [preferred, 47821, 39721, 41721, 0] : [38721, 47821, 39721, 41721, 0];
  const tryNext = (list) =>
    new Promise((resolve, reject) => {
      const [port, ...rest] = list.length > 0 ? list : [0];
      const srv = net.createServer();
      srv.unref();
      srv.once('error', (err) => {
        if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && port !== 0) {
          resolve(tryNext(rest));
        } else {
          reject(err);
        }
      });
      srv.listen(port, '127.0.0.1', () => {
        const addr = srv.address();
        const chosen = typeof addr === 'object' && addr ? addr.port : 38721;
        srv.close(() => resolve(chosen));
      });
    });
  return tryNext(candidates);
}

function readRuntimePortMeta() {
  const dir = getCandidateDataDirs()[0];
  if (!dir) return null;
  const portFile = path.join(dir, 'runtime-port.json');
  try {
    if (!fs.existsSync(portFile)) return null;
    return { portFile, ...JSON.parse(fs.readFileSync(portFile, 'utf8')) };
  } catch {
    return null;
  }
}

async function getHeadlessServerStatus() {
  const baseUrl = await resolveApiBaseUrl();
  const meta = readRuntimePortMeta();
  if (baseUrl) {
    const portMatch = /:(\d+)$/.exec(baseUrl);
    const port = portMatch ? Number(portMatch[1]) : meta?.port || null;
    return {
      running: true,
      headless: Boolean(meta?.headless),
      pid: meta?.pid || null,
      port,
      url: baseUrl,
      incomingWebhookUrl: `${baseUrl}/api/webhook/incoming`,
    };
  }
  return {
    running: false,
    headless: false,
    pid: null,
    port: null,
    url: null,
    incomingWebhookUrl: null,
  };
}

function resolveServerSpawnSpec() {
  const appRoot = path.resolve(__dirname, '..');
  const builtServer = path.join(appRoot, 'dist-server', 'server.mjs');
  if (fs.existsSync(builtServer)) {
    return { appRoot, args: [builtServer] };
  }
  const tsxCli = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const devServer = path.join(appRoot, 'server.ts');
  if (fs.existsSync(tsxCli) && fs.existsSync(devServer)) {
    return { appRoot, args: [tsxCli, devServer] };
  }
  throw new Error('Could not locate Agendamea server bundle (dist-server/server.mjs).');
}

async function startHeadlessServer(options = {}) {
  const existing = await getHeadlessServerStatus();
  if (existing.running && !options.forceNew) {
    return { ok: true, alreadyRunning: true, ...existing };
  }
  const dataDir = getCandidateDataDirs()[0];
  if (!dataDir) throw new Error('Could not resolve Agendamea data directory.');
  fs.mkdirSync(dataDir, { recursive: true });

  const requestedPort = options.port !== undefined && options.port !== null ? Number(options.port) : 38721;
  const port = await findAvailableLoopbackPort(Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 38721);
  const { appRoot, args } = resolveServerSpawnSpec();

  const childEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    AGENDAMEA_DATA_DIR: dataDir,
    AGENDAMEA_APP_ROOT: appRoot,
    AGENDAMEA_HEADLESS_DAEMON: '1',
  };
  delete childEnv.AGENDAMEA_FORCE_OFFLINE;

  if (options.foreground) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: appRoot,
        env: childEnv,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', (code) => resolve({ ok: code === 0, exited: true, exitCode: code ?? 0, port }));
    });
  }

  const child = spawn(process.execPath, args, {
    cwd: appRoot,
    env: childEnv,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const baseUrl = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let i = 0; i < 45; i += 1) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 400);
      const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // Wait for boot
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!healthy) {
    throw new Error(`Headless server failed to start on ${baseUrl}`);
  }
  return {
    ok: true,
    running: true,
    headless: true,
    pid: child.pid,
    port,
    url: baseUrl,
    incomingWebhookUrl: `${baseUrl}/api/webhook/incoming`,
  };
}

async function stopHeadlessServer() {
  const meta = readRuntimePortMeta();
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl && meta?.headless) {
    try {
      await httpRequest(baseUrl, 'POST', '/api/server/shutdown');
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 80));
        const stillUp = await resolveApiBaseUrl();
        if (!stillUp) break;
      }
      return { ok: true, stopped: true, pid: meta.pid || null, port: meta.port || null };
    } catch {
      // Fall back to direct PID kill below
    }
  }
  if (meta?.headless && Number.isInteger(meta.pid)) {
    try {
      process.kill(meta.pid);
    } catch {
      // Already exited
    }
    try {
      if (meta.portFile && fs.existsSync(meta.portFile)) fs.rmSync(meta.portFile, { force: true });
    } catch {
      // Ignore cleanup failure
    }
    return { ok: true, stopped: true, pid: meta.pid, port: meta.port || null };
  }
  if (baseUrl) {
    return {
      ok: false,
      stopped: false,
      error: 'A live desktop GUI server is running (not a headless daemon). Close the desktop app or pass AGENDAMEA_FORCE_OFFLINE=1.',
    };
  }
  return { ok: true, stopped: false, message: 'No headless server is currently running.' };
}

async function installCli(options = {}) {
  return cliInstaller.installCliShims({
    runtimeRoot: path.resolve(__dirname, '..'),
    ...options,
  });
}

async function uninstallCli(options = {}) {
  return cliInstaller.uninstallCliShims(options);
}

function getModelsDir() {
  const baseDir = getCandidateDataDirs()[0] || path.join(os.homedir(), 'AppData', 'Roaming', 'Agendamea');
  return path.join(baseDir, 'models');
}

async function getAiStatus(options = {}) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const qs = options.force ? '?force=1' : '';
    return httpRequest(baseUrl, 'GET', `/api/ai/status${qs}`);
  }
  const dataDir = getCandidateDataDirs()[0] || os.homedir();
  const modelsDir = getModelsDir();
  const manager = new ModelManager({ modelsDir });
  const [hardware, external] = await Promise.all([
    hardwareProfiler.profileHardware({ targetDir: dataDir }),
    aiCatalog.detectExternalBackends(),
  ]);
  const recommendation = aiCatalog.selectTierRecommendation(hardware, external);
  const ragIndexedChunks = withOfflineDb((db) => {
    try {
      return Number(db.prepare('SELECT COUNT(*) as c FROM todo_embedding_chunks').get()?.c || 0);
    } catch {
      return 0;
    }
  });
  const settings = await getSettings();
  return {
    mode: 'offline-sqlite',
    hardware,
    recommendation,
    models: manager.listModelsStatus(),
    installedDiskBytes: manager.getInstalledDiskUsageBytes(),
    ragIndexedChunks,
    settings,
  };
}

async function listAiModels() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', '/api/ai/models');
  }
  const modelsDir = getModelsDir();
  const manager = new ModelManager({ modelsDir });
  return {
    modelsDir,
    installedDiskBytes: manager.getInstalledDiskUsageBytes(),
    models: manager.listModelsStatus(),
  };
}

async function downloadAiModel(targetId) {
  const clean = String(targetId || '').trim();
  if (!clean) throw new Error('Model ID or tier (tier-light|tier-medium|tier-strong) is required.');
  const modelIds = aiCatalog.TIER_BUNDLES[clean]
    ? aiCatalog.getTierBundle(clean).modelIds
    : [clean];
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const results = [];
    for (const id of modelIds) {
      results.push(
        await httpRequest(
          baseUrl,
          'POST',
          `/api/ai/models/${encodeURIComponent(id)}/download?sync=1`,
          { sync: true },
          0,
        ),
      );
    }
    return modelIds.length === 1 ? results[0] : { ok: results.every((r) => r.ok), results };
  }
  const manager = new ModelManager({ modelsDir: getModelsDir() });
  const results = [];
  for (const id of modelIds) {
    results.push(await manager.downloadModel(id));
  }
  return modelIds.length === 1 ? results[0] : { ok: results.every((r) => r.ok), results };
}

async function deleteAiModel(targetId) {
  const clean = String(targetId || '').trim();
  if (!clean) throw new Error('Model ID (or "all") is required.');
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'DELETE', `/api/ai/models/${encodeURIComponent(clean)}`);
  }
  const manager = new ModelManager({ modelsDir: getModelsDir() });
  return clean === 'all' ? manager.deleteAllModels() : manager.deleteModel(clean);
}

function searchRagOfflineDb(db, query, options = {}) {
  return sqliteCore.searchHybridRagCore(db, query, {
    ...options,
    vectorHits: [],
    getActiveTodos: () =>
      db
        .prepare('SELECT * FROM todos WHERE deleted_at IS NULL')
        .all()
        .map((row) => mapTodoRow(row, [])),
    getTodoById: (id) => {
      const row = db.prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL').get(id);
      return row ? mapTodoRow(row, []) : null;
    },
  });
}

async function semanticSearchRag(query, options = {}) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const topK = Number(options.topK) || 5;
    const minScore = options.minScore !== undefined ? Number(options.minScore) : 0.35;
    return httpRequest(baseUrl, 'POST', '/api/ai/rag/search', { query, topK, minScore });
  }
  return withOfflineDb((db) => searchRagOfflineDb(db, query, options));
}

async function askAiAssistant(text, options = {}) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/ai/ask', {
      text,
      language: options.language,
      readOnly: Boolean(options.readOnly),
      confirmToken: options.confirmToken || undefined,
      selectedTodoId: options.selectedTodoId || undefined,
    });
  }
  const lang = options.language || (await getPreferredLanguage());
  const orchestrator = new VoiceOrchestrator();
  return orchestrator.handleUtterance({
    text,
    language: lang,
    readOnly: Boolean(options.readOnly),
    confirmToken: options.confirmToken || null,
    selectedTodoId: options.selectedTodoId || null,
    storeAdapter: {
      getTodoById: async (id) => getTask(id),
      listToday: async () => listTasks({ filter: 'today' }),
      addTask: async (input) => addTask(input),
      completeTask: async (selector, completed) => completeTask(selector, completed),
      deleteTask: async (selector) => deleteTask(selector),
      undoTrash: async () => restoreLastTrashed(),
      clearCompleted: async () => clearCompleted(),
      emptyTrash: async () => emptyTrash(),
    },
    ragSearchFn: async (q, opts) => semanticSearchRag(q, opts),
  });
}

module.exports = {
  APP_VERSION,
  ABI_FALLBACK_EXIT_CODE,
  getTodayStr,
  getTomorrowStr,
  getPreferredLanguage,
  getStatus,
  getMatrix,
  getCalendarAgenda,
  getKanbanBoard,
  listTasks,
  getTask,
  addTask,
  updateTask,
  moveTask,
  completeTask,
  batchCompleteTasks,
  pinTask,
  batchPinTasks,
  deleteTask,
  batchDeleteTasks,
  clearCompleted,
  addSubtask,
  updateSubtask,
  toggleSubtask,
  deleteSubtask,
  listCategories,
  createCategory,
  updateCategory,
  moveCategory,
  deleteCategory,
  listTrash,
  restoreItem,
  restoreLastTrashed,
  permanentDeleteItem,
  emptyTrash,
  getSettings,
  updateSettings,
  exportBackup,
  importBackup,
  getCloudStatus,
  connectCloud,
  disconnectCloud,
  syncCloud,
  pullCloud,
  resetAllData,
  testWebhook,
  getWebhookLogs,
  clearWebhookLogs,
  checkForUpdates,
  getHeadlessServerStatus,
  startHeadlessServer,
  stopHeadlessServer,
  installCli,
  uninstallCli,
  getAiStatus,
  listAiModels,
  downloadAiModel,
  deleteAiModel,
  semanticSearchRag,
  askAiAssistant,
};
