/**
 * WBS-3.1 + v1.1.0 Audio Upgrade:
 * Secure Context AudioWorklet Capture + 300 ms Ring Buffer + 120 ms Ready Chime +
 * Web Audio Highpass/Lowpass Noise Filter + Continuous EMA Adaptive Noise-Floor VAD +
 * No-Speech Timeout + Microphone Device Enumeration & Live Test Meter.
 */

export const TARGET_SAMPLE_RATE = 16000;
export const DEFAULT_AUTO_STOP_MS = 1500;
export const DEFAULT_NO_SPEECH_TIMEOUT_MS = 7000;
export const MAX_RECORDING_MS = 30000;
export const RING_BUFFER_MS = 300;
export const SPEECH_RMS_THRESHOLD = 0.018;
export const SPEECH_AMPLITUDE_THRESHOLD = 0.02;
export const MIN_SPEECH_RATIO = 0.1;

export type VoiceSensitivityMode = 'auto' | 'low' | 'medium' | 'high';

export interface AudioInputDeviceInfo {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

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
  { multiplier: number; minThreshold: number; maxThreshold: number }
> = {
  auto: { multiplier: 2.5, minThreshold: 0.015, maxThreshold: 0.085 },
  low: { multiplier: 3.2, minThreshold: 0.024, maxThreshold: 0.11 },
  medium: { multiplier: 2.3, minThreshold: 0.014, maxThreshold: 0.075 },
  high: { multiplier: 1.75, minThreshold: 0.009, maxThreshold: 0.055 },
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
    // Only enable no-speech timeout when explicitly requested or in adaptive live mode
    this.noSpeechTimeoutMs =
      options?.noSpeechTimeoutMs !== undefined
        ? Math.max(0, options.noSpeechTimeoutMs)
        : this.adaptiveNoiseFloor
          ? DEFAULT_NO_SPEECH_TIMEOUT_MS
          : 0;
    const cfg = SENSITIVITY_CONFIG[this.sensitivity] ?? SENSITIVITY_CONFIG.auto;
    this.rmsThreshold = options?.rmsThreshold ?? (this.adaptiveNoiseFloor ? cfg.minThreshold : SPEECH_RMS_THRESHOLD);
    this.maxRingSamples = Math.round((RING_BUFFER_MS / 1000) * this.sampleRate);
  }

  pushFrame(pcm: Float32Array): VadStateResult {
    const frameDurationMs = (pcm.length / this.sampleRate) * 1000;
    let sumSq = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      sumSq += pcm[i] * pcm[i];
    }
    const rms = pcm.length > 0 ? Math.sqrt(sumSq / pcm.length) : 0;

