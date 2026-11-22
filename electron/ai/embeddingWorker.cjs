'use strict';

/**
 * WBS-2.3: Single-Engine GGUF Embedding Worker / Service (node-llama-cpp)
 * - Uses model.createEmbeddingContext() (zero ONNX Runtime!)
 * - Applies E5 "passage: " / "query: " prefixes automatically
 * - Caches chunk vectors by SHA-256 content_hash + model_id (0 recompute on unchanged notes)
 * - Processes in 5-item batches with 50 ms yield so UI stays < 16 ms frame time
 * - Cleanly degrades to FTS5-only mode when no embedding model is downloaded
 */

const fs = require('node:fs');
const {
  chunkTaskDocument,
  l2Normalize,
  encodeFloat32Blob,
  decodeFloat32Blob,
  cosineSimilarity,
} = require('../../shared/ragChunker.cjs');

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_YIELD_MS = 50;
const DEFAULT_IDLE_UNLOAD_MS = 180_000;

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === 'function') t.unref();
  });
}

function formatTextForModel(modelId, text, kind = 'passage') {
  const clean = String(text || '').trim();
  if (!clean) return '';
  if (String(modelId || '').includes('e5')) {
    return `${kind === 'query' ? 'query' : 'passage'}: ${clean}`;
  }
  if (String(modelId || '').includes('qwen3-embedding') && kind === 'query') {
    return `Instruct: Retrieve relevant personal tasks and notes.\nQuery: ${clean}`;
  }
  return clean;
}

class EmbeddingService {
  constructor(options = {}) {
    this.modelPath = options.modelPath || null;
    this.modelId = options.modelId || 'multilingual-e5-small-q8_0';
    this.importer = options.importer || (() => import('node-llama-cpp'));
    this.customEmbedFn = typeof options.embedFn === 'function' ? options.embedFn : null;
    this.idleUnloadMs =
      typeof options.idleUnloadMs === 'number' ? options.idleUnloadMs : DEFAULT_IDLE_UNLOAD_MS;
    this.batchSize = Math.max(1, Number(options.batchSize) || DEFAULT_BATCH_SIZE);
    this.yieldMs = Math.max(0, Number(options.yieldMs ?? DEFAULT_YIELD_MS));
    this.llama = null;
    this.model = null;
    this.embedContext = null;
    this.gpuFallbackUsed = false;
    this.idleTimer = null;
    this.isIndexing = false;
    this._loadingPromise = null;
    this._syncPromise = null;
    this._opChain = Promise.resolve();
    this._vectorCacheKey = null;
    this._vectorCache = null;
  }

  _enqueue(task) {
    const run = this._opChain.then(task, task);
    this._opChain = run.catch(() => {});
    return run;
  }

  invalidateVectorCache() {
    this._vectorCacheKey = null;
    this._vectorCache = null;
  }

  configureModel({ modelPath, modelId }) {
    const nextPath = modelPath || null;
    const nextId = modelId || this.modelId;
    const changed = this.modelPath !== nextPath || this.modelId !== nextId;
    this.modelPath = nextPath;
    this.modelId = nextId;
    if (changed) {
      this.invalidateVectorCache();
      void this.unload();
    }
  }

  isAvailable() {
    if (this.customEmbedFn) return true;
    return Boolean(this.modelPath && fs.existsSync(this.modelPath));
  }

  getStatus() {
    return {
      available: this.isAvailable(),
      loaded: Boolean(this.embedContext || this.customEmbedFn),
      modelId: this.modelId,
      modelPath: this.modelPath,
      gpuFallbackUsed: this.gpuFallbackUsed,
      isIndexing: this.isIndexing,
    };
  }

