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

export type LocalAiTierId =
  | 'tier-light'
  | 'tier-medium'
  | 'tier-strong'
  | 'cpu-light'
  | 'cpu-balanced'
  | 'gpu-very-weak'
  | 'gpu-weak'
  | 'gpu-balanced'
  | 'gpu-strong'
  | 'gpu-ultra'
  | 'custom';

export interface CustomAiSetupModels {
  sttModelId: string;
  llmModelId: string;
  embedModelId: string;
}

export interface OneClickSetupRequest {
  tier?: LocalAiTierId;
  profileId?: LocalAiTierId;
  customModels?: CustomAiSetupModels;
}

const VALID_LOCAL_PROFILE_IDS = new Set<string>([
  'tier-light',
  'tier-medium',
  'tier-strong',
  'cpu-light',
  'cpu-balanced',
  'gpu-very-weak',
  'gpu-weak',
  'gpu-balanced',
  'gpu-strong',
  'gpu-ultra',
]);

export interface AiSetupState {
  active: boolean;
  tier: LocalAiTierId;
  phase: 'idle' | 'downloading' | 'configuring' | 'warming' | 'ready' | 'cancelled' | 'error';
  stepIndex: number;
  totalSteps: number;
  currentModelId: string | null;
  currentModelLabel: string | null;
  overallPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  completedModelIds: string[];
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const TIER_PRIORITY: Record<string, number> = {
  'tier-strong': 3,
  'tier-medium': 2,
  'tier-light-plus': 1.5,
  'tier-light': 1,
};

export function createAiRuntimeService(options: {
  db: TodoDatabase;
  aiDataDir: string;
  broadcastSseEvent: (eventPayload: Record<string, unknown>) => void;
  dispatchConfiguredWebhook: (event: string, data: unknown) => void;
}) {
  const { db, aiDataDir, broadcastSseEvent, dispatchConfiguredWebhook } = options;

  const aiModelsDir = path.join(aiDataDir, 'models');
  const aiTtsVoicesDir = path.join(aiDataDir, 'tts-voices');

  let setupCancelRequested = false;
  let setupPromise: Promise<AiSetupState> | null = null;
  let setupModelBytes = new Map<string, number>();
  let setupModelReceived = new Map<string, number>();
  const setupState: AiSetupState = {
    active: false,
    tier: 'tier-light',
    phase: 'idle',
    stepIndex: 0,
    totalSteps: 3,
    currentModelId: null,
    currentModelLabel: null,
    overallPercent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    completedModelIds: [],
    error: null,
    startedAt: null,
    finishedAt: null,
  };

  function getSetupState(): AiSetupState {
    return {
      ...setupState,
      completedModelIds: [...setupState.completedModelIds],
    };
  }

  function broadcastSetupProgress(done = false) {
    broadcastSseEvent({
      type: 'ai.setup.progress',
      setup: getSetupState(),
      done,
    });
  }

  function recomputeSetupTotals() {
    let total = 0;
    let received = 0;
    for (const [id, expected] of setupModelBytes.entries()) {
      total += expected;
      received += Math.min(expected, setupModelReceived.get(id) ?? 0);
    }
    setupState.totalBytes = total;
    setupState.downloadedBytes = received;
    if (setupState.phase === 'downloading' && total > 0) {
      setupState.overallPercent = Math.min(94, Math.max(0, Math.round((received / total) * 94)));
    }
  }

  const modelManager = new modelManagerMod.ModelManager({
    modelsDir: aiModelsDir,
    onProgressEvent: (prog: Record<string, unknown>) => {
      broadcastSseEvent({ type: 'ai.download.progress', ...prog });
      if (
        setupState.active &&
        typeof prog.modelId === 'string' &&
        setupModelBytes.has(prog.modelId)
      ) {
        const expected = setupModelBytes.get(prog.modelId) ?? Number(prog.totalBytes || 0);
        const rec = prog.done
          ? expected
          : Math.min(expected, Math.max(0, Number(prog.receivedBytes || 0)));
        setupModelReceived.set(prog.modelId, rec);
        recomputeSetupTotals();
        broadcastSetupProgress(false);
      }
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
    if (!force && cachedHardwareProfile) {
      // Static hardware (CPU/RAM/GPU/VRAM) never changes during process lifetime; only refresh free disk space!
      const freeDiskBytes = hardwareProfiler.getDiskFreeBytes(aiDataDir);
      const freeDiskGb =
        freeDiskBytes !== null
          ? Math.round((freeDiskBytes / hardwareProfiler.GIB) * 10) / 10
          : null;
      cachedHardwareProfile = {
        ...cachedHardwareProfile,
        freeDiskBytes,
        freeDiskGb,
      };
      return cachedHardwareProfile;
    }
    const profile = await hardwareProfiler.profileHardware({ targetDir: aiDataDir });
    cachedHardwareProfile = profile;
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

  type ModelStatusRow = {
    id: string;
    role: string;
    tier: string;
    present: boolean;
    verified: boolean;
    modelPath: string;
  };

  function resolveInstalledModelForRole(
    preferredId: string,
    role: 'stt' | 'llm' | 'embed',
    getAllStatuses: () => ModelStatusRow[],
  ): { modelId: string; modelPath: string | null; present: boolean } {
    const preferredStatus = aiCatalog.MODELS_BY_ID[preferredId]
      ? modelManager.getModelStatus(preferredId)
      : null;
    if (preferredStatus?.present) {
      return { modelId: preferredId, modelPath: preferredStatus.modelPath, present: true };
    }
    // Auto-fallback to any installed model of the same role on disk (reuses single listModelsStatus pass!)
    const allStatuses = getAllStatuses();
    const candidates = allStatuses
      .filter((m) => m.role === role && m.present)
      .sort((a, b) => {
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return (TIER_PRIORITY[b.tier] ?? 0) - (TIER_PRIORITY[a.tier] ?? 0);
      });
    const best = candidates[0];
    if (best) {
      return { modelId: best.id, modelPath: best.modelPath, present: true };
    }
    return { modelId: preferredId, modelPath: null, present: false };
  }

  function syncAiRuntimeFromSettings(defaultTier = 'tier-light') {
    const s = db.getSettings();
    const tier = s.aiTier || defaultTier || 'tier-light';
    const bundle = aiCatalog.getProfilePreset(
      VALID_LOCAL_PROFILE_IDS.has(tier) ? tier : 'tier-light',
    );
    const preferredSttId = s.aiSttModelId || bundle.sttModelId;
    const preferredLlmId = s.aiLlmModelId || bundle.llmModelId;
    const preferredEmbedId = s.aiEmbedModelId || bundle.embedModelId;

    let cachedAllStatuses: ModelStatusRow[] | null = null;
    const getAllStatuses = (): ModelStatusRow[] => {
      if (!cachedAllStatuses) {
        cachedAllStatuses = modelManager.listModelsStatus() as ModelStatusRow[];
      }
      return cachedAllStatuses;
    };

    const resolvedStt = resolveInstalledModelForRole(preferredSttId, 'stt', getAllStatuses);
    const resolvedLlm = resolveInstalledModelForRole(preferredLlmId, 'llm', getAllStatuses);
    const resolvedEmbed = resolveInstalledModelForRole(preferredEmbedId, 'embed', getAllStatuses);

    sttService.configureModel({
      modelId: resolvedStt.modelId,
      modelPath: resolvedStt.present ? resolvedStt.modelPath : null,
    });
    embeddingService.configureModel({
      modelId: resolvedEmbed.modelId,
      modelPath: resolvedEmbed.present ? resolvedEmbed.modelPath : null,
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
      modelId: resolvedLlm.modelId,
      modelPath: resolvedLlm.present ? resolvedLlm.modelPath : null,
      useExternalOllama: useExternal,
      externalKind,
      externalBaseUrl: resolvedExternalBaseUrl,
      externalModel: resolvedExternalModel,
    });

    return {
      aiEnabled: s.aiEnabled !== false,
      aiTier: tier,
      aiLlmModelId: resolvedLlm.modelId,
      aiSttModelId: resolvedStt.modelId,
      aiEmbedModelId: resolvedEmbed.modelId,
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

  function activateModel(modelId: string, options?: { onlyIfRoleMissing?: boolean }) {
    const spec = aiCatalog.MODELS_BY_ID[modelId] as
      | { id: string; role: 'stt' | 'llm' | 'embed' }
      | undefined;
    if (!spec) return { ok: false, error: 'UNKNOWN_MODEL' };
    const status = modelManager.getModelStatus(modelId);
    if (!status?.present) return { ok: false, error: 'MODEL_NOT_INSTALLED' };

    const cur = db.getSettings();
    const patch: Record<string, unknown> = { aiEnabled: true };
    if (spec.role === 'stt') {
      const curStt = cur.aiSttModelId ? modelManager.getModelStatus(cur.aiSttModelId) : null;
      if (!options?.onlyIfRoleMissing || !curStt?.present) {
        patch.aiSttModelId = modelId;
      }
    } else if (spec.role === 'llm') {
      const curLlm = cur.aiLlmModelId ? modelManager.getModelStatus(cur.aiLlmModelId) : null;
      if (!options?.onlyIfRoleMissing || !curLlm?.present) {
        patch.aiLlmModelId = modelId;
        patch.aiUseExternalOllama = false;
      }
    } else if (spec.role === 'embed') {
      const curEmb = cur.aiEmbedModelId ? modelManager.getModelStatus(cur.aiEmbedModelId) : null;
      if (!options?.onlyIfRoleMissing || !curEmb?.present) {
        patch.aiEmbedModelId = modelId;
      }
    }
    if (Object.keys(patch).length > 1) {
      db.updateSettings(patch);
    }
    syncAiRuntimeFromSettings();
    return { ok: true, modelId, role: spec.role };
  }

  async function warmupEngines(opts?: { includeLlm?: boolean }) {
    syncAiRuntimeFromSettings();
    const stt = await sttService.warmup();
    let llm: { ok: boolean; loaded?: boolean; code?: string } | undefined;
    if (opts?.includeLlm) {
      llm = await llmService.warmup();
    } else if (llmService.isAvailable() && !llmService.getStatus().loaded) {
      // Pre-warm local LLM asynchronously so follow-up live Q&A responds in ~1-2s instead of cold-loading
      void llmService.warmup().catch(() => {
        /* non-blocking background warmup */
      });
    }
    return {
      ok: Boolean(stt.ok || llm?.ok),
      stt,
      ...(llm ? { llm } : {}),
    };
  }

  async function startOneClickSetup(
    input?: LocalAiTierId | OneClickSetupRequest,
  ): Promise<AiSetupState> {
    if (setupState.active && setupPromise) {
      return getSetupState();
    }
    const reqObj: OneClickSetupRequest =
      typeof input === 'string' ? { tier: input } : (input ?? {});
    const requestedId = reqObj.profileId ?? reqObj.tier;

    let targetTier: LocalAiTierId = 'tier-light';
    let resolvedSttId: string;
    let resolvedLlmId: string;
    let resolvedEmbedId: string;

    if (requestedId === 'custom' || reqObj.customModels) {
      const checked = aiCatalog.validateCustomProfileSelection(reqObj.customModels);
      if (!checked.ok) {
        const err = new Error(
          `Custom profile requires 1 STT, 1 LLM, and 1 Embedding model (missing: ${checked.missingRoles.join(', ')}).`,
        ) as Error & { code?: string; missingRoles?: string[]; statusCode?: number };
        err.code = 'CUSTOM_PROFILE_INCOMPLETE';
        err.missingRoles = checked.missingRoles;
        err.statusCode = 400;
        throw err;
      }
      targetTier = 'custom';
      resolvedSttId = checked.sttModelId;
      resolvedLlmId = checked.llmModelId;
      resolvedEmbedId = checked.embedModelId;
    } else if (requestedId && VALID_LOCAL_PROFILE_IDS.has(requestedId)) {
      targetTier = requestedId as LocalAiTierId;
      const preset = aiCatalog.getProfilePreset(targetTier);
      resolvedSttId = preset.sttModelId;
      resolvedLlmId = preset.llmModelId;
      resolvedEmbedId = preset.embedModelId;
    } else {
      const hw = await getHardwareProfileCached(false);
      const rec = aiCatalog.selectTierRecommendation(hw, cachedExternalBackends || undefined);
      const recProfile = rec?.recommendedProfileId || rec?.recommendedTier;
      targetTier =
        recProfile && VALID_LOCAL_PROFILE_IDS.has(recProfile)
          ? (recProfile as LocalAiTierId)
          : 'tier-light';
      const preset = aiCatalog.getProfilePreset(targetTier);
      resolvedSttId = preset.sttModelId;
      resolvedLlmId = preset.llmModelId;
      resolvedEmbedId = preset.embedModelId;
    }

    const bundle = {
      sttModelId: resolvedSttId,
      llmModelId: resolvedLlmId,
      embedModelId: resolvedEmbedId,
    };
    const modelIds: string[] = [bundle.sttModelId, bundle.llmModelId, bundle.embedModelId];

    setupCancelRequested = false;
    setupModelBytes = new Map();
    setupModelReceived = new Map();
    const alreadyDone: string[] = [];

    for (const id of modelIds) {
      const spec = aiCatalog.MODELS_BY_ID[id];
      const st = modelManager.getModelStatus(id);
      const expected = Number(spec?.bytes || 0);
      setupModelBytes.set(id, expected);
      if (st?.present && st?.verified) {
        setupModelReceived.set(id, expected);
        alreadyDone.push(id);
      } else {
        setupModelReceived.set(id, Number(st?.partialBytes || 0));
      }
    }

    setupState.active = true;
    setupState.tier = targetTier;
    setupState.phase = 'downloading';
    setupState.stepIndex = alreadyDone.length;
    setupState.totalSteps = modelIds.length;
    setupState.currentModelId = null;
    setupState.currentModelLabel = null;
    setupState.completedModelIds = alreadyDone;
    setupState.error = null;
    setupState.startedAt = Date.now();
    setupState.finishedAt = null;
    recomputeSetupTotals();
    broadcastSetupProgress(false);

    const run = async (): Promise<AiSetupState> => {
      try {
        for (let idx = 0; idx < modelIds.length; idx += 1) {
          if (setupCancelRequested) {
            setupState.phase = 'cancelled';
            setupState.active = false;
            setupState.finishedAt = Date.now();
            broadcastSetupProgress(true);
            return getSetupState();
          }
          const modelId = modelIds[idx];
          if (!modelId) continue;
          const spec = aiCatalog.MODELS_BY_ID[modelId];
          const st = modelManager.getModelStatus(modelId);
          setupState.stepIndex = idx + 1;
          setupState.currentModelId = modelId;
          setupState.currentModelLabel = spec?.label || modelId;

          if (st?.present && st?.verified) {
            setupModelReceived.set(modelId, Number(spec?.bytes || 0));
            if (!setupState.completedModelIds.includes(modelId)) {
              setupState.completedModelIds.push(modelId);
            }
            recomputeSetupTotals();
            broadcastSetupProgress(false);
            continue;
          }

          broadcastSetupProgress(false);
          const dlRes = await modelManager.downloadModel(modelId);
          if (!dlRes?.ok) {
            const code = String(dlRes?.code || 'DOWNLOAD_FAILED');
            if (setupCancelRequested || code === 'CANCELLED') {
              setupState.phase = 'cancelled';
              setupState.error = null;
            } else {
              setupState.phase = 'error';
              setupState.error = String(dlRes?.error || code);
            }
            setupState.active = false;
            setupState.finishedAt = Date.now();
            broadcastSetupProgress(true);
            return getSetupState();
          }

          setupModelReceived.set(modelId, Number(spec?.bytes || 0));
          if (!setupState.completedModelIds.includes(modelId)) {
            setupState.completedModelIds.push(modelId);
          }
          recomputeSetupTotals();
          broadcastSetupProgress(false);
        }

        // Configure & persist active bundle cleanly
        setupState.phase = 'configuring';
        setupState.currentModelId = null;
        setupState.currentModelLabel = null;
        setupState.overallPercent = 96;
        broadcastSetupProgress(false);

        db.updateSettings({
          aiEnabled: true,
          aiUseExternalOllama: false,
          aiTier: targetTier,
          aiSttModelId: bundle.sttModelId,
          aiLlmModelId: bundle.llmModelId,
          aiEmbedModelId: bundle.embedModelId,
        });
        syncAiRuntimeFromSettings(targetTier);

        // Warm up STT & sync RAG index so first use works immediately
        setupState.phase = 'warming';
        setupState.overallPercent = 98;
        broadcastSetupProgress(false);

        const warmupRes = await sttService.warmup().catch(() => ({
          ok: false,
          code: 'STT_UNAVAILABLE',
        }));
        if (!warmupRes?.ok) {
          setupState.phase = 'error';
          setupState.error = String(warmupRes?.code || 'STT_UNAVAILABLE');
          setupState.active = false;
          setupState.finishedAt = Date.now();
          broadcastSetupProgress(true);
          return getSetupState();
        }
        if (embeddingService.isAvailable()) {
          void embeddingService.syncTodosIndex(db.getRawDb(), db.getTodos()).catch(() => {
            // Non-blocking background RAG sync
          });
        }

        setupState.phase = 'ready';
        setupState.overallPercent = 100;
        setupState.active = false;
        setupState.finishedAt = Date.now();
        broadcastSetupProgress(true);
        return getSetupState();
      } catch (err) {
        setupState.phase = 'error';
        setupState.error = err instanceof Error ? err.message : String(err);
        setupState.active = false;
        setupState.finishedAt = Date.now();
        broadcastSetupProgress(true);
        return getSetupState();
      } finally {
        setupPromise = null;
      }
    };

    setupPromise = run();
    return getSetupState();
  }

  function cancelOneClickSetup(): AiSetupState {
    setupCancelRequested = true;
    if (setupState.currentModelId) {
      try {
        modelManager.cancelDownload(setupState.currentModelId, { cleanPart: false });
      } catch {
        // Ignore cancel failure
      }
    }
    if (setupState.active) {
      setupState.phase = 'cancelled';
      setupState.active = false;
      setupState.finishedAt = Date.now();
      broadcastSetupProgress(true);
    }
    return getSetupState();
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
    const sttStatusSnap = sttService.getStatus();
    const llmStatusSnap = llmService.getStatus();
    const embedStatusSnap = embeddingService.getStatus();
    const dictationReady = Boolean(sttStatusSnap.modelPresent);
    const assistantReady = Boolean(llmStatusSnap.available);
    const semanticSearchReady = Boolean(embedStatusSnap.available);
    return {
      hardware,
      recommendation,
      models,
      installedDiskBytes: modelManager.getInstalledDiskUsageBytes(),
      ragIndexedChunks: db.getRagChunkCount(),
      engines: {
        stt: sttStatusSnap,
        llm: llmStatusSnap,
        embedding: embedStatusSnap,
      },
      readiness: {
        dictationReady,
        assistantReady,
        semanticSearchReady,
        fullyReady: dictationReady && assistantReady,
      },
      setup: getSetupState(),
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
    activateModel,
    getSetupState,
    startOneClickSetup,
    cancelOneClickSetup,
    warmupEngines,
    createVoiceStoreAdapter,
    runHybridRagQuery,
    getAiStatusSnapshot,
    unloadAll,
  };
}

export type AiRuntimeService = ReturnType<typeof createAiRuntimeService>;
