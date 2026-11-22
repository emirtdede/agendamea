/**
 * Local Offline Piper VITS ONNX Neural TTS Engine (100% offline, zero CDN)
 * - Uses @diffusionstudio/piper-wasm (MIT) espeak-ng phonemizer from /voice-assets/
 * - Uses onnxruntime-web/wasm from /voice-assets/
 * - Loads verified MIT / CC0 / Public Domain .onnx voices from local Express /api/ai/tts-voices/:id/
 */

import type { VoiceTtsStyle } from '../types';
import { TTS_STYLE_PRESETS } from './ttsPlayer';

const VOICE_ASSET_BASE = '/voice-assets';

interface PiperModelConfig {
  audio?: { sample_rate?: number };
  espeak?: { voice?: string };
  inference?: {
    noise_scale?: number;
    length_scale?: number;
    noise_w?: number;
  };
  speaker_id_map?: Record<string, number>;
}

interface PiperPhonemizeModule {
  callMain: (args: string[]) => void;
}

type CreatePiperPhonemizeFn = (opts: {
  print?: (data: string) => void;
  printErr?: (msg: string) => void;
  locateFile?: (url: string) => string;
}) => Promise<PiperPhonemizeModule>;

type OrtModule = typeof import('onnxruntime-web/wasm');
type OrtSession = import('onnxruntime-web/wasm').InferenceSession;
type OrtTensor = import('onnxruntime-web/wasm').Tensor;

let phonemizerScriptPromise: Promise<CreatePiperPhonemizeFn | null> | null = null;
let sharedOrtPromise: Promise<OrtModule | null> | null = null;
const sessionCache = new Map<string, Promise<{ session: OrtSession; config: PiperModelConfig } | null>>();

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let activePlaySeq = 0;

function loadPhonemizerScript(): Promise<CreatePiperPhonemizeFn | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  const existing = (window as unknown as { createPiperPhonemize?: CreatePiperPhonemizeFn })
    .createPiperPhonemize;
  if (typeof existing === 'function') {
    return Promise.resolve(existing);
  }
  if (phonemizerScriptPromise) return phonemizerScriptPromise;

  phonemizerScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `${VOICE_ASSET_BASE}/piper_phonemize.js`;
    script.async = true;
    script.onload = () => {
      const fn = (window as unknown as { createPiperPhonemize?: CreatePiperPhonemizeFn })
        .createPiperPhonemize;
      resolve(typeof fn === 'function' ? fn : null);
    };
    script.onerror = () => {
      phonemizerScriptPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return phonemizerScriptPromise;
}

async function ensureOrt(): Promise<OrtModule | null> {
  if (sharedOrtPromise) return sharedOrtPromise;
  sharedOrtPromise = (async () => {
    try {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = `${VOICE_ASSET_BASE}/`;
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';
      return ort;
    } catch {
      sharedOrtPromise = null;
      return null;
    }
  })();
  return sharedOrtPromise;
}

async function ensureVoiceSession(
  voiceId: string,
): Promise<{ session: OrtSession; config: PiperModelConfig } | null> {
  const cached = sessionCache.get(voiceId);
  if (cached) return cached;

  const loader = (async () => {
    try {
      const ort = await ensureOrt();
      if (!ort) return null;
      const encoded = encodeURIComponent(voiceId);
      const [cfgRes, onnxRes] = await Promise.all([
        fetch(`/api/ai/tts-voices/${encoded}/config`),
        fetch(`/api/ai/tts-voices/${encoded}/onnx`),
      ]);
      if (!cfgRes.ok || !onnxRes.ok) return null;
      const config = (await cfgRes.json()) as PiperModelConfig;
      const onnxBytes = await onnxRes.arrayBuffer();
      const session = await ort.InferenceSession.create(onnxBytes, {
        executionProviders: ['wasm'],
      });
      return { session, config };
    } catch {
      sessionCache.delete(voiceId);
      return null;
    }
  })();

  sessionCache.set(voiceId, loader);
  return loader;
}

export function evictPiperVoiceCache(voiceId: string): void {
  const existing = sessionCache.get(voiceId);
  sessionCache.delete(voiceId);
  if (existing) {
    void existing.then((entry) => {
      try {
        void entry?.session.release();
      } catch {
        // Ignore release errors
      }
    });
  }
}

export function encodeFloat32PcmToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    view.setInt16(offset, int16, true);
    offset += 2;
  }
  return buffer;
}

