import type { VoiceSensitivityMode } from '../types';

export const TARGET_SAMPLE_RATE = 16000;
export const DEFAULT_AUTO_STOP_MS = 1500;
export const DEFAULT_NO_SPEECH_TIMEOUT_MS = 7000;
export const MAX_RECORDING_MS = 30000;
export const RING_BUFFER_MS = 300;
export const SPEECH_RMS_THRESHOLD = 0.008;
export const SPEECH_AMPLITUDE_THRESHOLD = 0.006;
export const MIN_SPEECH_RATIO = 0.03;

export interface VadStateResult {
  action: 'continue' | 'auto_stop_silence' | 'auto_stop_max_duration' | 'auto_stop_no_speech';
  hasSpoken: boolean;
  silenceMs: number;
  totalMs: number;
  noiseFloor?: number;
  threshold?: number;
}

const SENSITIVITY_CONFIG: Record<
  VoiceSensitivityMode,
  { multiplier: number; minThreshold: number; maxThreshold: number; neuralProbThreshold: number }
> = {
  auto: { multiplier: 2.2, minThreshold: 0.007, maxThreshold: 0.065, neuralProbThreshold: 0.42 },
  low: { multiplier: 3.0, minThreshold: 0.016, maxThreshold: 0.095, neuralProbThreshold: 0.62 },
  medium: { multiplier: 2.2, minThreshold: 0.008, maxThreshold: 0.065, neuralProbThreshold: 0.45 },
  high: { multiplier: 1.6, minThreshold: 0.004, maxThreshold: 0.045, neuralProbThreshold: 0.28 },
};

/**
 * Pure, deterministic Voice Activity Detection controller (testable without hardware mic).
 */
export class VoiceVadController {
  private readonly sampleRate: number;
  private readonly autoStopMs: number;
  private readonly maxDurationMs: number;
  private readonly noSpeechTimeoutMs: number;
  private readonly adaptiveNoiseFloor: boolean;
  private readonly sensitivity: VoiceSensitivityMode;
  private rmsThreshold: number;
  private readonly maxRingSamples: number;

  private chunks: Float32Array[] = [];
  private ringChunks: Float32Array[] = [];
  private rawFallbackChunks: Float32Array[] = [];
  private ringSampleCount = 0;
  private totalSamples = 0;
  private hasSpoken = false;
  private trailingSilenceMs = 0;
  private trailingSilenceChunks = 0;
  private consecutiveSpeechFrames = 0;
  private noiseFloor = 0;
  private noiseSamplesCount = 0;

  constructor(options?: {
    sampleRate?: number;
    autoStopMs?: number;
    maxDurationMs?: number;
    noSpeechTimeoutMs?: number;
    rmsThreshold?: number;
    adaptiveNoiseFloor?: boolean;
    sensitivity?: VoiceSensitivityMode;
  }) {
    this.sampleRate = options?.sampleRate ?? TARGET_SAMPLE_RATE;
    this.autoStopMs = Math.max(600, options?.autoStopMs ?? DEFAULT_AUTO_STOP_MS);
    this.maxDurationMs = Math.max(3000, options?.maxDurationMs ?? MAX_RECORDING_MS);
    this.adaptiveNoiseFloor = Boolean(options?.adaptiveNoiseFloor);
    this.sensitivity = options?.sensitivity ?? 'auto';
    this.noSpeechTimeoutMs =
      options?.noSpeechTimeoutMs !== undefined
        ? Math.max(0, options.noSpeechTimeoutMs)
        : this.adaptiveNoiseFloor
          ? DEFAULT_NO_SPEECH_TIMEOUT_MS
          : 0;
    const cfg = SENSITIVITY_CONFIG[this.sensitivity] ?? SENSITIVITY_CONFIG.auto;
    this.rmsThreshold =
      options?.rmsThreshold ?? (this.adaptiveNoiseFloor ? cfg.minThreshold : SPEECH_RMS_THRESHOLD);
    this.maxRingSamples = Math.round((RING_BUFFER_MS / 1000) * this.sampleRate);
  }

  pushFrame(pcm: Float32Array, neuralSpeechProb?: number | null): VadStateResult {
    const frameDurationMs = (pcm.length / this.sampleRate) * 1000;
    let sumSq = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      const sample = pcm[i] ?? 0;
      sumSq += sample * sample;
    }
    const rms = pcm.length > 0 ? Math.sqrt(sumSq / pcm.length) : 0;

    const cfg = SENSITIVITY_CONFIG[this.sensitivity] ?? SENSITIVITY_CONFIG.auto;
    if (this.adaptiveNoiseFloor) {
      if (this.noiseSamplesCount < 3 && !this.hasSpoken) {
        this.noiseSamplesCount += 1;
        this.noiseFloor =
          this.noiseSamplesCount === 1
            ? rms
            : this.noiseFloor + (rms - this.noiseFloor) / this.noiseSamplesCount;
        this.rmsThreshold = Math.max(
          cfg.minThreshold,
          Math.min(cfg.maxThreshold, this.noiseFloor * cfg.multiplier),
        );
      } else if (rms < this.rmsThreshold * 1.15) {
        this.noiseFloor = this.noiseFloor * 0.92 + rms * 0.08;
        this.rmsThreshold = Math.max(
          cfg.minThreshold,
          Math.min(cfg.maxThreshold, this.noiseFloor * cfg.multiplier),
        );
      }
    }

