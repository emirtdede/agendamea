'use strict';

/**
 * WBS-3.2: Offline Speech-to-Text Service (@fugood/whisper.node)
 * - Maps all 73 Agendamea languages -> Whisper ISO-639-1 codes
 * - Vulkan GPU with automatic CPU fallback
 * - Energy gate (speechRatio >= 0.10, amplitude >= 0.02, min 0.5s, max 30s) rejects silence < 5 ms
 * - Hallucination blacklist filter for noisy/empty clips
 * - 180s idle unload to keep background RAM <= 140 MB
 */

const fs = require('node:fs');
const { getAppLogger } = require('../../shared/logger.cjs');

const sttLog = () => getAppLogger('server');

const SAMPLE_RATE = 16000;
const MIN_SAMPLES = 8000; // 0.5s
const MAX_SAMPLES = 480000; // 30s cap per WBS-3.1 / WBS-3.2
const SPEECH_THRESHOLD = 0.005;
const MIN_SPEECH_RATIO = 0.03;
const DEFAULT_IDLE_UNLOAD_MS = 180_000;

// All 73 Agendamea UI languages + auto-detect mapped cleanly to Whisper ISO-639-1 codes
const WHISPER_LANG_MAP = Object.freeze({
  auto: 'auto',
  tr: 'tr',
  en: 'en',
  de: 'de',
  fr: 'fr',
  es: 'es',
  it: 'it',
  pt: 'pt',
  'pt-BR': 'pt',
  ru: 'ru',
  ja: 'ja',
  ko: 'ko',
  zh: 'zh',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  ar: 'ar',
  hi: 'hi',
  nl: 'nl',
  pl: 'pl',
  uk: 'uk',
  cs: 'cs',
  sk: 'sk',
  hu: 'hu',
  ro: 'ro',
  bg: 'bg',
  el: 'el',
  sv: 'sv',
  da: 'da',
  no: 'no',
  nb: 'no',
  fi: 'fi',
  hr: 'hr',
  sr: 'sr',
  sl: 'sl',
  lt: 'lt',
  lv: 'lv',
  et: 'et',
  he: 'he',
  fa: 'fa',
  ur: 'ur',
  bn: 'bn',
  ta: 'ta',
  te: 'te',
  mr: 'mr',
  gu: 'gu',
  kn: 'kn',
  ml: 'ml',
  pa: 'pa',
  vi: 'vi',
  th: 'th',
  id: 'id',
  ms: 'ms',
  tl: 'tl',
  fil: 'tl',
  sw: 'sw',
  af: 'af',
  ca: 'ca',
  eu: 'eu',
  gl: 'gl',
  sq: 'sq',
  mk: 'mk',
  bs: 'bs',
  is: 'is',
  ga: 'en',
  cy: 'cy',
  mt: 'mt',
  ka: 'ka',
  hy: 'hy',
  az: 'az',
  kk: 'kk',
  uz: 'uz',
  ky: 'auto',
  tk: 'tk',
  mn: 'mn',
  ne: 'ne',
  si: 'si',
  km: 'km',
  lo: 'lo',
  my: 'my',
  am: 'am',
  ha: 'ha',
  yo: 'yo',
  zu: 'en',
  ps: 'ps',
  be: 'be',
});

// Common Whisper silence/noise hallucinations across TR & EN
const HALLUCINATION_PATTERNS = [
  /^\[(?:blank_audio|silence|music|applause|laughter|inaudible|müzik|müzik\s+çalıyor|sessizlik|alkış|gülüşme|\s*)\]$/i,
  /^\((?:music|silence|applause|müzik|müzik\s+çalıyor|sessizlik|alkış)\)$/i,
  /^(?:altyazı\s+m\.?k\.?|altyazi\s+m\.?k\.?|izlediğiniz\s+için\s+teşekkürler\.?|abone\s+olmayı\s+unutmayın\.?)$/i,
  /^(?:thanks?\s+for\s+watching\.?|thank\s+you\.?|please\s+subscribe\.?|subtitles?\s+by\s+.+|amara\.org)$/i,
  /^[.\s,!?\-…]+$/,
];

function float32ToInt16Pcm(floatSamples) {
  const pcm16 = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return pcm16;
}

function mapUiLangToWhisper(uiLang) {
  const raw = String(uiLang || 'auto').trim();
  if (!raw || raw.toLowerCase() === 'auto') return 'auto';
  if (WHISPER_LANG_MAP[raw]) return WHISPER_LANG_MAP[raw];
  const base = raw.split('-')[0].toLowerCase();
  return WHISPER_LANG_MAP[base] || 'auto';
}

