import express from 'express';
import sttServiceMod from '../../electron/ai/sttService.cjs';
import aiCatalog from '../../shared/aiCatalog.cjs';
import piperVoicesMod from '../../shared/piperVoices.cjs';
import schemas from '../../shared/schemas/index.cjs';
import voiceIntentParser from '../../shared/voiceIntentParser.cjs';
import { sendRouteError } from '../middleware/security.ts';
import { validateBody } from '../middleware/validate.ts';
import { createComponentLogger } from '../services/logger.ts';
import type { ServerContext } from '../types.ts';

const aiRouteLog = createComponentLogger('ai-routes');

const MAX_ASK_TEXT_LEN = 2000;
const MAX_PCM_SAMPLES = 480_000;

function polishFastTranscript(raw: string): string {
  const collapsed = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  if (!collapsed) return '';
  return collapsed.charAt(0).toLocaleUpperCase('tr-TR') + collapsed.slice(1);
}

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

  app.get('/api/ai/setup/status', (_req, res) => {
    try {
      res.json({ ok: true, setup: aiRuntime.getSetupState() });
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/setup/status', err, 'Kurulum durumu alınamadı.');
    }
  });

  app.post('/api/ai/setup', async (req, res) => {
    try {
      const body = req.body ?? {};
      const validIds = new Set([
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
        'custom',
      ]);
      const rawProfile =
        typeof body.profileId === 'string' && validIds.has(body.profileId)
          ? body.profileId
          : undefined;
      const rawTier =
        typeof body.tier === 'string' && validIds.has(body.tier) ? body.tier : undefined;
      const customModels =
        body.customModels && typeof body.customModels === 'object'
          ? {
              sttModelId: String(body.customModels.sttModelId || ''),
              llmModelId: String(body.customModels.llmModelId || ''),
              embedModelId: String(body.customModels.embedModelId || ''),
            }
          : undefined;
      const setup = await aiRuntime.startOneClickSetup({
        tier: rawTier as never,
        profileId: rawProfile as never,
        customModels,
      });
      res.status(setup.active ? 202 : 200).json({ ok: true, setup });
    } catch (err) {
      const e = err as Error & { code?: string; missingRoles?: string[]; statusCode?: number };
      if (e?.code === 'CUSTOM_PROFILE_INCOMPLETE' || e?.statusCode === 400) {
        res.status(400).json({
          ok: false,
          code: e.code || 'CUSTOM_PROFILE_INCOMPLETE',
          missingRoles: e.missingRoles || [],
          error: e.message,
        });
        return;
      }
      sendRouteError(res, 'POST /api/ai/setup', err, 'Tek tıkla kurulum başlatılamadı.');
    }
  });

  app.post('/api/ai/setup/cancel', (_req, res) => {
    try {
      const setup = aiRuntime.cancelOneClickSetup();
      res.json({ ok: true, setup });
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/setup/cancel', err, 'Kurulum iptal edilemedi.');
    }
  });

  app.post('/api/ai/warmup', async (req, res) => {
    try {
      const result = await aiRuntime.warmupEngines({
        includeLlm: Boolean(req.body?.includeLlm),
      });
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/warmup', err, 'Yapay zeka motoru hazırlanamadı.');
    }
  });

  app.post('/api/ai/models/:id/activate', (req, res) => {
    try {
      const modelId = req.params.id;
      const result = aiRuntime.activateModel(modelId);
      if (!result.ok) {
        res.status(result.error === 'UNKNOWN_MODEL' ? 404 : 400).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/models/:id/activate', err, 'Model etkinleştirilemedi.');
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
      const forceActivate = Boolean(req.body?.activate);
      if (syncWait) {
        const result = await modelManager.downloadModel(modelId);
        if (result?.ok) {
          aiRuntime.activateModel(modelId, { onlyIfRoleMissing: !forceActivate });
        }
        res.status(result.ok ? 200 : 400).json(result);
        return;
      }
      void modelManager
        .downloadModel(modelId)
        .then((result: { ok?: boolean }) => {
          if (result?.ok) {
            aiRuntime.activateModel(modelId, { onlyIfRoleMissing: !forceActivate });
          }
        })
        .catch((err: unknown) => {
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

  app.post(
    '/api/ai/transcribe',
    express.raw({ type: 'application/octet-stream', limit: '3mb' }),
    async (req, res) => {
      try {
        const isBinaryPcm16 = Buffer.isBuffer(req.body);
        const body = isBinaryPcm16 ? {} : (req.body ?? {});
        const currentSettings = db.getSettings();
        const configuredDictationLang =
          currentSettings.voiceDictationLanguage &&
          currentSettings.voiceDictationLanguage !== 'auto'
            ? currentSettings.voiceDictationLanguage
            : 'auto';
        const rawLangParam = isBinaryPcm16 ? req.query.language : body.language;
        const language =
          typeof rawLangParam === 'string' && rawLangParam.trim()
            ? rawLangParam.trim()
            : configuredDictationLang;
        const wantCleanup = isBinaryPcm16
          ? req.query.cleanup === '1' || req.query.cleanup === 'true'
          : Boolean(body.cleanup);

        let samples: Float32Array | Int16Array | null = null;
        if (isBinaryPcm16) {
          const rawBuf = req.body as Buffer;
          if (rawBuf.byteLength > MAX_PCM_SAMPLES * 2) {
            res.status(413).json({
              ok: false,
              code: 'AUDIO_TOO_LONG',
              error: 'Ses kaydı en fazla 30 saniye olabilir.',
            });
            return;
          }
          if (rawBuf.byteLength >= 2 && rawBuf.byteLength % 2 === 0) {
            if (rawBuf.byteOffset % 2 === 0) {
              samples = new Int16Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength / 2);
            } else {
              const copy = new Uint8Array(rawBuf.byteLength);
              copy.set(rawBuf);
              samples = new Int16Array(copy.buffer);
            }
          }
        } else if (typeof body.pcmBase64 === 'string' && body.pcmBase64.length > 0) {
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
        if (sttRes.ok && sttRes.text) {
          let finalText = polishFastTranscript(sttRes.text);
          let cleaned = finalText !== sttRes.text;
          // Only apply LLM dictation polish when local LLM is already warm in memory (zero cold-load stall)
          const llmSnap = llmService.getStatus();
          if (
            wantCleanup &&
            llmSnap.available &&
            (llmSnap.loaded || llmSnap.backend !== 'node-llama-cpp')
          ) {
            const cleanupLang = language !== 'auto' ? language : currentSettings.language || 'tr';
            const polished = await llmService.cleanDictationText({
              text: finalText,
              language: cleanupLang,
            });
            if (polished?.text) {
              finalText = polishFastTranscript(polished.text);
              cleaned = cleaned || Boolean(polished.cleaned);
            }
          }
          const intentParsed = voiceIntentParser.parseVoiceIntent(finalText);
          const extracted = voiceIntentParser.extractUniversalTaskFields(finalText);
          const parsedTitle =
            intentParsed.intent === 'add_task' && typeof intentParsed.payload?.title === 'string'
              ? intentParsed.payload.title
              : extracted.cleaned || finalText;
          res.json({
            ...sttRes,
            rawText: sttRes.text,
            text: finalText,
            cleaned,
            parsed: {
              intent: intentParsed.intent,
              title: parsedTitle,
              dueDate:
                intentParsed.intent === 'add_task'
                  ? (intentParsed.payload?.dueDate ?? extracted.dueDate ?? null)
                  : (extracted.dueDate ?? null),
              dueTime:
                intentParsed.intent === 'add_task'
                  ? (intentParsed.payload?.dueTime ?? extracted.dueTime ?? null)
                  : (extracted.dueTime ?? null),
              priority:
                intentParsed.intent === 'add_task'
                  ? (intentParsed.payload?.priority ?? extracted.priority ?? 'normal')
                  : (extracted.priority ?? 'normal'),
              important: Boolean(
                intentParsed.intent === 'add_task'
                  ? (intentParsed.payload?.important ?? extracted.important)
                  : extracted.important,
              ),
              category:
                (intentParsed.intent === 'add_task' ? intentParsed.payload?.category : null) ??
                extracted.category ??
                null,
              tags:
                (intentParsed.intent === 'add_task' ? intentParsed.payload?.tags : null) ??
                extracted.tags ??
                [],
            },
          });
          return;
        }
        res.json(sttRes);
      } catch (err) {
        sendRouteError(res, 'POST /api/ai/transcribe', err, 'Ses deşifre edilemedi.');
      }
    },
  );

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
