'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sqliteCore = require('../sqliteCore.cjs');
const settingsCodec = require('../settingsCodec.cjs');
const todoRepository = require('../todoRepository.cjs');
const { getCandidateDataDirs, resolveApiBaseUrl, httpRequest } = require('./httpTransport.cjs');

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
    path.resolve(__dirname, '..', '..', 'node_modules', 'better-sqlite3'),
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
    const err = /** @type {Error & { code?: string }} */ (
      new Error(
        'Agendamea desktop app is not running (offline SQLite driver unavailable in current Node ABI).',
      )
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

const mapCategoryRow = todoRepository.mapCategoryRow;
const mapSubtaskRow = todoRepository.mapSubtaskRow;
const mapTodoRow = todoRepository.mapTodoRow;

function attachSubtasksOffline(db, todoRows) {
  return todoRepository.attachSubtasks(db, todoRows);
}

function readSettingsOffline(db) {
  return settingsCodec.readSettingsFromDb(db);
}

function writeSettingsPatchOffline(db, patch) {
  settingsCodec.applySettingsPatchToDb(db, patch, {
    validateSyncFolder: assertSafeLocalSyncFolder,
    strictWebhookUrl: false,
  });
}

function getBootstrapOffline(db) {
  return todoRepository.getBootstrapSnapshot(db, readSettingsOffline);
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
    const baseUrl = await resolveApiBaseUrl();
    if (baseUrl) {
      const settings = await httpRequest(baseUrl, 'GET', '/api/settings');
      if (typeof settings?.language === 'string' && settings.language) {
        return settings.language.toLowerCase();
      }
    } else {
      const lang = withOfflineDb((db) => {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'language'").get();
        return typeof row?.value === 'string' && row.value ? row.value.toLowerCase() : null;
      });
      if (lang) return lang;
    }
  } catch {
    // Fall back to system locale
  }
  const sysLocale = Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || 'en';
  return String(sysLocale).toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

module.exports = {
  assertSafeLocalSyncFolder,
  resolveSqliteDatabasePath,
  loadBetterSqlite3,
  ensureOfflineSchema,
  withOfflineDb,
  mapCategoryRow,
  mapSubtaskRow,
  mapTodoRow,
  attachSubtasksOffline,
  readSettingsOffline,
  writeSettingsPatchOffline,
  getBootstrapOffline,
  getBootstrap,
  getPreferredLanguage,
};
