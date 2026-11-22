'use strict';

/**
 * Shared local data bridge for Agendamea CLI & MCP Server.
 * 1. Primary path: live local 127.0.0.1 HTTP API when desktop app is running (instant UI sync + cloud backup).
 * 2. Offline fallback: direct WAL-safe SQLite access to %APPDATA%\Agendamea\agendamea.db when desktop app is closed.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_VERSION = '1.0.0';

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  if (!process.env.AGENDAMEA_FORCE_OFFLINE) {
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
      if (res.ok) return base;
    } catch {
      // Try next port
    }
  }
  return null;
}

async function httpRequest(baseUrl, method, endpoint, body) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

function withOfflineDb(fn) {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error(
      'Agendamea is not running and no local database was found yet. Launch Agendamea once first.',
    );
  }
  const Database = loadBetterSqlite3();
  if (!Database) {
    throw new Error(
      'Agendamea desktop app is not running (offline SQLite driver unavailable in current Node ABI). Start Agendamea and retry.',
    );
  }
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    return fn(db, dbPath);
  } finally {
    db.close();
  }
}

function mapTodoRow(row) {
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
  };
}

function resolveTodoPrefix(todos, idOrPrefix) {
  const clean = String(idOrPrefix || '').trim().toLowerCase();
  if (!clean) throw new Error('Task ID is required.');
  const exact = todos.find((t) => t.id.toLowerCase() === clean);
  if (exact) return exact;
  const matches = todos.filter((t) => t.id.toLowerCase().startsWith(clean));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Ambiguous ID prefix "${idOrPrefix}" (${matches.length} matches).`);
  }
  throw new Error(`Task not found: "${idOrPrefix}".`);
}

function applyTaskFilters(todos, options = {}) {
  const filter = options.filter || 'active';
  const today = getTodayStr();
  let list = todos;
  if (filter === 'active') list = list.filter((t) => !t.completed);
  else if (filter === 'completed') list = list.filter((t) => t.completed);
  else if (filter === 'today') list = list.filter((t) => !t.completed && t.dueDate === today);
  else if (filter === 'important') list = list.filter((t) => !t.completed && t.important);

  if (typeof options.query === 'string' && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    list = list.filter(
      (t) =>
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.notes || '').toLowerCase().includes(q),
    );
  }
  return list;
}

async function getStatus() {
  const baseUrl = await resolveApiBaseUrl();
  const today = getTodayStr();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const active = boot.todos.filter((t) => !t.completed);
    return {
      ok: true,
      mode: 'live-api',
      endpoint: baseUrl,
      version: APP_VERSION,
      activeTasks: active.length,
      dueToday: active.filter((t) => t.dueDate === today).length,
      important: active.filter((t) => t.important).length,
      completedTasks: boot.todos.filter((t) => t.completed).length,
      categories: boot.categories.length,
      trashCount: boot.trashedTodos.length + boot.trashedCategories.length,
    };
  }
  return withOfflineDb((db, dbPath) => {
    const rows = db.prepare('SELECT * FROM todos WHERE deleted_at IS NULL').all().map(mapTodoRow);
    const active = rows.filter((t) => !t.completed);
    const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE deleted_at IS NULL').get().c;
    const trashTodos = db.prepare('SELECT COUNT(*) AS c FROM todos WHERE deleted_at IS NOT NULL').get().c;
    const trashCats = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE deleted_at IS NOT NULL').get().c;
    return {
      ok: true,
      mode: 'offline-sqlite',
      endpoint: dbPath,
      version: APP_VERSION,
      activeTasks: active.length,
      dueToday: active.filter((t) => t.dueDate === today).length,
      important: active.filter((t) => t.important).length,
      completedTasks: rows.filter((t) => t.completed).length,
      categories: catCount,
      trashCount: trashTodos + trashCats,
    };
  });
}

async function listTasks(options = {}) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    return applyTaskFilters(boot.todos, options);
  }
  return withOfflineDb((db) => {
    const rows = db
      .prepare('SELECT * FROM todos WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC')
      .all()
      .map(mapTodoRow);
    return applyTaskFilters(rows, options);
  });
}

async function listCategories() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    return boot.categories;
  }
  return withOfflineDb((db) => {
    return db
      .prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC')
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        pinned: Boolean(row.pinned),
        sortOrder: Number(row.sort_order) || 0,
        createdAt: row.created_at,
        deletedAt: null,
      }));
  });
}

async function addTask(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('Task title is required.');
  const payload = {
    title,
    notes: typeof input?.notes === 'string' ? input.notes : '',
    dueDate: typeof input?.dueDate === 'string' && input.dueDate ? input.dueDate : null,
    priority:
      input?.priority === 'high' || input?.priority === 'low' || input?.priority === 'normal'
        ? input.priority
        : 'normal',
    important: Boolean(input?.important),
    categoryId: typeof input?.categoryId === 'string' && input.categoryId ? input.categoryId : null,
  };

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/todos', payload);
  }
  return withOfflineDb((db) => {
    const id = `todo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const minRow = db
      .prepare('SELECT COALESCE(MIN(sort_order), 1) AS minOrder FROM todos WHERE deleted_at IS NULL')
      .get();
    const sortOrder = Number(minRow?.minOrder ?? 1) - 1;
    db.prepare(
      `INSERT INTO todos (id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, 0, ?, 0, ?, NULL, ?, NULL, '[]', ?, ?, ?, ?, NULL)`,
    ).run(
      id,
      payload.title,
      payload.notes,
      payload.important ? 1 : 0,
      payload.priority,
      payload.dueDate,
      payload.categoryId,
      sortOrder,
      now,
      now,
    );
    const created = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    return mapTodoRow(created);
  });
}

async function completeTask(idOrPrefix, completedOpt) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveTodoPrefix(boot.todos, idOrPrefix);
    const nextCompleted = completedOpt === undefined ? !target.completed : Boolean(completedOpt);
    return httpRequest(baseUrl, 'PATCH', `/api/todos/${encodeURIComponent(target.id)}`, {
      completed: nextCompleted,
    });
  }
  return withOfflineDb((db) => {
    const rows = db.prepare('SELECT * FROM todos WHERE deleted_at IS NULL').all().map(mapTodoRow);
    const target = resolveTodoPrefix(rows, idOrPrefix);
    const nextCompleted = completedOpt === undefined ? !target.completed : Boolean(completedOpt);
    const now = new Date().toISOString();
    db.prepare('UPDATE todos SET completed = ?, updated_at = ? WHERE id = ?').run(
      nextCompleted ? 1 : 0,
      now,
      target.id,
    );
    const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(target.id);
    return mapTodoRow(updated);
  });
}

async function deleteTask(idOrPrefix) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveTodoPrefix(boot.todos, idOrPrefix);
    await httpRequest(baseUrl, 'DELETE', `/api/todos/${encodeURIComponent(target.id)}`);
    return { ok: true, id: target.id, title: target.title, movedToTrash: true };
  }
  return withOfflineDb((db) => {
    const rows = db.prepare('SELECT * FROM todos WHERE deleted_at IS NULL').all().map(mapTodoRow);
    const target = resolveTodoPrefix(rows, idOrPrefix);
    const now = new Date().toISOString();
    db.prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
      now,
      now,
      target.id,
    );
    return { ok: true, id: target.id, title: target.title, movedToTrash: true };
  });
}

module.exports = {
  APP_VERSION,
  getTodayStr,
  getStatus,
  listTasks,
  listCategories,
  addTask,
  completeTask,
  deleteTask,
};