async function phonemizeText(text: string, espeakVoice: string): Promise<number[] | null> {
  const createPhonemizer = await loadPhonemizerScript();
  if (!createPhonemizer) return null;

  const payload = JSON.stringify([{ text: text.trim() }]);
  return new Promise<number[] | null>((resolve) => {
    let settled = false;
    const finish = (ids: number[] | null) => {
      if (settled) return;
      settled = true;
      resolve(ids);
    };
    void createPhonemizer({
      print: (line: string) => {
        try {
          const parsed = JSON.parse(line) as { phoneme_ids?: number[] };
          if (Array.isArray(parsed?.phoneme_ids) && parsed.phoneme_ids.length > 0) {
            finish(parsed.phoneme_ids);
          }
        } catch {
          // Ignore non-JSON stdout lines
        }
      },
      printErr: () => {
        // Non-fatal warnings from espeak-ng
      },
      locateFile: (url: string) => {
        if (url.endsWith('.wasm')) return `${VOICE_ASSET_BASE}/piper_phonemize.wasm`;
        if (url.endsWith('.data')) return `${VOICE_ASSET_BASE}/piper_phonemize.data`;
        return url;
      },
    })
      .then((mod) => {
        try {
          mod.callMain([
            '-l',
            espeakVoice,
            '--input',
            payload,
            '--espeak_data',
            '/espeak-ng-data',
          ]);
        } catch {
          finish(null);
        }
        // Fallback timeout if callMain exited without printing
        window.setTimeout(() => finish(null), 1500);
      })
      .catch(() => finish(null));
  });
}

export function stopPiperSpeech(): void {
  activePlaySeq += 1;
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.src = '';
    } catch {
      // Ignore audio pause errors
    }
    activeAudio = null;
  }
  if (activeObjectUrl) {
    try {
      URL.revokeObjectURL(activeObjectUrl);
    } catch {
      // Ignore revoke errors
    }
    activeObjectUrl = null;
  }
}

export async function speakWithPiperVoice(
  voiceId: string,
  text: string,
  options?: {
    style?: VoiceTtsStyle;
    onEnd?: () => void;
  },
): Promise<boolean> {
  if (typeof window === 'undefined' || !text.trim()) return false;
  stopPiperSpeech();
  const seq = ++activePlaySeq;

  const [ort, loaded] = await Promise.all([ensureOrt(), ensureVoiceSession(voiceId)]);
  if (!ort || !loaded || seq !== activePlaySeq) return false;

  const espeakVoice = loaded.config.espeak?.voice || 'tr';
  const phonemeIds = await phonemizeText(text, espeakVoice);
  if (!phonemeIds || phonemeIds.length === 0 || seq !== activePlaySeq) return false;

  try {
    const stylePreset = TTS_STYLE_PRESETS[options?.style ?? 'natural'] ?? TTS_STYLE_PRESETS.natural;
    const noiseScale = loaded.config.inference?.noise_scale ?? 0.667;
    const baseLengthScale = loaded.config.inference?.length_scale ?? 1.0;
    // Higher style rate => slightly shorter length_scale (faster speech)
    const effectiveLengthScale = Math.max(0.65, Math.min(1.45, baseLengthScale / stylePreset.rate));
    const noiseW = loaded.config.inference?.noise_w ?? 0.8;

    const feeds: Record<string, OrtTensor> = {
      input: new ort.Tensor(
        'int64',
        BigInt64Array.from(phonemeIds.map((id) => BigInt(id))),
        [1, phonemeIds.length],
      ),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(phonemeIds.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([noiseScale, effectiveLengthScale, noiseW]), [3]),
    };

    if (loaded.config.speaker_id_map && Object.keys(loaded.config.speaker_id_map).length > 0) {
      feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    }

    const outputs: Record<string, OrtTensor> = await loaded.session.run(feeds);
    if (seq !== activePlaySeq) return false;

    const outTensor = outputs['output'];
    const pcmData = outTensor?.data;
    if (!(pcmData instanceof Float32Array) || pcmData.length === 0) return false;

    const sampleRate = loaded.config.audio?.sample_rate || 22050;
    const wavBuffer = encodeFloat32PcmToWav(pcmData, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const objectUrl = URL.createObjectURL(blob);

    const audio = new Audio(objectUrl);
    activeAudio = audio;
    activeObjectUrl = objectUrl;

    const cleanupAudio = () => {
      if (activeAudio === audio) activeAudio = null;
      if (activeObjectUrl === objectUrl) activeObjectUrl = null;
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Ignore
      }
      options?.onEnd?.();
    };

    audio.onended = cleanupAudio;
    audio.onerror = cleanupAudio;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}
