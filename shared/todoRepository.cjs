'use strict';

/**
 * Shared SQLite Row Mappers & Read/Trash/Reset Repository Core.
 * Consumed by BOTH `src/db/database.ts` (Express server) and `shared/localStore.cjs`
 * (offline CLI & MCP engine) so row mapping, chunked subtask hydration, bootstrap
 * queries, and atomic reset behavior stay 100% drift-free.
 */

const sqliteCore = require('./sqliteCore.cjs');
const textNormalize = require('./textNormalize.cjs');

const SUBTASK_QUERY_CHUNK_SIZE = 400;
const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function defaultSanitizeDueTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return TIME_24H_RE.test(trimmed) ? trimmed : null;
}

function defaultSanitizeTags(rawTags) {
  let list = [];
  if (Array.isArray(rawTags)) {
    list = rawTags;
  } else if (typeof rawTags === 'string' && rawTags.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 28);
    if (!clean) continue;
    const key = textNormalize.canonicalKey(clean);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#2563eb',
    pinned: Boolean(row.pinned),
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? null,
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

function mapTodoRow(row, subtasks = [], options = {}) {
  const sanitizeDueTime =
    typeof options.sanitizeDueTime === 'function'
      ? options.sanitizeDueTime
      : defaultSanitizeDueTime;
  const sanitizeTags =
    typeof options.sanitizeTags === 'function' ? options.sanitizeTags : defaultSanitizeTags;

  return {
    id: row.id,
    title: row.title,
    notes: row.notes || '',
    completed: Boolean(row.completed),
    important: Boolean(row.important),
    pinned: Boolean(row.pinned),
    priority: row.priority || 'normal',
    startDate: row.start_date ?? null,
    dueDate: row.due_date ?? null,
    dueTime: sanitizeDueTime(row.due_time),
    tags: sanitizeTags(row.tags),
    categoryId: row.category_id ?? null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    subtasks,
  };
}

function attachSubtasks(db, todoRows, options = {}) {
  if (!Array.isArray(todoRows) || todoRows.length === 0) return [];
  const subtasksByTodo = new Map();
  const ids = todoRows.map((r) => r.id);

  for (let i = 0; i < ids.length; i += SUBTASK_QUERY_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + SUBTASK_QUERY_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const subtaskRows = db
      .prepare(`SELECT * FROM subtasks WHERE todo_id IN (${placeholders}) ORDER BY sort_order ASC`)
      .all(...chunk);

    for (const row of subtaskRows) {
      const list = subtasksByTodo.get(row.todo_id) || [];
      list.push(mapSubtaskRow(row));
      subtasksByTodo.set(row.todo_id, list);
    }
  }

  return todoRows.map((row) => mapTodoRow(row, subtasksByTodo.get(row.id) || [], options));
}

function getActiveCategories(db) {
  return db
    .prepare(
      'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at ASC',
    )
    .all()
    .map(mapCategoryRow);
}

function getTrashedCategories(db) {
  return db
    .prepare('SELECT * FROM categories WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all()
    .map(mapCategoryRow);
}

function getActiveTodos(db, options = {}) {
  const rows = db
    .prepare(
      'SELECT * FROM todos WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC',
    )
    .all();
  return attachSubtasks(db, rows, options);
}

function getTrashedTodos(db, options = {}) {
  const rows = db
    .prepare('SELECT * FROM todos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all();
  return attachSubtasks(db, rows, options);
}

function getTodoById(db, id, options = {}) {
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!row) return null;
  const subtaskRows = db
    .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY sort_order ASC')
    .all(id);
  return mapTodoRow(row, subtaskRows.map(mapSubtaskRow), options);
}

function getCategoryById(db, id) {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  return row ? mapCategoryRow(row) : null;
}

function getBootstrapSnapshot(db, readSettingsFn, options = {}) {
  const readTx = db.transaction(() => ({
    categories: getActiveCategories(db),
    todos: getActiveTodos(db, options),
    trashedCategories: getTrashedCategories(db),
    trashedTodos: getTrashedTodos(db, options),
    settings: readSettingsFn(db),
  }));
  return readTx();
}

function emptyTrashTx(db) {
  let deletedTodos = 0;
  let deletedCategories = 0;
  const tx = db.transaction(() => {
    const todoRes = db.prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL').run();
    const catRes = db.prepare('DELETE FROM categories WHERE deleted_at IS NOT NULL').run();
    deletedTodos = todoRes.changes;
    deletedCategories = catRes.changes;
  });
  tx();
  return { deletedTodos, deletedCategories };
}

function resetAllDataTx(db, options = {}) {
  const resetSettings = Boolean(options.resetSettings);
  const currentLang =
    typeof options.currentLang === 'string' && options.currentLang ? options.currentLang : 'tr';

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM todo_embedding_chunks').run();
    db.prepare('DELETE FROM webhook_reminder_dispatches').run();
    db.prepare('DELETE FROM webhook_outbox').run();
    db.prepare('DELETE FROM subtasks').run();
    db.prepare('DELETE FROM todos').run();
    db.prepare('DELETE FROM categories').run();
    db.exec("INSERT INTO todos_fts(todos_fts) VALUES('rebuild')");

    if (resetSettings) {
      db.prepare('DELETE FROM webhook_logs').run();
      db.prepare('DELETE FROM settings').run();
      sqliteCore.seedDefaultSettings(db);
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      stmt.run('language', currentLang);
      stmt.run('onboardingCompleted', '1');
    }
  });
  tx();
}

module.exports = {
  SUBTASK_QUERY_CHUNK_SIZE,
  mapCategoryRow,
  mapSubtaskRow,
  mapTodoRow,
  attachSubtasks,
  getActiveCategories,
  getTrashedCategories,
  getActiveTodos,
  getTrashedTodos,
  getTodoById,
  getCategoryById,
  getBootstrapSnapshot,
  emptyTrashTx,
  resetAllDataTx,
};