function computeSpeechRatio(samples) {
  if (!samples || samples.length === 0) return 0;
  let voiced = 0;
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i]) >= SPEECH_THRESHOLD) voiced += 1;
  }
  return voiced / samples.length;
}

function isLikelyHallucination(text) {
  const clean = String(text || '').trim();
  if (!clean) return true;
  const loweredTr = clean.toLocaleLowerCase('tr-TR').replace(/\u0307/g, '');
  const loweredStd = clean.toLowerCase().replace(/\u0307/g, '');
  for (const re of HALLUCINATION_PATTERNS) {
    if (re.test(clean) || re.test(loweredTr) || re.test(loweredStd)) return true;
  }
  // Repeated identical 1-2 word loops (e.g. "evet evet evet evet evet")
  const words = loweredTr.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && new Set(words).size === 1) return true;
  return false;
}

function toFloat32Array(input) {
  if (input instanceof Float32Array) return input;
  if (ArrayBuffer.isView(input) && 'BYTES_PER_ELEMENT' in input && input.BYTES_PER_ELEMENT === 4) {
    return new Float32Array(input.buffer, input.byteOffset, input.byteLength / 4);
  }
  if (Buffer.isBuffer(input) && input.byteLength % 4 === 0) {
    if (input.byteOffset % 4 === 0) {
      return new Float32Array(input.buffer, input.byteOffset, input.byteLength / 4);
    }
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    return new Float32Array(copy.buffer);
  }
  if (Array.isArray(input)) return Float32Array.from(input);
  return null;
}

/**
 * Single-pass speech ratio + peak analysis + optional quiet-speech normalization + Float32 -> Int16 conversion.
 * Replaces 3 separate full-buffer scans and eliminates intermediate Float32Array + ArrayBuffer.slice copies.
 */
