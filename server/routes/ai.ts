import sttServiceMod from '../../electron/ai/sttService.cjs';
import aiCatalog from '../../shared/aiCatalog.cjs';
import piperVoicesMod from '../../shared/piperVoices.cjs';
import schemas from '../../shared/schemas/index.cjs';
import { sendRouteError } from '../middleware/security.ts';
import { validateBody } from '../middleware/validate.ts';
import { createComponentLogger } from '../services/logger.ts';
import type { ServerContext } from '../types.ts';

const aiRouteLog = createComponentLogger('ai-routes');

const MAX_ASK_TEXT_LEN = 2000;
const MAX_PCM_SAMPLES = 480_000;

export function registerAiRoutes(ctx: ServerContext): void {
  const { app, db, aiRuntime, cloudSync, broadcastExternalChange } = ctx;
  const {
    aiModelsDir,
    modelManager,
    piperVoiceManager,
    embeddingService,
    sttService,
    llmService,
    voiceOrchestrator,
  } = aiRuntime;

  app.get('/api/ai/hardware', async (req, res) => {
    try {
      const force = req.query.force === '1' || req.query.force === 'true';
      const hardware = await aiRuntime.getHardwareProfileCached(force);
      res.json(hardware);
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/hardware', err, 'Donanım profili alınamadı.');
    }
  });

  app.get('/api/ai/status', async (req, res) => {
    try {
      const force = req.query.force === '1' || req.query.force === 'true';
      res.json(await aiRuntime.getAiStatusSnapshot(force));
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/status', err, 'Yapay zeka durumu alınamadı.');
    }
  });

  app.get('/api/ai/models', (_req, res) => {
    try {
      res.json({
        modelsDir: aiModelsDir,
        installedDiskBytes: modelManager.getInstalledDiskUsageBytes(),
        models: modelManager.listModelsStatus(),
      });
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/models', err, 'Model listesi alınamadı.');
    }
  });

  app.post('/api/ai/models/:id/download', async (req, res) => {
    try {
      const modelId = req.params.id;
      if (!aiCatalog.MODELS_BY_ID[modelId]) {
        res.status(404).json({ ok: false, code: 'UNKNOWN_MODEL', error: 'Model bulunamadı.' });
        return;
      }
      const syncWait = req.query.sync === '1' || Boolean(req.body?.sync);
      if (syncWait) {
        const result = await modelManager.downloadModel(modelId);
        res.status(result.ok ? 200 : 400).json(result);
        return;
      }
      void modelManager.downloadModel(modelId).catch((err: unknown) => {
        aiRouteLog.warn({ err, modelId }, 'Background model download ended with error');
      });
      res.status(202).json({
        ok: true,
        started: true,
        modelId,
        status: modelManager.getModelStatus(modelId),
      });
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/models/:id/download', err, 'Model indirilemedi.');
    }
  });

  app.post('/api/ai/models/:id/cancel', (req, res) => {
    try {
      const result = modelManager.cancelDownload(req.params.id, {
        cleanPart: Boolean(req.body?.cleanPart),
      });
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/models/:id/cancel', err, 'İndirme iptal edilemedi.');
    }
  });

  app.delete('/api/ai/models/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      if (targetId === 'all') {
        await Promise.all([
          sttService.unload().catch((err: unknown) => {
            aiRouteLog.debug({ err }, 'STT unload ignored during delete all');
          }),
          llmService.unload().catch((err: unknown) => {
            aiRouteLog.debug({ err }, 'LLM unload ignored during delete all');
          }),
          embeddingService.unload().catch((err: unknown) => {
            aiRouteLog.debug({ err }, 'Embedding unload ignored during delete all');
          }),
        ]);
        res.json(modelManager.deleteAllModels());
        return;
      }
      if (!aiCatalog.MODELS_BY_ID[targetId]) {
        res.status(404).json({ ok: false, error: 'Model bulunamadı.' });
        return;
      }
      if (sttService.modelId === targetId) {
        await sttService.unload().catch((err: unknown) => {
          aiRouteLog.debug({ err, targetId }, 'STT unload ignored during delete');
        });
      }
      if (llmService.modelId === targetId) {
        await llmService.unload().catch((err: unknown) => {
          aiRouteLog.debug({ err, targetId }, 'LLM unload ignored during delete');
        });
      }
      if (embeddingService.modelId === targetId) {
        await embeddingService.unload().catch((err: unknown) => {
          aiRouteLog.debug({ err, targetId }, 'Embedding unload ignored during delete');
        });
      }
      res.json(modelManager.deleteModel(targetId));
    } catch (err) {
      sendRouteError(res, 'DELETE /api/ai/models/:id', err, 'Model silinemedi.');
    }
  });

  app.post('/api/ai/rag/reindex', async (_req, res) => {
    try {
      aiRuntime.syncAiRuntimeFromSettings();
      db.rebuildSearchIndex();
      const result = await embeddingService.syncTodosIndex(db.getRawDb(), db.getTodos());
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/rag/reindex', err, 'RAG indeksi güncellenemedi.');
    }
  });

  app.get('/api/ai/rag/search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, MAX_ASK_TEXT_LEN) : '';
      const rawTopK = Number(req.query.topK);
      const topK = Number.isFinite(rawTopK) ? Math.min(50, Math.max(1, Math.trunc(rawTopK))) : 5;
      const rawMinScore = req.query.minScore !== undefined ? Number(req.query.minScore) : 0.35;
      const minScore = Number.isFinite(rawMinScore) ? Math.min(1, Math.max(0, rawMinScore)) : 0.35;
      res.json(await aiRuntime.runHybridRagQuery(q, { topK, minScore }));
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/rag/search', err, 'RAG araması yapılamadı.');
    }
  });

  app.post(
    '/api/ai/rag/search',
    validateBody(schemas.AiRagSearchBodySchema, 'Geçersiz RAG arama isteği.'),
    async (req, res) => {
      try {
        const q =
          typeof req.body?.query === 'string' ? req.body.query.slice(0, MAX_ASK_TEXT_LEN) : '';
        const rawTopK = Number(req.body?.topK);
        const topK = Number.isFinite(rawTopK) ? Math.min(50, Math.max(1, Math.trunc(rawTopK))) : 5;
        const rawMinScore = req.body?.minScore !== undefined ? Number(req.body.minScore) : 0.35;
        const minScore = Number.isFinite(rawMinScore)
          ? Math.min(1, Math.max(0, rawMinScore))
          : 0.35;
        res.json(await aiRuntime.runHybridRagQuery(q, { topK, minScore }));
      } catch (err) {
        sendRouteError(res, 'POST /api/ai/rag/search', err, 'RAG araması yapılamadı.');
      }
    },
  );

  app.post(
    '/api/ai/ask',
    validateBody(schemas.AiAskBodySchema, 'Geçersiz sesli komut isteği.'),
    async (req, res) => {
      try {
        const body = req.body ?? {};
        const text =
          typeof body.text === 'string' ? body.text.trim().slice(0, MAX_ASK_TEXT_LEN) : '';
        const language =
          typeof body.language === 'string' && body.language.trim()
            ? body.language.trim()
            : db.getSettings().language || 'en';
        const readOnly = Boolean(body.readOnly);
        const confirmToken = typeof body.confirmToken === 'string' ? body.confirmToken : null;
        const selectedTodoId = typeof body.selectedTodoId === 'string' ? body.selectedTodoId : null;

        const runtime = aiRuntime.syncAiRuntimeFromSettings();
        if (runtime.aiUseExternalOllama && !runtime.aiOllamaModel) {
          await aiRuntime.getExternalBackendsCached(true);
          aiRuntime.syncAiRuntimeFromSettings();
        }
        const result = await voiceOrchestrator.handleUtterance({
          text,
          language,
          readOnly,
          confirmToken,
          selectedTodoId,
          storeAdapter: aiRuntime.createVoiceStoreAdapter(),
          ragSearchFn: (q: string, opts?: { topK?: number; minScore?: number }) =>
            aiRuntime.runHybridRagQuery(q, opts),
          llmService,
        });

        if (result.mutated) {
          broadcastExternalChange('POST /api/ai/ask');
          cloudSync.triggerOneDriveAutoSync();
          aiRuntime.scheduleBackgroundRagSync();
        }
        res.json(result);
      } catch (err) {
        sendRouteError(res, 'POST /api/ai/ask', err, 'Sesli/metin komutu işlenemedi.');
      }
    },
  );

  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const body = req.body ?? {};
      const currentSettings = db.getSettings();
      const configuredDictationLang =
        currentSettings.voiceDictationLanguage && currentSettings.voiceDictationLanguage !== 'auto'
          ? currentSettings.voiceDictationLanguage
          : currentSettings.language || 'en';
      const language =
        typeof body.language === 'string' &&
        body.language.trim() &&
        body.language.trim().toLowerCase() !== 'auto'
          ? body.language.trim()
          : configuredDictationLang;

      let samples: Float32Array | null = null;
      if (typeof body.pcmBase64 === 'string' && body.pcmBase64.length > 0) {
        const rawBuf = Buffer.from(body.pcmBase64, 'base64');
        if (rawBuf.byteLength > MAX_PCM_SAMPLES * 4) {
          res.status(413).json({
            ok: false,
            code: 'AUDIO_TOO_LONG',
            error: 'Ses kaydı en fazla 30 saniye olabilir.',
          });
          return;
        }
        samples = sttServiceMod.toFloat32Array(rawBuf);
      } else if (Array.isArray(body.pcm)) {
        if (body.pcm.length > MAX_PCM_SAMPLES) {
          res.status(413).json({
            ok: false,
            code: 'AUDIO_TOO_LONG',
            error: 'Ses kaydı en fazla 30 saniye olabilir.',
          });
          return;
        }
        samples = sttServiceMod.toFloat32Array(body.pcm);
      }
      if (!samples) {
        res.status(400).json({ ok: false, code: 'INVALID_AUDIO', error: 'Geçersiz ses verisi.' });
        return;
      }

      aiRuntime.syncAiRuntimeFromSettings();
      const sttRes = await sttService.transcribePcm(samples, language);
      res.json(sttRes);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/transcribe', err, 'Ses deşifre edilemedi.');
    }
  });

  app.get('/api/ai/tts-voices', (_req, res) => {
    try {
      res.json({ voices: piperVoiceManager.listVoices() });
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/tts-voices', err, 'Ses paketleri listelenemedi.');
    }
  });

  app.post('/api/ai/tts-voices/download', async (req, res) => {
    try {
      const voiceId = typeof req.body?.voiceId === 'string' ? req.body.voiceId.trim() : '';
      if (!voiceId || !piperVoicesMod.PIPER_VOICES_BY_ID[voiceId]) {
        res.status(400).json({ ok: false, error: 'Geçersiz ses paketi kimliği.' });
        return;
      }
      res.json(await piperVoiceManager.downloadVoice(voiceId));
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/tts-voices/download', err, 'Ses paketi indirilemedi.');
    }
  });

  app.post('/api/ai/tts-voices/cancel', (req, res) => {
    try {
      const voiceId = typeof req.body?.voiceId === 'string' ? req.body.voiceId.trim() : '';
      if (!voiceId || !piperVoicesMod.PIPER_VOICES_BY_ID[voiceId]) {
        res.status(400).json({ ok: false, error: 'Geçersiz ses paketi kimliği.' });
        return;
      }
      res.json(piperVoiceManager.cancelDownload(voiceId));
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/tts-voices/cancel', err, 'İndirme iptal edilemedi.');
    }
  });

  app.delete('/api/ai/tts-voices/:id', (req, res) => {
    try {
      const voiceId = String(req.params.id || '').trim();
      if (!voiceId || !piperVoicesMod.PIPER_VOICES_BY_ID[voiceId]) {
        res.status(404).json({ ok: false, error: 'Ses paketi bulunamadı.' });
        return;
      }
      res.json(piperVoiceManager.deleteVoice(voiceId));
    } catch (err) {
      sendRouteError(res, 'DELETE /api/ai/tts-voices/:id', err, 'Ses paketi silinemedi.');
    }
  });

  app.get('/api/ai/tts-voices/:id/config', (req, res) => {
    try {
      const voiceId = String(req.params.id || '').trim();
      if (!voiceId || !piperVoicesMod.PIPER_VOICES_BY_ID[voiceId]) {
        res.status(404).json({ error: 'Ses paketi bulunamadı.' });
        return;
      }
      const paths = piperVoiceManager.getVoicePaths(voiceId);
      if (!paths.installed) {
        res.status(404).json({ error: 'Ses paketi henüz indirilmedi.' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.sendFile(paths.configPath);
    } catch (err) {
      sendRouteError(
        res,
        'GET /api/ai/tts-voices/:id/config',
        err,
        'Ses yapılandırması okunamadı.',
      );
    }
  });

  app.get('/api/ai/tts-voices/:id/onnx', (req, res) => {
    try {
      const voiceId = String(req.params.id || '').trim();
      if (!voiceId || !piperVoicesMod.PIPER_VOICES_BY_ID[voiceId]) {
        res.status(404).json({ error: 'Ses paketi bulunamadı.' });
        return;
      }
      const paths = piperVoiceManager.getVoicePaths(voiceId);
      if (!paths.installed) {
        res.status(404).json({ error: 'Ses paketi henüz indirilmedi.' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.sendFile(paths.onnxPath);
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/tts-voices/:id/onnx', err, 'Ses modeli okunamadı.');
    }
  });
}
