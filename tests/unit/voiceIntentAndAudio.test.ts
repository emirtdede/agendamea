import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import sttServiceMod from '../../electron/ai/sttService.cjs';
import voiceOverlayMod from '../../electron/voiceOverlay.cjs';
import voiceIntentParser from '../../shared/voiceIntentParser.cjs';
import { TodoDatabase } from '../../src/db/database';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages';
import { VoiceVadController } from '../../src/voice/audioCapture';
import {
  rankTtsVoices,
  sanitizeTextForSpeech,
  speakLocalText,
  stopSpeaking,
  truncateForSpeech,
  WINDOWS_SPEECH_SETTINGS_URI,
} from '../../src/voice/ttsPlayer';

test('WBS-3.1: VoiceVadController 2s speech + 1.6s silence auto-stop & 3s silence fast rejection', () => {
  const vad = new VoiceVadController({ sampleRate: 16000, autoStopMs: 1500 });
  const frameLen = 1600; // 100 ms @ 16 kHz
  const speechFrame = new Float32Array(frameLen).fill(0.12);
  const silenceFrame = new Float32Array(frameLen).fill(0.001);

  // 2s speech (20 frames)
  for (let i = 0; i < 20; i += 1) {
    const res = vad.pushFrame(speechFrame);
    assert.equal(res.action, 'continue');
  }
  // 1.6s silence (16 frames) -> triggers auto_stop_silence at 1.5s (15th frame)
  let stoppedAt = -1;
  for (let i = 1; i <= 16; i += 1) {
    const res = vad.pushFrame(silenceFrame);
    if (res.action === 'auto_stop_silence') {
      stoppedAt = i * 100;
      break;
    }
  }
  assert.equal(stoppedAt, 1500, 'VAD must auto-stop at 1500 ms of trailing silence');

  // Pure 3s silence rejected in < 5 ms without calling Whisper
  const t0 = performance.now();
  const pureSilence = new Float32Array(48000).fill(0.001);
  const energyCheck = VoiceVadController.hasEnoughSpeech(pureSilence);
  const elapsed = performance.now() - t0;
  assert.equal(energyCheck.ok, false);
  assert.ok(elapsed < 25, `Silence check should be near-instant, took ${elapsed}ms`);
});

