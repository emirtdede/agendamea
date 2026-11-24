'use strict';

/**
 * Shared SQLite Schema (v4 + FTS5 + Embedding Chunks) & Hybrid RAG Search Core.
 * Single source of truth consumed by BOTH `src/db/database.ts` (Express server)
 * and `shared/localStore.cjs` (offline CLI & MCP engine) to eliminate schema/search drift.
 */

const ragChunker = require('./ragChunker.cjs');
const textNormalize = require('./textNormalize.cjs');

const SCHEMA_VERSION = 5;

function applyAgendameaSchema(db, options = {}) {
  const selfHealFts = options.selfHealFts !== false;

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2563eb',
      pinned INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      important INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      start_date TEXT DEFAULT NULL,
      due_date TEXT,
      due_time TEXT DEFAULT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      category_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT DEFAULT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      todo_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL DEFAULT 'outgoing',
      event TEXT NOT NULL,
      target_url TEXT NOT NULL DEFAULT '',
      status_code INTEGER DEFAULT NULL,
      ok INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 1,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_outbox (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      event TEXT NOT NULL,
      target_url TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'auto',
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 6,
      next_attempt_at TEXT NOT NULL,
      last_status_code INTEGER DEFAULT NULL,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_reminder_dispatches (
      todo_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      schedule_key TEXT NOT NULL,
      fired_at TEXT NOT NULL,
      PRIMARY KEY (todo_id, kind, schedule_key)
    );

    CREATE TABLE IF NOT EXISTS todo_embedding_chunks (
      todo_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      model_id TEXT NOT NULL,
      dims INTEGER NOT NULL,
      vector_blob BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (todo_id, chunk_index),
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_todos_category ON todos(category_id);
    CREATE INDEX IF NOT EXISTS idx_subtasks_todo ON subtasks(todo_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_webhook_outbox_pending ON webhook_outbox(status, next_attempt_at ASC);
    CREATE INDEX IF NOT EXISTS idx_embedding_chunks_model ON todo_embedding_chunks(model_id, dims);
  `);

  const currentVersion = Number(db.pragma('user_version', { simple: true }) ?? 0);
  if (currentVersion < SCHEMA_VERSION) {
    const catCols = db.pragma('table_info(categories)');
    if (!catCols.some((c) => c.name === 'deleted_at')) {
      db.exec('ALTER TABLE categories ADD COLUMN deleted_at TEXT DEFAULT NULL');
    }
    if (!catCols.some((c) => c.name === 'pinned')) {
      db.exec('ALTER TABLE categories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
    }

    const todoCols = db.pragma('table_info(todos)');
    if (!todoCols.some((c) => c.name === 'deleted_at')) {
      db.exec('ALTER TABLE todos ADD COLUMN deleted_at TEXT DEFAULT NULL');
    }
    if (!todoCols.some((c) => c.name === 'pinned')) {
      db.exec('ALTER TABLE todos ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_categories_deleted ON categories(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_todos_deleted ON todos(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_todos_active_order
        ON todos(pinned DESC, sort_order ASC, created_at DESC)
        WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_categories_active_order
        ON categories(pinned DESC, sort_order ASC, created_at ASC)
        WHERE deleted_at IS NULL;
    `);
  }

  // Ensure optional columns exist BEFORE FTS5 triggers reference tags
  const latestTodoCols = db.pragma('table_info(todos)');
  if (!latestTodoCols.some((c) => c.name === 'start_date')) {
    db.exec('ALTER TABLE todos ADD COLUMN start_date TEXT DEFAULT NULL');
  }
  if (!latestTodoCols.some((c) => c.name === 'due_time')) {
    db.exec('ALTER TABLE todos ADD COLUMN due_time TEXT DEFAULT NULL');
  }
  if (!latestTodoCols.some((c) => c.name === 'tags')) {
    db.exec("ALTER TABLE todos ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS todos_fts USING fts5(
      title,
      notes,
      tags,
      content='todos',
      content_rowid='rowid',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS todos_fts_ai AFTER INSERT ON todos BEGIN
      INSERT INTO todos_fts(rowid, title, notes, tags)
      VALUES (new.rowid, new.title, new.notes, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS todos_fts_ad AFTER DELETE ON todos BEGIN
      INSERT INTO todos_fts(todos_fts, rowid, title, notes, tags)
      VALUES ('delete', old.rowid, old.title, old.notes, old.tags);
    END;

    DROP TRIGGER IF EXISTS todos_fts_au;
    CREATE TRIGGER todos_fts_au AFTER UPDATE OF title, notes, tags ON todos BEGIN
      INSERT INTO todos_fts(todos_fts, rowid, title, notes, tags)
      VALUES ('delete', old.rowid, old.title, old.notes, old.tags);
      INSERT INTO todos_fts(rowid, title, notes, tags)
      VALUES (new.rowid, new.title, new.notes, new.tags);
    END;
  `);

  const rebuildFts = () => {
    try {
      db.exec("INSERT INTO todos_fts(todos_fts) VALUES('rebuild')");
    } catch {
      // Ignore rebuild failure on restricted handles
    }
  };

  if (currentVersion < SCHEMA_VERSION) {
    rebuildFts();
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  } else if (selfHealFts) {
    try {
      const todoCount = Number(db.prepare('SELECT COUNT(*) as c FROM todos').get()?.c || 0);
      const ftsCount = Number(db.prepare('SELECT COUNT(*) as c FROM todos_fts').get()?.c || 0);
      if (todoCount !== ftsCount) {
        rebuildFts();
      }
    } catch {
      rebuildFts();
    }
  }
}

function seedDefaultSettings(db) {
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const defaults = [
    ['themeMode', 'light'],
    ['themeId', 'obsidian'],
    ['dragLocked', '0'],
    ['sidebarCollapsed', '0'],
    ['themeCustomized', '0'],
    ['language', 'tr'],
    ['autoUpdateCheck', '1'],
    ['onedriveAutoSync', '0'],
    ['onedriveCustomPath', ''],
    ['onboardingCompleted', '0'],
  ];
  const tx = db.transaction(() => {
    for (const [k, v] of defaults) {
      stmt.run(k, v);
    }
  });
  tx();
}

function parseRawTags(rawTags) {
  if (Array.isArray(rawTags)) return rawTags;
  if (typeof rawTags === 'string' && rawTags.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawTags);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Shared Hybrid FTS5 + Chunked Snippet + Vector RRF Search Core.
 * Ensures 100% parity between Express TodoDatabase and offline CLI/MCP localStore.
 */
function searchHybridRagCore(db, query, options = {}) {
  const cleanQuery = String(query || '').trim();
  const topK = Math.max(1, Math.min(20, Number(options.topK) || 5));
  const minScore = typeof options.minScore === 'number' ? options.minScore : 0.35;
  const vectorHits = Array.isArray(options.vectorHits) ? options.vectorHits : [];
  const getActiveTodos =
    typeof options.getActiveTodos === 'function' ? options.getActiveTodos : null;
  const getTodoById = typeof options.getTodoById === 'function' ? options.getTodoById : null;

  if (!cleanQuery && vectorHits.length === 0) {
    return { hits: [], disambiguationRequired: false, mode: 'fts5-only' };
  }

  const ftsHits = [];
  const ftsExpr = ragChunker.buildFtsQuery(cleanQuery);
  if (ftsExpr) {
    try {
      const rows = db
        .prepare(`
          SELECT t.id, t.title, t.notes, t.tags, bm25(todos_fts) as rank_score
          FROM todos_fts
          INNER JOIN todos t ON t.rowid = todos_fts.rowid
          WHERE todos_fts MATCH ? AND t.deleted_at IS NULL
          ORDER BY rank_score ASC
          LIMIT 25
        `)
        .all(ftsExpr);

      for (const r of rows) {
        const chunks = ragChunker.chunkTaskDocument({
          title: r.title,
          notes: r.notes,
          tags: parseRawTags(r.tags),
        });
        let bestChunkText = r.notes || r.title;
        let bestCov = ragChunker.computeLexicalCoverage(
          cleanQuery,
          `${r.title} ${r.notes} ${r.tags}`,
        );
        for (const ch of chunks) {
          const cov = ragChunker.computeLexicalCoverage(cleanQuery, ch.chunkText);
          if (cov >= bestCov) {
            bestCov = cov;
            bestChunkText = ch.chunkText;
          }
        }
        ftsHits.push({
          todoId: r.id,
          bm25: Number(r.rank_score) || 0,
          snippet: bestChunkText,
          lexicalCoverage: bestCov,
        });
      }
    } catch {
      // Safe fallback below if FTS query syntax ever fails
    }
  }

  if (ftsHits.length === 0 && cleanQuery) {
    const activeTodos = getActiveTodos
      ? getActiveTodos()
      : db
          .prepare('SELECT * FROM todos WHERE deleted_at IS NULL')
          .all()
          .map((row) => ({
            id: row.id,
            title: row.title,
            notes: row.notes || '',
            tags: parseRawTags(row.tags),
            subtasks: [],
          }));
    for (const todo of activeTodos) {
      const fullDoc = ragChunker.buildTodoDocumentText(todo);
      const cov = ragChunker.computeLexicalCoverage(cleanQuery, fullDoc);
      if (cov > 0 || textNormalize.matchesNormalized(fullDoc, cleanQuery)) {
        const chunks = ragChunker.chunkTaskDocument(todo);
        let bestSnippet = todo.notes || todo.title;
        let bestChunkCov = cov;
        for (const ch of chunks) {
          const cCov = ragChunker.computeLexicalCoverage(cleanQuery, ch.chunkText);
          if (cCov >= bestChunkCov) {
            bestChunkCov = cCov;
            bestSnippet = ch.chunkText;
          }
        }
        ftsHits.push({
          todoId: todo.id,
          bm25: -bestChunkCov,
          snippet: bestSnippet,
          lexicalCoverage: Math.max(cov, 0.5),
        });
      }
    }
  }

  const fused = ragChunker.fuseHybridRanks({
    query: cleanQuery,
    ftsHits,
    vectorHits,
    topK,
    minScore,
  });

  const hydratedHits = [];
  for (const hit of fused.hits) {
    let todo = null;
    if (getTodoById) {
      todo = getTodoById(hit.todoId);
    } else {
      const row = db
        .prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL')
        .get(hit.todoId);
      if (row) {
        todo = {
          id: row.id,
          title: row.title,
          notes: row.notes || '',
          dueDate: row.due_date || null,
          dueTime: row.due_time || null,
          priority: row.priority || 'normal',
          completed: Boolean(row.completed),
          deletedAt: row.deleted_at || null,
        };
      }
    }
    if (!todo || todo.deletedAt !== null) continue;
    hydratedHits.push({
      todoId: todo.id,
      title: todo.title,
      notes: todo.notes,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime ?? null,
      priority: todo.priority,
      completed: todo.completed,
      score: hit.score,
      matchedChunkText: hit.matchedChunkText || todo.notes || todo.title,
      matchedChunkIndex: hit.matchedChunkIndex || 0,
    });
  }

  return {
    hits: hydratedHits,
    disambiguationRequired: fused.disambiguationRequired,
    mode: fused.mode,
  };
}

module.exports = {
  SCHEMA_VERSION,
  applyAgendameaSchema,
  seedDefaultSettings,
  searchHybridRagCore,
};