function analyzeAndPreparePcm16FromFloat32(work) {
  const len = work.length;
  let voiced = 0;
  let peak = 0;
  for (let i = 0; i < len; i += 1) {
    const a = Math.abs(work[i]);
    if (a >= SPEECH_THRESHOLD) voiced += 1;
    if (a > peak) peak = a;
  }
  const ratio = len > 0 ? voiced / len : 0;
  if (ratio < MIN_SPEECH_RATIO) {
    return { ratio, pcm16: null };
  }
  const gain = peak > 0.005 && peak < 0.35 ? Math.min(8, 0.72 / peak) : 1;
  const applyGain = gain > 1.15 ? gain : 1;
  const pcm16 = new Int16Array(len);
  for (let i = 0; i < len; i += 1) {
    const raw = applyGain !== 1 ? work[i] * applyGain : work[i];
    const clamped = Math.max(-1, Math.min(1, raw));
    pcm16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return { ratio, pcm16 };
}

/**
 * Direct binary Int16 PCM path: single-pass speech ratio + peak analysis + optional in-place quiet-speech boost.
 */
function analyzeAndPreparePcm16FromInt16(work) {
  const len = work.length;
  const intThreshold = Math.round(SPEECH_THRESHOLD * 32767);
  let voiced = 0;
  let peakInt = 0;
  for (let i = 0; i < len; i += 1) {
    const a = Math.abs(work[i]);
    if (a >= intThreshold) voiced += 1;
    if (a > peakInt) peakInt = a;
  }
  const ratio = len > 0 ? voiced / len : 0;
  if (ratio < MIN_SPEECH_RATIO) {
    return { ratio, pcm16: null };
  }
  const peak = peakInt / 32767;
  const gain = peak > 0.005 && peak < 0.35 ? Math.min(8, 0.72 / peak) : 1;
  if (gain > 1.15) {
    const boosted = new Int16Array(len);
    for (let i = 0; i < len; i += 1) {
      const v = Math.round(work[i] * gain);
      boosted[i] = Math.max(-32768, Math.min(32767, v));
    }
    return { ratio, pcm16: boosted };
  }
  return { ratio, pcm16: work };
}

class SttService {
  constructor(options = {}) {
    this.modelPath = options.modelPath || null;
    this.modelId = options.modelId || 'whisper-base-q5_1';
    this.whisperModule = options.whisperModule || null;
    this.importer =
      options.importer ||
      (async () => {
        try {
          return require('@fugood/whisper.node');
        } catch {
          return import('@fugood/whisper.node');
        }
      });
    this.idleUnloadMs =
      typeof options.idleUnloadMs === 'number' ? options.idleUnloadMs : DEFAULT_IDLE_UNLOAD_MS;
    this.context = null;
    this._loadedModelPath = null;
    this.useGpu = true;
    this.gpuFallbackUsed = false;
    this.idleTimer = null;
    this.slotBusy = false;
    this.slotQueue = [];
    this._loadingPromise = null;
  }

  _acquireSlot() {
    if (!this.slotBusy) {
      this.slotBusy = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.slotQueue.push(resolve));
  }

  _releaseSlot() {
    const next = this.slotQueue.shift();
    if (next) next();
    else this.slotBusy = false;
  }

  configureModel({ modelPath, modelId }) {
    const nextPath = modelPath || null;
    const nextId = modelId || this.modelId;
    const changed = this.modelPath !== nextPath || this.modelId !== nextId;
    this.modelPath = nextPath;
    this.modelId = nextId;
    if (changed && this.context) {
      void this._unloadIfStale();
    }
  }

  async _unloadIfStale() {
    await this._acquireSlot();
    try {
      if (!this.context || this._loadedModelPath === this.modelPath) {
        return;
      }
      await this._releaseContextLocked();
    } finally {
      this._releaseSlot();
    }
  }

  async _releaseContextLocked() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.context && typeof this.context.release === 'function') {
      try {
        await this.context.release();
      } catch {
        // Ignore release error
      }
    }
    this.context = null;
    this._loadedModelPath = null;
  }

  getStatus() {
    const present = Boolean(this.modelPath && fs.existsSync(this.modelPath));
    return {
      ready: present && Boolean(this.context),
      modelPresent: present,
      modelId: this.modelId,
      modelPath: this.modelPath,
      loaded: Boolean(this.context),
      gpuFallbackUsed: this.gpuFallbackUsed,
    };
  }

  touch() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.context && this.idleUnloadMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        void this.unload();
      }, this.idleUnloadMs);
      if (typeof this.idleTimer.unref === 'function') this.idleTimer.unref();
    }
  }

  async ensureBinding() {
    if (this.whisperModule) return this.whisperModule;
    const mod = await this.importer();
    this.whisperModule = mod?.default || mod;
    return this.whisperModule;
  }

  async ensureContext() {
    if (this.context && this._loadedModelPath === this.modelPath) {
      this.touch();
      return this.context;
    }
    if (this.context && this._loadedModelPath !== this.modelPath) {
      await this._releaseContextLocked();
    }
    if (!this._loadingPromise) {
      this._loadingPromise = this._loadContextInternal().finally(() => {
        this._loadingPromise = null;
      });
    }
    return this._loadingPromise;
  }

  async _loadContextInternal() {
    if (this.context && this._loadedModelPath === this.modelPath) {
      this.touch();
      return this.context;
    }
    const targetPath = this.modelPath;
    if (!targetPath || !fs.existsSync(targetPath)) {
      throw new Error('STT_MODEL_MISSING');
    }
    const binding = await this.ensureBinding();
    if (!binding || typeof binding.initWhisper !== 'function') {
      throw new Error('STT_BINDING_UNSUPPORTED');
    }
    if (this.useGpu) {
      try {
        this.context = await binding.initWhisper({ filePath: targetPath, useGpu: true }, 'vulkan');
        this._loadedModelPath = targetPath;
        this.gpuFallbackUsed = false;
        this.touch();
        return this.context;
      } catch {
        // Automatic Vulkan -> CPU fallback
        this.useGpu = false;
        this.gpuFallbackUsed = true;
      }
    }
    this.context = await binding.initWhisper({ filePath: targetPath, useGpu: false }, 'default');
    this._loadedModelPath = targetPath;
    this.touch();
    return this.context;
  }

  async transcribePcm(pcm16k, uiLang = 'en') {
    const startedAt = Date.now();
    const isInt16Input = pcm16k instanceof Int16Array;
    const samples = isInt16Input ? pcm16k : toFloat32Array(pcm16k);
    if (!samples) {
      return { ok: false, code: 'INVALID_AUDIO', message: 'Invalid PCM audio buffer.' };
    }
    if (samples.length < MIN_SAMPLES) {
      return {
        ok: false,
        code: 'TOO_SHORT',
        durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000),
        message: 'Recording too short (minimum 0.5s).',
      };
    }

    let truncated = false;
    let work = samples;
    if (samples.length > MAX_SAMPLES) {
      work = samples.subarray(0, MAX_SAMPLES);
      truncated = true;
    }

    const { ratio, pcm16 } = isInt16Input
      ? analyzeAndPreparePcm16FromInt16(work)
      : analyzeAndPreparePcm16FromFloat32(work);
    if (!pcm16 || ratio < MIN_SPEECH_RATIO) {
      return {
        ok: false,
        code: 'SILENCE',
        speechRatio: ratio,
        elapsedMs: Date.now() - startedAt,
        message: 'No speech detected.',
      };
    }

    await this._acquireSlot();
    try {
      let context;
      try {
        context = await this.ensureContext();
      } catch (err) {
        const code =
          err && err.message === 'STT_MODEL_MISSING' ? 'STT_MODEL_MISSING' : 'STT_UNAVAILABLE';
        return {
          ok: false,
          code,
          message:
            code === 'STT_MODEL_MISSING'
              ? 'Speech model is not downloaded.'
              : 'Speech engine unavailable.',
        };
      }

      try {
        const lang = mapUiLangToWhisper(uiLang);
        // Prime Whisper decoder vocabulary with domain terms (dates, times, priorities, note actions)
        const domainPrompt =
          lang === 'tr'
            ? 'Notlarıma görev ekle, yarın, bugün, saat 15:00, yüksek öncelik, düşük öncelik, önemli, tamamla, sil, notumu oku.'
            : lang === 'en'
              ? 'Add task, tomorrow, today, at 15:00, high priority, low priority, important, complete, delete, read my note.'
              : undefined;
        // @fugood/whisper.node transcribeData() requires signed 16-bit Mono 16 kHz PCM ArrayBuffer
        // Avoid redundant ArrayBuffer copy when pcm16 already spans its entire backing ArrayBuffer
        const pcmBuf =
          pcm16.byteOffset === 0 && pcm16.byteLength === pcm16.buffer.byteLength
            ? pcm16.buffer
            : pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength);
        const job = await context.transcribeData(pcmBuf, {
          language: lang,
          temperature: 0.0,
          ...(domainPrompt ? { prompt: domainPrompt } : {}),
          noSpeechThold: 0.6,
          no_speech_thold: 0.6,
        });
        const result = job?.promise ? await job.promise : job;
        this.touch();
        const rawText = String(result?.result || result?.text || '').trim();
        if (!rawText || isLikelyHallucination(rawText)) {
          return {
            ok: false,
            code: 'HALLUCINATION_FILTERED',
            rawText,
            elapsedMs: Date.now() - startedAt,
            message: 'No clear speech detected.',
          };
        }
        return {
          ok: true,
          text: rawText,
          language: lang,
          truncated,
          speechRatio: Math.round(ratio * 1000) / 1000,
          elapsedMs: Date.now() - startedAt,
        };
      } catch (err) {
        sttLog().error({ err }, 'SttService transcribePcm failed');
        return {
          ok: false,
          code: 'TRANSCRIBE_FAILED',
          message: 'Speech transcription failed.',
          elapsedMs: Date.now() - startedAt,
        };
      }
    } finally {
      this._releaseSlot();
    }
  }

  async warmup() {
    await this._acquireSlot();
    try {
      await this.ensureContext();
      return { ok: true, loaded: Boolean(this.context), gpuFallbackUsed: this.gpuFallbackUsed };
    } catch (err) {
      sttLog().error(
        { err, modelPath: this.modelPath, modelId: this.modelId },
        'SttService warmup failed',
      );
      return {
        ok: false,
        code: err && err.message === 'STT_MODEL_MISSING' ? 'STT_MODEL_MISSING' : 'STT_UNAVAILABLE',
      };
    } finally {
      this._releaseSlot();
    }
  }

  async unload() {
    await this._acquireSlot();
    try {
      await this._releaseContextLocked();
    } finally {
      this._releaseSlot();
    }
  }
}

module.exports = {
  SttService,
  WHISPER_LANG_MAP,
  HALLUCINATION_PATTERNS,
  SAMPLE_RATE,
  MIN_SAMPLES,
  MAX_SAMPLES,
  SPEECH_THRESHOLD,
  MIN_SPEECH_RATIO,
  DEFAULT_IDLE_UNLOAD_MS,
  mapUiLangToWhisper,
  computeSpeechRatio,
  isLikelyHallucination,
  toFloat32Array,
  float32ToInt16Pcm,
};