  touch() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.model && this.idleUnloadMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        void this.unload();
      }, this.idleUnloadMs);
      if (typeof this.idleTimer.unref === 'function') this.idleTimer.unref();
    }
  }

  async ensureContext() {
    if (this.customEmbedFn) return null;
    if (this.embedContext) {
      this.touch();
      return this.embedContext;
    }
    if (!this._loadingPromise) {
      this._loadingPromise = this._loadContextInternal().finally(() => {
        this._loadingPromise = null;
      });
    }
    return this._loadingPromise;
  }

  async _loadContextInternal() {
    if (this.embedContext) {
      this.touch();
      return this.embedContext;
    }
    if (!this.modelPath || !fs.existsSync(this.modelPath)) {
      throw new Error('EMBED_MODEL_MISSING');
    }
    const mod = await this.importer();
    if (!mod || typeof mod.getLlama !== 'function') {
      throw new Error('EMBED_ENGINE_UNAVAILABLE');
    }

    if (!this.llama) {
      try {
        this.llama = await mod.getLlama({ gpu: 'vulkan' });
        this.gpuFallbackUsed = false;
      } catch {
        this.llama = await mod.getLlama({ gpu: false });
        this.gpuFallbackUsed = true;
      }
    }

    let model = null;
    let ctx = null;
    try {
      model = await this.llama.loadModel({ modelPath: this.modelPath });
      ctx = await model.createEmbeddingContext();
      this.model = model;
      this.embedContext = ctx;
      this.touch();
      return this.embedContext;
    } catch (err) {
      try {
        if (ctx && typeof ctx.dispose === 'function') await ctx.dispose();
      } catch {
        // Ignore cleanup
      }
      try {
        if (model && typeof model.dispose === 'function') await model.dispose();
      } catch {
        // Ignore cleanup
      }
      throw err;
    }
  }

  async embedText(text, kind = 'passage') {
    const formatted = formatTextForModel(this.modelId, text, kind);
    if (!formatted) return new Float32Array(0);
    if (this.customEmbedFn) {
      const raw = await this.customEmbedFn(formatted, kind, this.modelId);
      return l2Normalize(raw);
    }
    return this._enqueue(async () => {
      const ctx = await this.ensureContext();
      const res = await ctx.getEmbeddingFor(formatted);
      this.touch();
      return l2Normalize(res?.vector || []);
    });
  }

  /**
   * Synchronizes chunk embeddings for an array of active todos into SQLite `todo_embedding_chunks`.
   * Skips any chunk whose `content_hash` + `model_id` is unchanged (recomputed === 0 on repeat save).
   */
  async syncTodosIndex(db, todos, options = {}) {
    if (this._syncPromise) {
      return this._syncPromise;
    }
    this._syncPromise = this._syncTodosIndexInternal(db, todos, options).finally(() => {
      this._syncPromise = null;
    });
    return this._syncPromise;
  }

  async _syncTodosIndexInternal(db, todos, options = {}) {
    if (!this.isAvailable()) {
      return {
        ok: true,
        mode: 'fts5-only',
        recomputed: 0,
        skipped: 0,
        totalChunks: 0,
      };
    }
    if (options.onBattery && options.pauseOnBattery !== false) {
      return {
        ok: true,
        mode: 'paused-battery',
        recomputed: 0,
        skipped: 0,
        totalChunks: 0,
      };
    }

    this.isIndexing = true;
    let recomputed = 0;
    let skipped = 0;
    let totalChunks = 0;

    try {
      const list = Array.isArray(todos) ? todos : [];
      const activeIds = new Set(list.map((t) => t.id));
      const selectExisting = db.prepare(
        'SELECT chunk_index, content_hash, model_id FROM todo_embedding_chunks WHERE todo_id = ?',
      );
      const upsertChunk = db.prepare(`
        INSERT OR REPLACE INTO todo_embedding_chunks (
          todo_id, chunk_index, chunk_text, content_hash, model_id, dims, vector_blob, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const deleteStaleChunks = db.prepare(
        'DELETE FROM todo_embedding_chunks WHERE todo_id = ? AND chunk_index >= ?',
      );

      let batchCount = 0;
      for (const todo of list) {
        if (!todo || todo.deletedAt) continue;
        const chunks = chunkTaskDocument(todo);
        totalChunks += chunks.length;

        const existingRows = selectExisting.all(todo.id);
        const existingMap = new Map(existingRows.map((r) => [r.chunk_index, r]));

        for (const ch of chunks) {
          const prev = existingMap.get(ch.chunkIndex);
          if (prev && prev.content_hash === ch.contentHash && prev.model_id === this.modelId) {
            skipped += 1;
            continue;
          }
          const vec = await this.embedText(ch.chunkText, 'passage');
          if (vec.length > 0) {
            upsertChunk.run(
              todo.id,
              ch.chunkIndex,
              ch.chunkText,
              ch.contentHash,
              this.modelId,
              vec.length,
              encodeFloat32Blob(vec),
              new Date().toISOString(),
            );
            recomputed += 1;
            batchCount += 1;
            if (batchCount >= this.batchSize) {
              batchCount = 0;
              if (this.yieldMs > 0) {
                await sleep(this.yieldMs);
              }
            }
          }
        }

        deleteStaleChunks.run(todo.id, chunks.length);
      }

      // Clean chunks for deleted/trashed todos
      const allIndexedTodoIds = db
        .prepare('SELECT DISTINCT todo_id FROM todo_embedding_chunks')
        .all();
      const delRemoved = db.prepare('DELETE FROM todo_embedding_chunks WHERE todo_id = ?');
      let removedCount = 0;
      for (const row of allIndexedTodoIds) {
        if (!activeIds.has(row.todo_id)) {
          delRemoved.run(row.todo_id);
          removedCount += 1;
        }
      }

      if (recomputed > 0 || removedCount > 0) {
        this.invalidateVectorCache();
      }

      return {
        ok: true,
        mode: 'hybrid-rrf',
        recomputed,
        skipped,
        totalChunks,
      };
    } catch (err) {
      console.error('[EmbeddingService] syncTodosIndex failed:', err);
      return {
        ok: false,
        mode: 'fts5-only',
        recomputed,
        skipped,
        totalChunks,
        error: 'Embedding sync error.',
      };
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Computes max-pooled cosine similarity across all stored chunks per active todo.
   * Uses an in-memory Float32Array cache keyed by (db, modelId, dims, rowCount, latestUpdatedAt)
   * so repeated RAG queries avoid re-reading and copying SQLite BLOBs.
   */
  async searchVectors(db, query, options = {}) {
    if (!this.isAvailable()) return [];
    const topK = Math.max(1, Number(options.topK) || 10);
    let queryVec;
    try {
      queryVec = await this.embedText(query, 'query');
    } catch {
      return [];
    }
    if (!queryVec || queryVec.length === 0) return [];

    const meta = db
      .prepare(`
        SELECT COUNT(*) as c, MAX(c.updated_at) as last_upd
        FROM todo_embedding_chunks c
        INNER JOIN todos t ON t.id = c.todo_id
        WHERE t.deleted_at IS NULL AND c.model_id = ? AND c.dims = ?
      `)
      .get(this.modelId, queryVec.length);
    const cacheKey = `${this.modelId}:${queryVec.length}:${meta?.c || 0}:${meta?.last_upd || ''}`;

    if (this._vectorCacheKey !== cacheKey || !Array.isArray(this._vectorCache) || this._vectorCacheDb !== db) {
      const rows = db
        .prepare(`
          SELECT c.todo_id, c.chunk_index, c.chunk_text, c.dims, c.vector_blob
          FROM todo_embedding_chunks c
          INNER JOIN todos t ON t.id = c.todo_id
          WHERE t.deleted_at IS NULL AND c.model_id = ? AND c.dims = ?
        `)
        .all(this.modelId, queryVec.length);
      this._vectorCache = rows.map((row) => ({
        todoId: row.todo_id,
        chunkIndex: row.chunk_index,
        chunkText: row.chunk_text,
        vec: decodeFloat32Blob(row.vector_blob),
      }));
      this._vectorCacheKey = cacheKey;
      this._vectorCacheDb = db;
    }

    const bestByTodo = new Map();
    for (const item of this._vectorCache) {
      const vec = item.vec;
      // Both queryVec and stored chunk vectors are L2-normalized, so dot product === cosine similarity
      let cos = 0;
      if (vec.length === queryVec.length) {
        for (let i = 0; i < queryVec.length; i += 1) {
          cos += queryVec[i] * vec[i];
        }
      } else {
        cos = cosineSimilarity(queryVec, vec);
      }
      const prev = bestByTodo.get(item.todoId);
      if (!prev || cos > prev.cosine) {
        bestByTodo.set(item.todoId, {
          todoId: item.todoId,
          chunkIndex: item.chunkIndex,
          chunkText: item.chunkText,
          cosine: cos,
        });
      }
    }

    return Array.from(bestByTodo.values())
      .sort((a, b) => b.cosine - a.cosine)
      .slice(0, topK);
  }

  async unload() {
    this.invalidateVectorCache();
    return this._enqueue(async () => {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      if (this.embedContext && typeof this.embedContext.dispose === 'function') {
        try {
          await this.embedContext.dispose();
        } catch {
          // Ignore dispose failure
        }
      }
      if (this.model && typeof this.model.dispose === 'function') {
        try {
          await this.model.dispose();
        } catch {
          // Ignore dispose failure
        }
      }
      this.embedContext = null;
      this.model = null;
    });
  }
}

module.exports = {
  EmbeddingService,
  formatTextForModel,
  DEFAULT_BATCH_SIZE,
  DEFAULT_YIELD_MS,
  DEFAULT_IDLE_UNLOAD_MS,
};