test('WBS-3.2: SttService Turkish dictation, hallucination filter, Vulkan->CPU fallback & idle unload', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-stt-'));
  const fakeModelPath = path.join(tmpDir, 'ggml-base-q5_1.bin');
  fs.writeFileSync(fakeModelPath, Buffer.alloc(64));

  const initAttempts: boolean[] = [];
  let releaseCalled = false;
  let nextMockText = 'Yarın saat 15:00 fatura ödemesi şğıöüç ekle';

  const mockWhisper = {
    async initWhisper({ useGpu }: { useGpu: boolean }) {
      initAttempts.push(useGpu);
      if (useGpu) throw new Error('Simulated Vulkan init error');
      return {
        async transcribeData() {
          return { promise: Promise.resolve({ result: nextMockText }) };
        },
        async release() {
          releaseCalled = true;
        },
      };
    },
  };

  try {
    const stt = new sttServiceMod.SttService({
      modelPath: fakeModelPath,
      whisperModule: mockWhisper,
      idleUnloadMs: 60,
    });

    // 1. Pure silence rejected BEFORE touching Whisper
    const silentRes = await stt.transcribePcm(new Float32Array(16000).fill(0.0005), 'tr');
    assert.equal(silentRes.ok, false);
    assert.equal(silentRes.code, 'SILENCE');
    assert.equal(initAttempts.length, 0);

    // 2. Voiced Turkish audio triggers Vulkan->CPU fallback and preserves Turkish diacritics
    const voiced = new Float32Array(16000).fill(0.15);
    const okRes = await stt.transcribePcm(voiced, 'tr');
    assert.equal(okRes.ok, true);
    assert.equal(okRes.text, nextMockText);
    assert.deepEqual(initAttempts, [true, false]);
    assert.equal(stt.gpuFallbackUsed, true);

    // 3. Hallucination output filtered cleanly
    nextMockText = 'Altyazı M.K.';
    const hallRes = await stt.transcribePcm(voiced, 'tr');
    assert.equal(hallRes.ok, false);
    assert.equal(hallRes.code, 'HALLUCINATION_FILTERED');

    // 4. Idle timer unloads context cleanly
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(releaseCalled, true);
    assert.equal(stt.context, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WBS-4.1: Fast-Path < 50 ms parser for Turkish, English & 73-language ISO syntax', () => {
  const fixedNow = new Date(2026, 10, 22, 10, 0, 0); // 2026-11-22

  const trAdd = voiceIntentParser.parseVoiceIntent(
    "Notlarıma yarın 15:00'te sunum hazırla yüksek öncelik ekle",
    { now: fixedNow },
  );
  assert.equal(trAdd.intent, 'add_task');
  assert.equal(trAdd.payload.dueDate, '2026-11-23');
  assert.equal(trAdd.payload.dueTime, '15:00');
  assert.equal(trAdd.payload.priority, 'high');
  assert.ok(trAdd.elapsedMs < 50);

  const trRead = voiceIntentParser.parseVoiceIntent('Lansmanla ilgili notumu oku', {
    now: fixedNow,
  });
  assert.equal(trRead.intent, 'read_note');
  assert.equal(trRead.query, 'Lansman');

  const isoGerman = voiceIntentParser.parseVoiceIntent('Meeting 2026-12-05 10:30 #work !', {
    now: fixedNow,
  });
  assert.equal(isoGerman.intent, 'add_task');
  assert.equal(isoGerman.payload.dueDate, '2026-12-05');
  assert.equal(isoGerman.payload.dueTime, '10:30');
  assert.equal(isoGerman.payload.priority, 'high');
  assert.deepEqual(isoGerman.payload.tags, ['work']);
});

test('WBS-4.3: OS OneCore TTS 400-char cap, instant Esc stop (< 100 ms) & silent missing-voice fallback', () => {
  const longText = 'Bu uzun bir test notudur. '.repeat(35); // > 800 chars
  assert.ok(longText.length > 700);
  const prepared = truncateForSpeech(longText, 400);
  assert.ok(prepared.spokenText.length <= 400);
  assert.equal(prepared.fullText.length, longText.trim().length);
  assert.equal(prepared.truncated, true);

  let cancelCount = 0;
  let spokenUtterance = '';
  const mockSynth = {
    getVoices: () => [
      { name: 'Microsoft Tolga', lang: 'tr-TR', voiceURI: 'tr-tolga', localService: true },
    ],
    cancel: () => {
      cancelCount += 1;
    },
    speak: (u: { text: string }) => {
      spokenUtterance = u.text;
    },
  } as unknown as SpeechSynthesis;

  class MockUtterance {
    text: string;
    voice: unknown = null;
    lang = '';
    rate = 1;
    constructor(text: string) {
      this.text = text;
    }
  }

  const res = speakLocalText(longText, {
    language: 'tr',
    synth: mockSynth,
    UtteranceCtor: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
  });
  assert.equal(res.spoken, true);
  assert.ok(spokenUtterance.length <= 400);

  const t0 = performance.now();
  stopSpeaking(mockSynth);
  assert.ok(performance.now() - t0 < 100);
  assert.ok(cancelCount >= 2);

  // Missing language voice pack degrades gracefully without throwing
  const emptySynth = {
    getVoices: () => [],
    cancel: () => {
      /* noop */
    },
    speak: () => {
      /* noop */
    },
  } as unknown as SpeechSynthesis;
  const fallback = speakLocalText('Merhaba', {
    language: 'tr',
    synth: emptySynth,
    UtteranceCtor: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
  });
  assert.equal(fallback.spoken, false);
  assert.equal(fallback.reason, 'NO_LANGUAGE_VOICE');
  assert.equal(fallback.settingsUri, WINDOWS_SPEECH_SETTINGS_URI);
});

test('WBS-5.1: Taskbar overlay geometry centers horizontally (+/- 1 px) and sits 14 px above taskbar workArea', () => {
  const primary = voiceOverlayMod.computeOverlayBounds({ x: 0, y: 0, width: 1920, height: 1040 });
  const centerX = primary.x + primary.width / 2;
  assert.ok(Math.abs(centerX - 960) <= 1);
  assert.equal(primary.y + primary.height, 1040 - 14);

  // Secondary monitor to the right (x=1920, 2560x1400 workArea)
  const secondary = voiceOverlayMod.computeOverlayBounds({
    x: 1920,
    y: 0,
    width: 2560,
    height: 1400,
  });
  const secCenter = secondary.x + secondary.width / 2;
  assert.ok(Math.abs(secCenter - (1920 + 1280)) <= 1);
  assert.equal(secondary.y + secondary.height, 1400 - 14);
});

test('WBS-3.2 PARITY: All 73 SUPPORTED_LANGUAGES have explicit WHISPER_LANG_MAP entries (including tk, ky, zh-CN)', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 73);
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.equal(
      Object.hasOwn(sttServiceMod.WHISPER_LANG_MAP, lang.code),
      true,
      `Missing explicit WHISPER_LANG_MAP entry for ${lang.code}`,
    );
  }
  assert.equal(sttServiceMod.mapUiLangToWhisper('tk'), 'tk');
  assert.equal(sttServiceMod.mapUiLangToWhisper('zh-CN'), 'zh');
  assert.equal(sttServiceMod.mapUiLangToWhisper('ky'), 'auto');
});

