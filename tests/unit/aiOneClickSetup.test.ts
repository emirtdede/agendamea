import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sttServiceMod from '../../electron/ai/sttService.cjs';
import { createAiRuntimeService } from '../../server/services/aiRuntime.ts';
import aiCatalog from '../../shared/aiCatalog.cjs';
import { TodoDatabase } from '../../src/db/database.ts';

test('AI Runtime auto-fallback binds installed on-disk LLM/STT models even when settings point to another tier', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-aifallback-'));
  const modelsDir = path.join(tmpDir, 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
  const db = new TodoDatabase(path.join(tmpDir, 'agendamea.db'));

  try {
    // Reproduce exact real-world bug: DB points to tier-medium (qwen3-4b-q4_k_m),
    // while user actually downloaded qwen3-8b-q4_k_m and whisper-small-q5_1!
    const qwen8b = aiCatalog.MODELS_BY_ID['qwen3-8b-q4_k_m'];
    const whisperSmall = aiCatalog.MODELS_BY_ID['whisper-small-q5_1'];
    fs.writeFileSync(path.join(modelsDir, qwen8b.file), Buffer.alloc(64));
    fs.writeFileSync(path.join(modelsDir, whisperSmall.file), Buffer.alloc(64));

    db.updateSettings({
      aiTier: 'tier-medium',
      aiLlmModelId: 'qwen3-4b-q4_k_m',
      aiSttModelId: 'whisper-base-q5_1',
    });

    const runtime = createAiRuntimeService({
      db,
      aiDataDir: tmpDir,
      broadcastSseEvent: () => {
        /* noop */
      },
      dispatchConfiguredWebhook: () => {
        /* noop */
      },
    });

    const synced = runtime.syncAiRuntimeFromSettings();
    assert.equal(synced.aiLlmModelId, 'qwen3-8b-q4_k_m');
    assert.equal(synced.aiSttModelId, 'whisper-small-q5_1');
    assert.equal(runtime.llmService.isAvailable(), true);
    assert.equal(runtime.sttService.getStatus().modelPresent, true);

    const snapshot = await runtime.getAiStatusSnapshot(false);
    assert.equal(snapshot.readiness.dictationReady, true);
    assert.equal(snapshot.readiness.assistantReady, true);
    assert.equal(snapshot.readiness.fullyReady, true);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SttService supports auto language detection and captures quiet laptop microphone speech while rejecting silence', async () => {
  assert.equal(sttServiceMod.mapUiLangToWhisper('auto'), 'auto');
  assert.equal(sttServiceMod.mapUiLangToWhisper('tr'), 'tr');
  assert.equal(sttServiceMod.mapUiLangToWhisper('en'), 'en');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-stt-quiet-'));
  const fakeModel = path.join(tmpDir, 'm.bin');
  fs.writeFileSync(fakeModel, Buffer.alloc(32));
  let seenLang = '';
  try {
    const stt = new sttServiceMod.SttService({
      modelPath: fakeModel,
      idleUnloadMs: 0,
      whisperModule: {
        async initWhisper() {
          return {
            async transcribeData(_buf: ArrayBuffer, opts: { language: string }) {
              seenLang = opts.language;
              return { promise: Promise.resolve({ result: 'Merhaba dünya' }) };
            },
            async release() {
              /* noop */
            },
          };
        },
      },
    });

    // Pure silence still rejected immediately
    const silent = await stt.transcribePcm(new Float32Array(16000).fill(0.0005), 'auto');
    assert.equal(silent.ok, false);
    assert.equal(silent.code, 'SILENCE');

    // Quiet realistic laptop mic signal (0.009 amplitude) passes & auto-normalizes cleanly
    const quietSpeech = new Float32Array(16000).fill(0.009);
    const res = await stt.transcribePcm(quietSpeech, 'auto');
    assert.equal(res.ok, true);
    assert.equal(res.text, 'Merhaba dünya');
    assert.equal(seenLang, 'auto');
    await stt.unload();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AI Runtime rejects incomplete custom profile setup fail-closed with CUSTOM_PROFILE_INCOMPLETE', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-aicustom-'));
  const db = new TodoDatabase(path.join(tmpDir, 'agendamea.db'));
  try {
    const runtime = createAiRuntimeService({
      db,
      aiDataDir: tmpDir,
      broadcastSseEvent: () => {
        /* noop */
      },
      dispatchConfiguredWebhook: () => {
        /* noop */
      },
    });

    await assert.rejects(
      () =>
        runtime.startOneClickSetup({
          profileId: 'custom',
          customModels: {
            sttModelId: 'whisper-base-q5_1',
            llmModelId: '',
            embedModelId: '',
          },
        }),
      (err: unknown) => {
        const e = err as { code?: string; missingRoles?: string[]; statusCode?: number };
        assert.equal(e.code, 'CUSTOM_PROFILE_INCOMPLETE');
        assert.equal(e.statusCode, 400);
        assert.deepEqual(e.missingRoles, ['llm', 'embed']);
        return true;
      },
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
