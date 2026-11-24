'use strict';

const os = require('node:os');
const path = require('node:path');
const sqliteCore = require('../sqliteCore.cjs');
const ragChunker = require('../ragChunker.cjs');
const {
  loadLazy,
  getCandidateDataDirs,
  resolveApiBaseUrl,
  httpRequest,
} = require('./httpTransport.cjs');
const { withOfflineDb, mapTodoRow, getPreferredLanguage } = require('./offlineDb.cjs');
const { getTask, listTasks } = require('./taskQueries.cjs');
const { addTask, completeTask, deleteTask, clearCompleted } = require('./taskMutations.cjs');
const { getSettings, restoreLastTrashed, emptyTrash } = require('./trashAndBackupOps.cjs');

const getHardwareProfiler = () =>
  loadLazy('hardwareProfiler', () => require('../hardwareProfiler.cjs'));
const getAiCatalog = () => loadLazy('aiCatalog', () => require('../aiCatalog.cjs'));
const getModelManagerClass = () =>
  loadLazy('modelManager', () => require('../modelManager.cjs').ModelManager);
const getVoiceOrchestratorClass = () =>
  loadLazy(
    'voiceOrchestrator',
    () => require('../../electron/ai/voiceOrchestrator.cjs').VoiceOrchestrator,
  );

function getModelsDir() {
  const baseDir =
    getCandidateDataDirs()[0] || path.join(os.homedir(), 'AppData', 'Roaming', 'Agendamea');
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
  const ModelManager = getModelManagerClass();
  const hardwareProfiler = getHardwareProfiler();
  const aiCatalog = getAiCatalog();
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
  const ModelManager = getModelManagerClass();
  const manager = new ModelManager({ modelsDir });
  return {
    modelsDir,
    installedDiskBytes: manager.getInstalledDiskUsageBytes(),
    models: manager.listModelsStatus(),
  };
}

async function downloadAiModel(targetId, options = {}) {
  const clean = String(targetId || '').trim();
  if (!clean) {
    throw new Error('Model ID or tier (tier-light|tier-medium|tier-strong) is required.');
  }
  const aiCatalog = getAiCatalog();
  const modelIds = aiCatalog.TIER_BUNDLES[clean]
    ? aiCatalog.getTierBundle(clean).modelIds
    : [clean];
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const results = [];
    for (const id of modelIds) {
      let pollTimer = null;
      if (onProgress) {
        pollTimer = setInterval(async () => {
          try {
            const st = await httpRequest(baseUrl, 'GET', '/api/ai/models', undefined, 2500);
            const found = Array.isArray(st?.models) ? st.models.find((m) => m.id === id) : null;
            if (found?.progress) {
              onProgress({ modelId: id, ...found.progress });
            }
          } catch {
            // Ignore transient poll error
          }
        }, 450);
      }
      try {
        results.push(
          await httpRequest(
            baseUrl,
            'POST',
            `/api/ai/models/${encodeURIComponent(id)}/download?sync=1`,
            { sync: true },
            0,
          ),
        );
      } finally {
        if (pollTimer) clearInterval(pollTimer);
      }
    }
    return modelIds.length === 1 ? results[0] : { ok: results.every((r) => r.ok), results };
  }
  const ModelManager = getModelManagerClass();
  const manager = new ModelManager({ modelsDir: getModelsDir() });
  const results = [];
  for (const id of modelIds) {
    results.push(await manager.downloadModel(id, onProgress ? { onProgress } : undefined));
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
  const ModelManager = getModelManagerClass();
  const manager = new ModelManager({ modelsDir: getModelsDir() });
  return clean === 'all' ? manager.deleteAllModels() : manager.deleteModel(clean);
}

async function tryComputeOfflineQueryVector(query, modelId, options = {}) {
  if (typeof options.embedFn === 'function') {
    return options.embedFn(query, modelId);
  }
  const endpoint = String(
    options.ollamaEmbedUrl || process.env.AGENDAMEA_OLLAMA_URL || 'http://127.0.0.1:11434',
  ).replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.embedTimeoutMs) || 1500);
  try {
    const res = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, prompt: query }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (Array.isArray(json?.embedding) && json.embedding.length > 0) {
      return new Float32Array(json.embedding);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchRagOffline(query, options = {}) {
  const sample = withOfflineDb((db) => {
    try {
      return db
        .prepare(
          'SELECT model_id, dims, COUNT(*) as cnt FROM todo_embedding_chunks GROUP BY model_id, dims ORDER BY cnt DESC LIMIT 1',
        )
        .get();
    } catch {
      return null;
    }
  });

  let qVec = null;
  let degradedReason = null;
  if (!sample?.cnt) {
    degradedReason = 'no_indexed_vectors';
  } else {
    try {
      qVec = await tryComputeOfflineQueryVector(query, sample.model_id, options);
      if (!qVec || qVec.length !== Number(sample.dims)) {
        qVec = null;
        degradedReason = 'embedding_backend_unavailable';
      }
    } catch {
      qVec = null;
      degradedReason = 'embedding_query_error';
    }
  }

  return withOfflineDb((db) => {
    let vectorHits = [];
    if (qVec && sample) {
      const rows = db
        .prepare(
          `SELECT c.todo_id, c.chunk_index, c.chunk_text, c.vector_blob
           FROM todo_embedding_chunks c
           INNER JOIN todos t ON t.id = c.todo_id
           WHERE c.model_id = ? AND c.dims = ? AND t.deleted_at IS NULL`,
        )
        .all(sample.model_id, sample.dims);
      const bestByTodo = new Map();
      for (const r of rows) {
        if (!Buffer.isBuffer(r.vector_blob)) continue;
        const vec = ragChunker.decodeFloat32Blob(r.vector_blob);
        if (vec.length === 0) continue;
        const cos = ragChunker.cosineSimilarity(qVec, vec);
        const prev = bestByTodo.get(r.todo_id);
        if (!prev || cos > prev.cosine) {
          bestByTodo.set(r.todo_id, {
            todoId: r.todo_id,
            chunkIndex: r.chunk_index,
            chunkText: r.chunk_text,
            cosine: cos,
          });
        }
      }
      vectorHits = Array.from(bestByTodo.values())
        .filter((h) => h.cosine > 0.15)
        .sort((a, b) => b.cosine - a.cosine)
        .slice(0, 25);
    }

    const core = sqliteCore.searchHybridRagCore(db, query, {
      ...options,
      vectorHits,
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

    return {
      ...core,
      mode: vectorHits.length > 0 ? 'hybrid' : 'fts5-only',
      degradedReason: vectorHits.length > 0 ? null : degradedReason,
    };
  });
}

async function semanticSearchRag(query, options = {}) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl && !options.forceOffline) {
    const topK = Number(options.topK) || 5;
    const minScore = options.minScore !== undefined ? Number(options.minScore) : 0.35;
    return httpRequest(baseUrl, 'POST', '/api/ai/rag/search', { query, topK, minScore });
  }
  return searchRagOffline(query, options);
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
  const VoiceOrchestrator = getVoiceOrchestratorClass();
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
  getAiStatus,
  listAiModels,
  downloadAiModel,
  deleteAiModel,
  semanticSearchRag,
  askAiAssistant,
};