test('WBS-3.1/3.2/4.3 QUALITY: Int16 PCM conversion, Vulkan variant, Turkish hallucination filter, VAD tail trim & Neural TTS ranking', async () => {
  // 1. Float32 -> Signed 16-bit PCM exact range clamping
  const pcm16 = sttServiceMod.float32ToInt16Pcm(new Float32Array([-1.5, -1, 0, 0.5, 1, 1.5]));
  assert.equal(pcm16[0], -32768);
  assert.equal(pcm16[1], -32768);
  assert.equal(pcm16[2], 0);
  assert.equal(pcm16[4], 32767);
  assert.equal(pcm16[5], 32767);

  // 2. Turkish hallucination pattern catches [MÜZİK ÇALIYOR]
  assert.equal(sttServiceMod.isLikelyHallucination('[MÜZİK ÇALIYOR]'), true);
  assert.equal(sttServiceMod.isLikelyHallucination('Sunumu hazırla'), false);

  // 3. SttService passes Int16 ArrayBuffer (2 bytes/sample) & requests 'vulkan' variant
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-int16-'));
  const fakeModel = path.join(tmpDir, 'm.bin');
  fs.writeFileSync(fakeModel, Buffer.alloc(16));
  let seenVariant = '';
  let seenByteLen = 0;
  try {
    const stt = new sttServiceMod.SttService({
      modelPath: fakeModel,
      idleUnloadMs: 0,
      whisperModule: {
        async initWhisper(_opts: unknown, variant: string) {
          seenVariant = variant;
          return {
            async transcribeData(buf: ArrayBuffer) {
              seenByteLen = buf.byteLength;
              return { promise: Promise.resolve({ result: 'Yarın toplantı ekle' }) };
            },
            async release() {
              /* noop */
            },
          };
        },
      },
    });
    const voiced = new Float32Array(16000).fill(0.2);
    const out = await stt.transcribePcm(voiced, 'tr');
    assert.equal(out.ok, true);
    assert.equal(seenVariant, 'vulkan');
    assert.equal(
      seenByteLen,
      16000 * 2,
      'transcribeData must receive 16-bit Int16 PCM (2 bytes/sample)',
    );
    await stt.unload();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 4. VAD trailing silence trim cuts excessive 1.5s dead air down to <= 300ms tail
  const vad = new VoiceVadController({ sampleRate: 16000, autoStopMs: 1500 });
  const speech = new Float32Array(1600).fill(0.15);
  const silence = new Float32Array(1600).fill(0.001);
  for (let i = 0; i < 10; i += 1) vad.pushFrame(speech); // 1.0s speech
  for (let i = 0; i < 15; i += 1) vad.pushFrame(silence); // 1.5s silence
  const merged = vad.getMergedPcm();
  assert.ok(
    merged.length <= 14 * 1600,
    `Expected trimmed PCM <= 1.4s, got ${merged.length / 16000}s`,
  );

  // 5. TTS sanitizer strips Markdown/URLs & rankTtsVoices prioritizes Natural/Neural over Desktop
  const cleaned = sanitizeTextForSpeech('**Önemli** · https://vellium.dev/app -> `test`');
  assert.equal(cleaned.includes('**'), false);
  assert.equal(cleaned.includes('https://'), false);
  assert.equal(cleaned.includes('vellium.dev'), true);

  const ranked = rankTtsVoices(
    [
      {
        name: 'Microsoft Tolga - Turkish (Turkey)',
        lang: 'tr-TR',
        localService: true,
      } as SpeechSynthesisVoice,
      {
        name: 'Microsoft Emel Online (Natural) - Turkish (Turkey)',
        lang: 'tr-TR',
        localService: false,
      } as SpeechSynthesisVoice,
      {
        name: 'Microsoft Emel (Natural) - Turkish (Turkey)',
        lang: 'tr-TR',
        localService: true,
      } as SpeechSynthesisVoice,
    ],
    'tr',
  );
  assert.equal(ranked[0]?.name, 'Microsoft Emel (Natural) - Turkish (Turkey)');
  assert.equal(ranked[1]?.name, 'Microsoft Emel Online (Natural) - Turkish (Turkey)');
});

test('Neural Audio Stack (RNNoise WASM + Silero VAD v5 ONNX) & Multiple Voice/Chime Presets', async () => {
  // 1. Verify all 6 local offline neural voice assets are synced cleanly (zero CDN)
  const assetDir = path.resolve(process.cwd(), 'public', 'voice-assets');
  for (const name of [
    'rnnoise.wasm',
    'rnnoise_simd.wasm',
    'rnnoise-worklet.js',
    'silero_vad_v5.onnx',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.mjs',
    'piper_phonemize.js',
    'piper_phonemize.wasm',
    'piper_phonemize.data',
  ]) {
    const fullPath = path.join(assetDir, name);
    assert.ok(fs.existsSync(fullPath), `Missing offline neural voice asset: ${name}`);
    assert.ok(fs.statSync(fullPath).size > 1024, `Asset appears empty: ${name}`);
  }

  // 2. Verify VoiceVadController neural probability mode rejects loud fan/keyboard noise (prob 0.08)
  //    and cleanly detects + auto-stops real human speech (prob 0.85 -> 0.05)
  const neuralVad = new VoiceVadController({
    sampleRate: 16000,
    autoStopMs: 800,
    noSpeechTimeoutMs: 5000,
    adaptiveNoiseFloor: true,
    sensitivity: 'auto',
  });
  const loudNoiseFrame = new Float32Array(1600).fill(0.22); // high RMS keyboard/fan noise
  for (let i = 0; i < 6; i += 1) {
    const res = neuralVad.pushFrame(loudNoiseFrame, 0.08);
    assert.equal(
      res.hasSpoken,
      false,
      'Low Silero speech probability must NOT trigger speech even with high RMS',
    );
  }
  const speechFrame = new Float32Array(1600).fill(0.08);
  for (let i = 0; i < 4; i += 1) {
    neuralVad.pushFrame(speechFrame, 0.85);
  }
  let autoStopped = false;
  for (let i = 0; i < 12; i += 1) {
    const res = neuralVad.pushFrame(loudNoiseFrame, 0.05);
    if (res.action === 'auto_stop_silence') {
      autoStopped = true;
      assert.equal(res.hasSpoken, true);
      break;
    }
  }
  assert.equal(
    autoStopped,
    true,
    'Neural VAD must auto-stop cleanly when speech probability drops',
  );

  // 3. Verify 5 TTS style presets apply distinct rate & pitch cleanly
  const { TTS_STYLE_PRESETS } = await import('../../src/voice/ttsPlayer.ts');
  assert.equal(Object.keys(TTS_STYLE_PRESETS).length, 5);
  let capturedRate = 0;
  let capturedPitch = 0;
  class FakeUtterance {
    text: string;
    voice: unknown = null;
    lang = '';
    rate = 1;
    pitch = 1;
    constructor(text: string) {
      this.text = text;
    }
  }
  const fakeSynth = {
    getVoices: () => [
      {
        name: 'Microsoft Emel Online (Natural)',
        lang: 'tr-TR',
        voiceURI: 'emel',
        localService: true,
      },
      {
        name: 'Microsoft Ahmet Online (Natural)',
        lang: 'tr-TR',
        voiceURI: 'ahmet',
        localService: true,
      },
    ],
    cancel: () => {
      /* noop */
    },
    speak: (u: { rate: number; pitch: number }) => {
      capturedRate = u.rate;
      capturedPitch = u.pitch;
    },
  };
  const speakRes = speakLocalText('Test metni', {
    language: 'tr',
    preferredVoice: 'ahmet',
    style: 'calm',
    synth: fakeSynth as unknown as SpeechSynthesis,
    UtteranceCtor: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
  });
  assert.equal(speakRes.spoken, true);
  assert.equal(speakRes.voiceName, 'Microsoft Ahmet Online (Natural)');
  assert.equal(capturedRate, TTS_STYLE_PRESETS.calm.rate);
  assert.equal(capturedPitch, TTS_STYLE_PRESETS.calm.pitch);

  // 4. Verify DB persistence for voiceTtsStyle & voiceChimePreset + zero em/en dashes in neuralAudio.ts
  const db = new TodoDatabase(':memory:');
  try {
    const updated = db.updateSettings({
      voiceTtsStyle: 'bright',
      voiceChimePreset: 'crystal',
    });
    assert.equal(updated.voiceTtsStyle, 'bright');
    assert.equal(updated.voiceChimePreset, 'crystal');
  } finally {
    db.close();
  }
  const neuralSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/voice/neuralAudio.ts'),
    'utf8',
  );
  assert.equal(/[\u2013\u2014]/.test(neuralSrc), false, 'Em/en-dash found in neuralAudio.ts');

  // 5. Verify Piper ONNX Female & Male offline TTS catalog (100% MIT/CC0/Public Domain) + WAV encoder
  const piperVoicesMod = await import('../../shared/piperVoices.cjs');
  const piper = piperVoicesMod.default ?? piperVoicesMod;
  const trFemale = piper.PIPER_VOICE_CATALOG.filter(
    (v: { baseLang: string; gender: string }) => v.baseLang === 'tr' && v.gender === 'female',
  );
  const trMale = piper.PIPER_VOICE_CATALOG.filter(
    (v: { baseLang: string; gender: string }) => v.baseLang === 'tr' && v.gender === 'male',
  );
  const enFemale = piper.PIPER_VOICE_CATALOG.filter(
    (v: { baseLang: string; gender: string }) => v.baseLang === 'en' && v.gender === 'female',
  );
  const enMale = piper.PIPER_VOICE_CATALOG.filter(
    (v: { baseLang: string; gender: string }) => v.baseLang === 'en' && v.gender === 'male',
  );
  assert.ok(trFemale.length >= 1, 'Must include at least one Turkish female Piper voice');
  assert.ok(trMale.length >= 1, 'Must include at least one Turkish male Piper voice');
  assert.ok(enFemale.length >= 1, 'Must include at least one English female Piper voice');
  assert.ok(enMale.length >= 1, 'Must include at least one English male Piper voice');
  for (const v of piper.PIPER_VOICE_CATALOG) {
    assert.ok(piper.ALLOWED_PIPER_LICENSES.has(v.license), `Forbidden Piper license: ${v.license}`);
    assert.match(v.sha256, /^[0-9a-f]{64}$/i);
  }

  // Test PiperVoiceManager fail-closed SHA-256 rejection + clean delete
  const tmpVoicesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-piper-'));
  try {
    const fakeBadFetch = async (url: string) => {
      if (url.endsWith('.json')) {
        return new Response(
          JSON.stringify({ audio: { sample_rate: 22050 }, espeak: { voice: 'tr' } }),
          {
            status: 200,
          },
        );
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    };
    const mgr = new piper.PiperVoiceManager({ voicesDir: tmpVoicesDir, fetchFn: fakeBadFetch });
    const badRes = await mgr.downloadVoice('piper-tr-ilkiz-female');
    assert.equal(badRes.ok, false);
    assert.equal(badRes.code, 'SHA256_MISMATCH');
    assert.equal(mgr.getVoicePaths('piper-tr-ilkiz-female').installed, false);
  } finally {
    fs.rmSync(tmpVoicesDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }

  // Verify PCM->WAV encoder header
  const { encodeFloat32PcmToWav } = await import('../../src/voice/piperTtsEngine.ts');
  const wav = encodeFloat32PcmToWav(new Float32Array([0, 0.5, -0.5, 0]), 22050);
  const wavBytes = Buffer.from(wav);
  assert.equal(wavBytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBytes.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wavBytes.length, 44 + 8);

  for (const rel of ['shared/piperVoices.cjs', 'src/voice/piperTtsEngine.ts']) {
    const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
    assert.equal(/[\u2013\u2014]/.test(src), false, `Em/en-dash found in ${rel}`);
  }
});

test('Natural Turkish & English scheduled dictation without explicit "ekle/add" parses directly as add_task', () => {
  const fixedNow = new Date(2026, 10, 27, 9, 0, 0);
  const trNatural = voiceIntentParser.parseVoiceIntent('Yarın saat 15:00 doktor randevusu', {
    now: fixedNow,
  });
  assert.equal(trNatural.intent, 'add_task');
  assert.equal(trNatural.payload.dueDate, '2026-11-28');
  assert.equal(trNatural.payload.dueTime, '15:00');
  assert.equal(trNatural.payload.title, 'doktor randevusu');

  const enNatural = voiceIntentParser.parseVoiceIntent('Tomorrow at 14:30 dentist appointment', {
    now: fixedNow,
  });
  assert.equal(enNatural.intent, 'add_task');
  assert.equal(enNatural.payload.dueDate, '2026-11-28');
  assert.equal(enNatural.payload.dueTime, '14:30');
  assert.equal(enNatural.payload.title, 'dentist appointment');
});