    // Continuous EMA ambient noise-floor calibration so steady fan/AC/room noise
    // never prevents dictation from detecting trailing silence and auto-stopping.
    if (this.adaptiveNoiseFloor) {
      const cfg = SENSITIVITY_CONFIG[this.sensitivity] ?? SENSITIVITY_CONFIG.auto;
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
        // Track gentle ambient drift even while recording so steady background noise settles
        this.noiseFloor = this.noiseFloor * 0.92 + rms * 0.08;
        this.rmsThreshold = Math.max(
          cfg.minThreshold,
          Math.min(cfg.maxThreshold, this.noiseFloor * cfg.multiplier),
        );
      }
    }

    const isSpeech = rms >= this.rmsThreshold;

    if (!this.hasSpoken) {
      if (isSpeech) {
        this.consecutiveSpeechFrames += 1;
        // Require 2 consecutive voiced frames in adaptive mode to reject single keyboard clicks
        const requiredOnsetFrames = this.adaptiveNoiseFloor ? 2 : 1;
        if (this.consecutiveSpeechFrames >= requiredOnsetFrames) {
          this.hasSpoken = true;
          this.trailingSilenceMs = 0;
          this.trailingSilenceChunks = 0;
          // Flush 300 ms pre-speech ring buffer so opening syllables are never clipped (R-09)
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

  getMergedPcm(): Float32Array {
    let source = this.chunks.length > 0 ? this.chunks : this.ringChunks;
    // Trim excessive trailing silence (keep 300 ms tail so last syllable stays intact without feeding 1.5s dead air to Whisper)
    if (this.hasSpoken && this.trailingSilenceChunks > 3 && source.length > this.trailingSilenceChunks) {
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
      if (Math.abs(pcm[i]) >= SPEECH_AMPLITUDE_THRESHOLD) voiced += 1;
    }
    const speechRatio = voiced / pcm.length;
    return { ok: speechRatio >= MIN_SPEECH_RATIO, speechRatio };
  }
}

/**
 * Enumerates available audio input devices (microphones).
 * If labels are blank because permission has not been granted yet and requestPermission is true,
 * briefly requests audio permission and immediately stops the probe track.
 */
export async function enumerateAudioInputDevices(
  requestPermission = false,
): Promise<AudioInputDeviceInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let inputs = devices.filter((d) => d.kind === 'audioinput');
    const missingLabels = inputs.length > 0 && inputs.every((d) => !d.label);
    if (requestPermission && missingLabels && navigator.mediaDevices.getUserMedia) {
      try {
        const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        probeStream.getTracks().forEach((t) => t.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
        inputs = devices.filter((d) => d.kind === 'audioinput');
      } catch {
        // Permission denied or unavailable; keep unlabeled fallback list
      }
    }
    const seen = new Set<string>();
    const out: AudioInputDeviceInfo[] = [];
    let unnamedIndex = 1;
    for (const dev of inputs) {
      if (!dev.deviceId || seen.has(dev.deviceId)) continue;
      seen.add(dev.deviceId);
      const isDefault = dev.deviceId === 'default' || dev.deviceId === 'communications';
      out.push({
        deviceId: dev.deviceId,
        label: dev.label?.trim() || `Microphone ${unnamedIndex++}`,
        isDefault,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Lightweight microphone level monitor for the AI & Voice settings mic test bar.
 */
export class MicLevelMonitor {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private rafId: number | null = null;
  private active = false;

  async start(
    options: { deviceId?: string; noiseSuppression?: boolean },
    onLevel: (level: number) => void,
  ): Promise<boolean> {
    this.stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: options.noiseSuppression !== false,
        noiseSuppression: options.noiseSuppression !== false,
        autoGainControl: true,
      };
      if (options.deviceId && options.deviceId !== 'default') {
        audioConstraints.deviceId = { ideal: options.deviceId };
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;

      if (options.noiseSuppression !== false) {
        const highpass = this.audioCtx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 85;
        const lowpass = this.audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 7800;
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(analyser);
      } else {
        source.connect(analyser);
      }

      const data = new Float32Array(analyser.fftSize);
      this.active = true;
      const tick = () => {
        if (!this.active) return;
        analyser.getFloatTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i += 1) {
          sumSq += data[i] * data[i];
        }
        const rms = Math.sqrt(sumSq / data.length);
        onLevel(Math.min(1, rms * 9));
        this.rafId = window.requestAnimationFrame(tick);
      };
      this.rafId = window.requestAnimationFrame(tick);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop(): void {
    this.active = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // Ignore
    }
    try {
      void this.audioCtx?.close();
    } catch {
      // Ignore
    }
    this.stream = null;
    this.audioCtx = null;
  }
}

/**
 * Plays a gentle 120 ms two-tone chime on the very first captured audio frame (R-09)
 * so the user knows WASAPI is live and listening.
 */
export function playReadyChime(ctx?: AudioContext | null): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = ctx ?? new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.11);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.125);
    if (!ctx) {
      window.setTimeout(() => {
        void audioCtx.close().catch(() => {});
      }, 220);
    }
  } catch {
    // Ignore chime audio restriction errors
  }
}

export interface VoiceCaptureCallbacks {
  autoStopMs?: number;
  noSpeechTimeoutMs?: number;
  deviceId?: string;
  noiseSuppression?: boolean;
  sensitivity?: VoiceSensitivityMode;
  onReady?: () => void;
  onLevel?: (rms: number) => void;
  onAutoStop?: (pcm: Float32Array, reason: 'silence' | 'max_duration' | 'no_speech') => void;
  onError?: (code: string, message: string) => void;
}

export class VoiceAudioCapture {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassNode: BiquadFilterNode | null = null;
  private lowpassNode: BiquadFilterNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;
  private vad: VoiceVadController | null = null;
  private active = false;
  private starting = false;

  async start(callbacks: VoiceCaptureCallbacks = {}): Promise<boolean> {
    if (this.active || this.starting) return true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      callbacks.onError?.('INSECURE_CONTEXT', 'Audio capture requires a secure context.');
      return false;
    }

    this.starting = true;
    try {
      const useNoiseFilter = callbacks.noiseSuppression !== false;
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: useNoiseFilter,
        noiseSuppression: useNoiseFilter,
        autoGainControl: true,
      };
      if (callbacks.deviceId && callbacks.deviceId !== 'default') {
        audioConstraints.deviceId = { ideal: callbacks.deviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      await this.audioCtx.audioWorklet.addModule('/voice-worklet.js');
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.audioCtx, 'agendamea-voice-processor', {
        processorOptions: { targetSampleRate: TARGET_SAMPLE_RATE },
      });

      this.vad = new VoiceVadController({
        sampleRate: TARGET_SAMPLE_RATE,
        autoStopMs: callbacks.autoStopMs ?? DEFAULT_AUTO_STOP_MS,
        noSpeechTimeoutMs: callbacks.noSpeechTimeoutMs ?? DEFAULT_NO_SPEECH_TIMEOUT_MS,
        adaptiveNoiseFloor: true,
        sensitivity: callbacks.sensitivity ?? 'auto',
      });
      this.active = true;

      this.workletNode.port.onmessage = (event: MessageEvent) => {
        if (!this.active) return;
        const msg = event.data as { type?: string; pcm?: Float32Array; rms?: number };
        if (msg?.type === 'ready') {
          playReadyChime(this.audioCtx);
          callbacks.onReady?.();
          return;
        }
        if (msg?.type === 'pcm' && msg.pcm instanceof Float32Array) {
          callbacks.onLevel?.(Number(msg.rms) || 0);
          const vadRes = this.vad?.pushFrame(msg.pcm);
          if (vadRes && vadRes.action !== 'continue') {
            const finalPcm = this.stop();
            const reason =
              vadRes.action === 'auto_stop_silence'
                ? 'silence'
                : vadRes.action === 'auto_stop_no_speech'
                  ? 'no_speech'
                  : 'max_duration';
            callbacks.onAutoStop?.(finalPcm, reason);
          }
        }
      };

      // Keep AudioWorklet actively scheduled on all Windows WASAPI drivers via muted sink (zero audio echo)
      this.silentGainNode = this.audioCtx.createGain();
      this.silentGainNode.gain.value = 0;

      if (useNoiseFilter) {
        // Voice bandpass (85 Hz - 7800 Hz) removes low-frequency desk/AC hum & high-frequency hiss
        this.highpassNode = this.audioCtx.createBiquadFilter();
        this.highpassNode.type = 'highpass';
        this.highpassNode.frequency.value = 85;
        this.lowpassNode = this.audioCtx.createBiquadFilter();
        this.lowpassNode.type = 'lowpass';
        this.lowpassNode.frequency.value = 7800;

        this.sourceNode.connect(this.highpassNode);
        this.highpassNode.connect(this.lowpassNode);
        this.lowpassNode.connect(this.workletNode);
      } else {
        this.sourceNode.connect(this.workletNode);
      }

      this.workletNode.connect(this.silentGainNode);
      this.silentGainNode.connect(this.audioCtx.destination);
      return true;
    } catch (err) {
      this.cleanup();
      const name = err instanceof DOMException ? err.name : 'MIC_ERROR';
      const code =
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'MIC_DENIED'
          : name === 'NotFoundError'
            ? 'MIC_NOT_FOUND'
            : 'MIC_ERROR';
      callbacks.onError?.(code, err instanceof Error ? err.message : 'Microphone unavailable.');
      return false;
    } finally {
      this.starting = false;
    }
  }

  stop(): Float32Array {
    const pcm = this.vad ? this.vad.getMergedPcm() : new Float32Array(0);
    this.cleanup();
    return pcm;
  }

  private cleanup(): void {
    this.active = false;
    for (const node of [
      this.silentGainNode,
      this.workletNode,
      this.lowpassNode,
      this.highpassNode,
      this.sourceNode,
    ]) {
      try {
        node?.disconnect();
      } catch {
        // Ignore
      }
    }
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // Ignore
    }
    try {
      void this.audioCtx?.close();
    } catch {
      // Ignore
    }
    this.silentGainNode = null;
    this.workletNode = null;
    this.lowpassNode = null;
    this.highpassNode = null;
    this.sourceNode = null;
    this.stream = null;
    this.audioCtx = null;
    this.vad = null;
  }
}