    const isSpeech =
      typeof neuralSpeechProb === 'number' && Number.isFinite(neuralSpeechProb)
        ? neuralSpeechProb >= cfg.neuralProbThreshold && rms >= 0.003
        : rms >= this.rmsThreshold;

    if (!this.hasSpoken) {
      this.rawFallbackChunks.push(pcm);
      if (isSpeech) {
        this.consecutiveSpeechFrames += 1;
        const requiredOnsetFrames = this.adaptiveNoiseFloor ? 2 : 1;
        if (this.consecutiveSpeechFrames >= requiredOnsetFrames) {
          this.hasSpoken = true;
          this.trailingSilenceMs = 0;
          this.trailingSilenceChunks = 0;
          this.rawFallbackChunks = [];
          for (const pre of this.ringChunks) {
            this.chunks.push(pre);
          }
          this.ringChunks = [];
          this.ringSampleCount = 0;
          this.chunks.push(pcm);
          this.totalSamples += pcm.length;
        } else {
          this.ringChunks.push(pcm);
          this.ringSampleCount += pcm.length;
          while (this.ringSampleCount > this.maxRingSamples && this.ringChunks.length > 1) {
            const dropped = this.ringChunks.shift();
            if (dropped) this.ringSampleCount -= dropped.length;
          }
          this.totalSamples += pcm.length;
        }
      } else {
        this.consecutiveSpeechFrames = 0;
        this.ringChunks.push(pcm);
        this.ringSampleCount += pcm.length;
        while (this.ringSampleCount > this.maxRingSamples && this.ringChunks.length > 1) {
          const dropped = this.ringChunks.shift();
          if (dropped) this.ringSampleCount -= dropped.length;
        }
        this.totalSamples += pcm.length;
      }
    } else {
      this.chunks.push(pcm);
      this.totalSamples += pcm.length;
      if (isSpeech) {
        this.trailingSilenceMs = 0;
        this.trailingSilenceChunks = 0;
      } else {
        this.trailingSilenceMs += frameDurationMs;
        this.trailingSilenceChunks += 1;
      }
    }

    const totalMs = (this.totalSamples / this.sampleRate) * 1000;

    if (totalMs >= this.maxDurationMs) {
      return {
        action: 'auto_stop_max_duration',
        hasSpoken: this.hasSpoken,
        silenceMs: this.trailingSilenceMs,
        totalMs,
        noiseFloor: this.noiseFloor,
        threshold: this.rmsThreshold,
      };
    }

    if (this.hasSpoken && this.trailingSilenceMs >= this.autoStopMs) {
      return {
        action: 'auto_stop_silence',
        hasSpoken: true,
        silenceMs: this.trailingSilenceMs,
        totalMs,
        noiseFloor: this.noiseFloor,
        threshold: this.rmsThreshold,
      };
    }

    if (this.noSpeechTimeoutMs > 0 && !this.hasSpoken && totalMs >= this.noSpeechTimeoutMs) {
      return {
        action: 'auto_stop_no_speech',
        hasSpoken: false,
        silenceMs: totalMs,
        totalMs,
        noiseFloor: this.noiseFloor,
        threshold: this.rmsThreshold,
      };
    }

    return {
      action: 'continue',
      hasSpoken: this.hasSpoken,
      silenceMs: this.trailingSilenceMs,
      totalMs,
      noiseFloor: this.noiseFloor,
      threshold: this.rmsThreshold,
    };
  }

  getMergedPcm(options?: { includeFullFallback?: boolean }): Float32Array {
    let source =
      this.chunks.length > 0
        ? this.chunks
        : options?.includeFullFallback && this.rawFallbackChunks.length > 0
          ? this.rawFallbackChunks
          : this.ringChunks;
    if (
      this.hasSpoken &&
      this.trailingSilenceChunks > 3 &&
      source.length > this.trailingSilenceChunks
    ) {
      const keepUntil = Math.max(1, source.length - (this.trailingSilenceChunks - 3));
      source = source.slice(0, keepUntil);
    }
    let totalLen = 0;
    for (const c of source) totalLen += c.length;
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of source) {
      merged.set(c, offset);
      offset += c.length;
    }
    return merged;
  }

  static hasEnoughSpeech(pcm: Float32Array): { ok: boolean; speechRatio: number } {
    if (!pcm || pcm.length === 0) return { ok: false, speechRatio: 0 };
    let voiced = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      if (Math.abs(pcm[i] ?? 0) >= SPEECH_AMPLITUDE_THRESHOLD) voiced += 1;
    }
    const speechRatio = voiced / pcm.length;
    return { ok: speechRatio >= MIN_SPEECH_RATIO, speechRatio };
  }
}
