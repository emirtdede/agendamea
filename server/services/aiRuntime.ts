import path from 'node:path';
import embeddingWorkerMod from '../../electron/ai/embeddingWorker.cjs';
import llmServiceMod from '../../electron/ai/llmService.cjs';
import sttServiceMod from '../../electron/ai/sttService.cjs';
import voiceOrchestratorMod from '../../electron/ai/voiceOrchestrator.cjs';
import aiCatalog from '../../shared/aiCatalog.cjs';
import sharedConstants from '../../shared/constants.cjs';
import hardwareProfiler from '../../shared/hardwareProfiler.cjs';
import modelManagerMod from '../../shared/modelManager.cjs';
import piperVoicesMod from '../../shared/piperVoices.cjs';
import type { TodoDatabase } from '../../src/db/database.ts';
import { getLocalDateString } from '../../src/utils/todoLogic.ts';

export function createAiRuntimeService(options: {
  db: TodoDatabase;
  aiDataDir: string;
  broadcastSseEvent: (eventPayload: Record<string, unknown>) => void;
  dispatchConfiguredWebhook: (event: string, data: unknown) => void;
}) {
  const { db, aiDataDir, broadcastSseEvent, dispatchConfiguredWebhook } = options;

  const aiModelsDir = path.join(aiDataDir, 'models');
  const aiTtsVoicesDir = path.join(aiDataDir, 'tts-voices');
  const modelManager = new modelManagerMod.ModelManager({
    modelsDir: aiModelsDir,
    onProgressEvent: (prog: Record<string, unknown>) => {
      broadcastSseEvent({ type: 'ai.download.progress', ...prog });
    },
  });
  const piperVoiceManager = new piperVoicesMod.PiperVoiceManager({
    voicesDir: aiTtsVoicesDir,
    onProgressEvent: (prog: Record<string, unknown>) => {
      broadcastSseEvent({ type: 'tts.download.progress', ...prog });
    },
  });
  const embeddingService = new embeddingWorkerMod.EmbeddingService();
  const sttService = new sttServiceMod.SttService();
  const llmService = new llmServiceMod.LlmService();
  const voiceOrchestrator = new voiceOrchestratorMod.VoiceOrchestrator();

  let cachedHardwareProfile: Record<string, unknown> | null = null;
  let cachedHardwareAt = 0;
  let cachedExternalBackends: Record<string, unknown> | null = null;
  let cachedExternalAt = 0;
  let cachedExternalUrlKey = '';
  let ragSyncTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleBackgroundRagSync() {
    if (ragSyncTimer) clearTimeout(ragSyncTimer);
    ragSyncTimer = setTimeout(() => {
      ragSyncTimer = null;
      try {
        syncAiRuntimeFromSettings();
        if (embeddingService.isAvailable()) {
          void embeddingService.syncTodosIndex(db.getRawDb(), db.getTodos()).catch(() => {
            // Non-blocking background RAG sync
          });
        }
      } catch {
        // Non-blocking background RAG sync
      }
    }, 1500);
    if (typeof ragSyncTimer.unref === 'function') ragSyncTimer.unref();
  }

  function clearRagSyncTimer() {
    if (ragSyncTimer) {
      clearTimeout(ragSyncTimer);
      ragSyncTimer = null;
    }
  }

  async function getHardwareProfileCached(force = false) {
    if (!force && cachedHardwareProfile && Date.now() - cachedHardwareAt < 60_000) {
      return cachedHardwareProfile;
    }
    const profile = await hardwareProfiler.profileHardware({ targetDir: aiDataDir });
    cachedHardwareProfile = profile;
    cachedHardwareAt = Date.now();
    return profile;
  }

  function normalizeExternalBase(raw: string): string {
    return raw.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
  }

  async function getExternalBackendsCached(force = false) {
    const s = db.getSettings();
    const customBase =
      typeof s.aiExternalBaseUrl === 'string' && s.aiExternalBaseUrl.trim().length > 0
        ? normalizeExternalBase(s.aiExternalBaseUrl)
        : '';
    const tier = s.aiTier || 'tier-light';
    const urlKey = `${tier}|${customBase}`;
    if (
      !force &&
      cachedExternalBackends &&
      cachedExternalUrlKey === urlKey &&
      Date.now() - cachedExternalAt < 30_000
    ) {
      return cachedExternalBackends;
    }
    const probeOpts: { ollamaBaseUrl?: string; lmStudioBaseUrl?: string } = {};
    if (customBase) {
      if (tier === 'external-lmstudio') {
        probeOpts.lmStudioBaseUrl = customBase;
      } else {
        probeOpts.ollamaBaseUrl = customBase;
      }
    }
    const external = await aiCatalog.detectExternalBackends(probeOpts);
    cachedExternalBackends = external;
    cachedExternalUrlKey = urlKey;
    cachedExternalAt = Date.now();
    return external;
  }

  function syncAiRuntimeFromSettings(defaultTier = 'tier-light') {
    const s = db.getSettings();
    const tier = s.aiTier || defaultTier || 'tier-light';
    const bundle = aiCatalog.getTierBundle(
      tier === 'tier-light' || tier === 'tier-medium' || tier === 'tier-strong'
        ? tier
        : 'tier-light',
    );
    const sttId = s.aiSttModelId || bundle.sttModelId;
    const llmId = s.aiLlmModelId || bundle.llmModelId;
    const embedId = s.aiEmbedModelId || bundle.embedModelId;

    const sttStatus = aiCatalog.MODELS_BY_ID[sttId] ? modelManager.getModelStatus(sttId) : null;
    const llmStatus = aiCatalog.MODELS_BY_ID[llmId] ? modelManager.getModelStatus(llmId) : null;
    const embedStatus = aiCatalog.MODELS_BY_ID[embedId]
      ? modelManager.getModelStatus(embedId)
      : null;

    sttService.configureModel({
      modelId: sttId,
      modelPath: sttStatus?.present ? sttStatus.modelPath : null,
    });
    embeddingService.configureModel({
      modelId: embedId,
      modelPath: embedStatus?.present ? embedStatus.modelPath : null,
    });
    const useExternal = Boolean(
      s.aiUseExternalOllama || tier === 'external-ollama' || tier === 'external-lmstudio',
    );
    const externalKind = tier === 'external-lmstudio' ? 'lmstudio' : 'ollama';
    const extCache = cachedExternalBackends as {
      externalOllama?: { models?: string[] };
      externalLmStudio?: { models?: string[] };
    } | null;
    const fallbackExternalModel =
      externalKind === 'lmstudio'
        ? extCache?.externalLmStudio?.models?.[0] || ''
        : extCache?.externalOllama?.models?.[0] || '';
    const resolvedExternalModel = s.aiOllamaModel || fallbackExternalModel || '';

    const defaultExternalBaseUrl =
      externalKind === 'lmstudio'
        ? String(
            process.env.AGENDAMEA_LMSTUDIO_URL || sharedConstants.DEFAULT_LMSTUDIO_URL,
          ).replace(/\/+$/, '')
        : String(process.env.AGENDAMEA_OLLAMA_URL || sharedConstants.DEFAULT_OLLAMA_URL).replace(
            /\/+$/,
            '',
          );
    const resolvedExternalBaseUrl =
      typeof s.aiExternalBaseUrl === 'string' && s.aiExternalBaseUrl.trim().length > 0
        ? normalizeExternalBase(s.aiExternalBaseUrl)
        : defaultExternalBaseUrl;

    llmService.configure({
      modelId: llmId,
      modelPath: llmStatus?.present ? llmStatus.modelPath : null,
      useExternalOllama: useExternal,
      externalKind,
      externalBaseUrl: resolvedExternalBaseUrl,
      externalModel: resolvedExternalModel,
    });

    return {
      aiEnabled: s.aiEnabled !== false,
      aiTier: tier,
      aiLlmModelId: llmId,
      aiSttModelId: sttId,
      aiEmbedModelId: embedId,
      aiUseExternalOllama: useExternal,
      aiOllamaModel: resolvedExternalModel,
      aiExternalBaseUrl: s.aiExternalBaseUrl || '',
      voiceShortcut: s.voiceShortcut || 'CommandOrControl+Alt+Space',
      voiceAutoStopMs: s.voiceAutoStopMs ?? 1500,
      voiceTtsEnabled: s.voiceTtsEnabled !== false,
      voiceTtsVoice: s.voiceTtsVoice || '',
      voiceTtsStyle: s.voiceTtsStyle || 'natural',
      voiceChimePreset: s.voiceChimePreset || 'soft',
      voiceMicDeviceId: s.voiceMicDeviceId || '',
      voiceNoiseSuppression: s.voiceNoiseSuppression !== false,
      voiceSensitivity: s.voiceSensitivity || 'auto',
      voiceDictationLanguage: s.voiceDictationLanguage || 'auto',
    };
  }

  function createVoiceStoreAdapter() {
    return {
      getTodoById: (id: string) => db.getTodoById(id),
      listToday: () => {
        const today = getLocalDateString();
        return db
          .getTodos()
          .filter(
            (t) =>
              !t.completed &&
              ((t.dueDate && t.dueDate <= today) ||
                (t.startDate && t.startDate <= today && (!t.dueDate || t.dueDate >= today))),
          );
      },
      addTask: (input: Record<string, unknown>) => {
        let categoryId: string | null = null;
        if (typeof input.category === 'string' && input.category.trim()) {
          const wanted = input.category.trim().toLocaleLowerCase('tr-TR');
          const foundCat = db
            .getCategories()
            .find((c) => c.name.toLocaleLowerCase('tr-TR') === wanted);
          if (foundCat) categoryId = foundCat.id;
        }
        const created = db.createTodo({
          title: String(input.title || ''),
          notes: typeof input.notes === 'string' ? input.notes : '',
          dueDate: typeof input.dueDate === 'string' ? input.dueDate : null,
          dueTime: typeof input.dueTime === 'string' ? input.dueTime : null,
          priority:
            input.priority === 'high' || input.priority === 'low' || input.priority === 'normal'
              ? input.priority
              : 'normal',
          important: Boolean(input.important),
          pinned: Boolean(input.pinned),
          tags: Array.isArray(input.tags)
            ? input.tags.filter((x): x is string => typeof x === 'string')
            : [],
          categoryId,
        });
        dispatchConfiguredWebhook('todo.created', created);
        return created;
      },
      completeTask: (selector: string, completed = true) => {
        const target = db.resolveTodoByVoiceSelector(selector);
        if (!target) throw new Error('Görev bulunamadı.');
        const updated = db.updateTodo(target.id, { completed });
        if (!updated) throw new Error('Görev bulunamadı.');
        dispatchConfiguredWebhook(
          !target.completed && updated.completed ? 'todo.completed' : 'todo.updated',
          updated,
        );
        return updated;
      },
      deleteTask: (selector: string) => {
        const target = db.resolveTodoByVoiceSelector(selector);
        if (!target) throw new Error('Görev bulunamadı.');
        const trashed = db.softDeleteTodo(target.id);
        if (trashed) dispatchConfiguredWebhook('todo.deleted', trashed);
        return trashed;
      },
      undoTrash: () => {
        const trashedTodos = db.getTrashedTodos();
        const firstTodo = trashedTodos[0];
        if (firstTodo) {
          const restored = db.restoreTodo(firstTodo.id);
          return { kind: 'todo', item: restored };
        }
        const trashedCats = db.getTrashedCategories();
        const firstCat = trashedCats[0];
        if (firstCat) {
          const restored = db.restoreCategory(firstCat.id);
          return { kind: 'category', item: restored };
        }
        throw new Error('Trash is empty.');
      },
      clearCompleted: () => db.clearCompleted(),
      emptyTrash: () => db.emptyTrash(),
    };
  }

  async function runHybridRagQuery(query: string, opts?: { topK?: number; minScore?: number }) {
    syncAiRuntimeFromSettings();
    let vectorHits: Array<{
      todoId: string;
      chunkIndex: number;
      chunkText: string;
      cosine: number;
    }> = [];
    if (embeddingService.isAvailable()) {
      try {
        vectorHits = await embeddingService.searchVectors(db.getRawDb(), query, {
          topK: Math.max(10, Number(opts?.topK) || 5),
        });
      } catch {
        vectorHits = [];
      }
    }
    return db.searchHybridRag(query, {
      topK: opts?.topK ?? 5,
      minScore: opts?.minScore ?? 0.35,
      vectorHits,
    });
  }

  async function getAiStatusSnapshot(force = false) {
    const [hardware, external] = await Promise.all([
      getHardwareProfileCached(force),
      getExternalBackendsCached(force),
    ]);
    const recommendation = aiCatalog.selectTierRecommendation(hardware, external);
    const settings = syncAiRuntimeFromSettings(recommendation.primaryOptionId);
    const fitMap = new Map(
      recommendation.models.map(
        (m: { id: string; fitsHardware: boolean; warningCode: string | null }) => [m.id, m],
      ),
    );
    const models = modelManager.listModelsStatus().map((st: { id: string }) => {
      const fit = fitMap.get(st.id) as
        | { fitsHardware?: boolean; warningCode?: string | null }
        | undefined;
      return {
        ...st,
        fitsHardware: fit?.fitsHardware ?? true,
        warningCode: fit?.warningCode ?? null,
      };
    });
    return {
      hardware,
      recommendation,
      models,
      installedDiskBytes: modelManager.getInstalledDiskUsageBytes(),
      ragIndexedChunks: db.getRagChunkCount(),
      engines: {
        stt: sttService.getStatus(),
        llm: llmService.getStatus(),
        embedding: embeddingService.getStatus(),
      },
      settings,
    };
  }

  async function unloadAll() {
    clearRagSyncTimer();
    const ignoreUnloadErr = () => {
      // Best-effort engine unload during shutdown
    };
    await Promise.all([
      sttService.unload().catch(ignoreUnloadErr),
      llmService.unload().catch(ignoreUnloadErr),
      embeddingService.unload().catch(ignoreUnloadErr),
    ]);
  }

  return {
    aiModelsDir,
    modelManager,
    piperVoiceManager,
    embeddingService,
    sttService,
    llmService,
    voiceOrchestrator,
    scheduleBackgroundRagSync,
    clearRagSyncTimer,
    getHardwareProfileCached,
    getExternalBackendsCached,
    syncAiRuntimeFromSettings,
    createVoiceStoreAdapter,
    runHybridRagQuery,
    getAiStatusSnapshot,
    unloadAll,
  };
}

export type AiRuntimeService = ReturnType<typeof createAiRuntimeService>;
