'use strict';

/**
 * View-Aware CLI Selector Snapshot (`cli-last-view.json`).
 * Ensures `ag bugun` -> `ag ok 1` / `ag rm 1` ALWAYS targets item #1 from the user's most recent
 * filtered view rather than silently mutating task #1 from the global unfiltered list.
 * Supports multi-terminal isolation via WT_SESSION / AGENDAMEA_CLI_SESSION + 4-char short IDs.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 12;

function getViewStatePath(dataDir) {
  const base =
    dataDir ||
    process.env.AGENDAMEA_DATA_DIR ||
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Agendamea');
  return path.join(path.resolve(base), 'cli-last-view.json');
}

function getSessionKey() {
  if (process.env.AGENDAMEA_CLI_SESSION) return String(process.env.AGENDAMEA_CLI_SESSION);
  if (process.env.WT_SESSION) return `wt:${process.env.WT_SESSION}`;
  if (process.env.TERM_SESSION_ID) return `term:${process.env.TERM_SESSION_ID}`;
  return 'default';
}

function computeShortId(id) {
  const clean = String(id || '')
    .trim()
    .toLowerCase();
  const stripped = clean.startsWith('todo-') ? clean.slice(5) : clean;
  return stripped.slice(0, 4) || clean.slice(0, 4);
}

function readStateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { sessions: {}, lastSessionKey: null };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.sessions &&
      typeof parsed.sessions === 'object'
    ) {
      return parsed;
    }
  } catch {
    // Ignore corrupted cache file
  }
  return { sessions: {}, lastSessionKey: null };
}

function saveViewSnapshot(viewName, tasks, options = {}) {
  if (!Array.isArray(tasks)) return;
  const filePath = getViewStatePath(options.dataDir);
  const sessionKey = options.sessionKey || getSessionKey();
  const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
  const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_TTL_MS;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const state = readStateFile(filePath);
    state.sessions[sessionKey] = {
      viewName: String(viewName || 'list'),
      savedAt: nowMs,
      ttlMs,
      items: tasks.map((t, idx) => ({
        index: idx + 1,
        id: String(t.id),
        shortId: computeShortId(t.id),
        title: String(t.title || ''),
      })),
    };
    state.lastSessionKey = sessionKey;

    // Trim oldest sessions to keep file tiny
    const keys = Object.keys(state.sessions);
    if (keys.length > MAX_SESSIONS) {
      keys
        .sort((a, b) => (state.sessions[a]?.savedAt || 0) - (state.sessions[b]?.savedAt || 0))
        .slice(0, keys.length - MAX_SESSIONS)
        .forEach((k) => {
          delete state.sessions[k];
        });
    }

    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Non-fatal: never block CLI listing
  }
}

/**
 * Resolves a purely numeric 1-based selector against the current terminal session's last displayed view.
 * Returns:
 * - { matched: true, id, title, viewName, shortId } when fresh and in range
 * - { matched: false, expired: true, viewName, ageMinutes } when snapshot exists but TTL expired
 * - { matched: false, expired: false } when no snapshot applies
 */
function resolveNumericFromSnapshot(selector, options = {}) {
  const raw = String(selector || '').trim();
  if (!/^\d+$/.test(raw)) return { matched: false, expired: false };

  const idx = Number.parseInt(raw, 10);
  if (idx < 1) return { matched: false, expired: false };

  const filePath = getViewStatePath(options.dataDir);
  const sessionKey = options.sessionKey || getSessionKey();
  const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
  const state = readStateFile(filePath);

  let snap = state.sessions[sessionKey];
  if (!snap && state.lastSessionKey && state.sessions[state.lastSessionKey]) {
    const fallbackSnap = state.sessions[state.lastSessionKey];
    // Cross-terminal fallback allowed only within 5 minutes
    if (nowMs - (fallbackSnap.savedAt || 0) <= 5 * 60 * 1000) {
      snap = fallbackSnap;
    }
  }
  if (!snap || !Array.isArray(snap.items)) {
    return { matched: false, expired: false };
  }

  const ttlMs = typeof snap.ttlMs === 'number' && snap.ttlMs > 0 ? snap.ttlMs : DEFAULT_TTL_MS;
  const ageMs = Math.max(0, nowMs - (snap.savedAt || 0));
  if (ageMs > ttlMs) {
    return {
      matched: false,
      expired: true,
      viewName: snap.viewName || 'list',
      ageMinutes: Math.round(ageMs / 60000),
    };
  }

  const found = snap.items.find((item) => item.index === idx);
  if (!found) {
    return {
      matched: false,
      expired: false,
      outOfRange: true,
      viewName: snap.viewName || 'list',
      maxIndex: snap.items.length,
    };
  }

  return {
    matched: true,
    expired: false,
    id: found.id,
    shortId: found.shortId,
    title: found.title,
    viewName: snap.viewName || 'list',
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  getViewStatePath,
  getSessionKey,
  computeShortId,
  saveViewSnapshot,
  resolveNumericFromSnapshot,
};
