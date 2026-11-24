/**
 * WBS-3.1 + v1.1.0 Neural Audio Upgrade:
 * Secure Context AudioWorklet Capture + 300 ms Ring Buffer + Selectable Ready Chimes +
 * Mozilla RNNoise WASM Neural Noise Suppression (48 kHz) + Web Audio Bandpass Filter +
 * Silero VAD v5 ONNX Neural Speech Detector with Continuous EMA Adaptive Noise-Floor Fallback +
 * No-Speech Timeout + Microphone Device Enumeration & Live Test Meter.
 */

import type { VoiceChimePreset, VoiceSensitivityMode } from '../types';
import { createRnnoiseNode, type RnnoiseHandle, SileroVadEngine } from './neuralAudio';
import {
  DEFAULT_AUTO_STOP_MS,
  DEFAULT_NO_SPEECH_TIMEOUT_MS,
  MAX_RECORDING_MS,
  MIN_SPEECH_RATIO,
  RING_BUFFER_MS,
  SPEECH_AMPLITUDE_THRESHOLD,
  SPEECH_RMS_THRESHOLD,
  TARGET_SAMPLE_RATE,
  type VadStateResult,
  VoiceVadController,
} from './voiceVadController';

export type { VoiceChimePreset, VoiceSensitivityMode };
export {
  DEFAULT_AUTO_STOP_MS,
  DEFAULT_NO_SPEECH_TIMEOUT_MS,
  MAX_RECORDING_MS,
  MIN_SPEECH_RATIO,
  RING_BUFFER_MS,
  SPEECH_AMPLITUDE_THRESHOLD,
  SPEECH_RMS_THRESHOLD,
  TARGET_SAMPLE_RATE,
  type VadStateResult,
  VoiceVadController,
};

export interface AudioInputDeviceInfo {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

/**
 * Enumerates available audio input devices (microphones).
 * If labels are blank because permission has not been granted yet and requestPermission is true,
 * briefly requests audio permission and immediately stops the probe track.
 */
export async function enumerateAudioInputDevices(
  requestPermission = false,
  fallbackLabel = 'Microphone',
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
        const probeStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        for (const track of probeStream.getTracks()) {
          track.stop();
        }
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
        label: dev.label?.trim() || `${fallbackLabel} ${unnamedIndex++}`,
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
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassNode: BiquadFilterNode | null = null;
  private lowpassNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private rnnoiseHandle: RnnoiseHandle | null = null;
  private rafId: number | null = null;
  private active = false;
  private startSeq = 0;

  async start(
    options: { deviceId?: string; noiseSuppression?: boolean },
    onLevel: (level: number) => void,
  ): Promise<boolean> {
    this.stop();
    const seq = ++this.startSeq;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const useNoiseFilter = options.noiseSuppression !== false;
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: useNoiseFilter,
        noiseSuppression: useNoiseFilter,
        autoGainControl: true,
      };
      if (options.deviceId && options.deviceId !== 'default') {
        audioConstraints.deviceId = { ideal: options.deviceId };
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      if (seq !== this.startSeq) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return false;
      }
      this.stream = stream;
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      this.audioCtx = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      if (seq !== this.startSeq) {
        this.cleanupResources();
        return false;
      }
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      this.sourceNode = source;
      this.analyserNode = analyser;

      if (useNoiseFilter) {
        const rnnoise = await createRnnoiseNode(audioCtx);
        if (seq !== this.startSeq) {
          rnnoise?.destroy();
          this.cleanupResources();
          return false;
        }
        this.rnnoiseHandle = rnnoise;

        const highpass = audioCtx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 85;
        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 7800;
        this.highpassNode = highpass;
        this.lowpassNode = lowpass;

        if (rnnoise) {
          source.connect(rnnoise.node);
          rnnoise.node.connect(highpass);
        } else {
          source.connect(highpass);
        }
        highpass.connect(lowpass);
        lowpass.connect(analyser);
      } else {
        source.connect(analyser);
      }

      const data = new Float32Array(analyser.fftSize);
      this.active = true;
      const tick = () => {
        if (!this.active || seq !== this.startSeq) return;
        analyser.getFloatTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i += 1) {
          const sample = data[i] ?? 0;
          sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / data.length);
        onLevel(Math.min(1, rms * 9));
        this.rafId = window.requestAnimationFrame(tick);
      };
      this.rafId = window.requestAnimationFrame(tick);
      return true;
    } catch {
      this.cleanupResources();
      return false;
    }
  }

  private cleanupResources(): void {
    this.active = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.rnnoiseHandle?.destroy();
    this.rnnoiseHandle = null;
    for (const node of [this.analyserNode, this.lowpassNode, this.highpassNode, this.sourceNode]) {
      try {
        node?.disconnect();
      } catch {
        // Ignore
      }
    }
    this.analyserNode = null;
    this.lowpassNode = null;
    this.highpassNode = null;
    this.sourceNode = null;
    try {
      for (const track of this.stream?.getTracks() ?? []) {
        track.stop();
      }
    } catch {
      // Ignore
    }
    try {
      void this.audioCtx?.close().catch(() => {
        /* ignore */
      });
    } catch {
      // Ignore
    }
    this.stream = null;
    this.audioCtx = null;
  }

  stop(): void {
    this.startSeq += 1;
    this.cleanupResources();
  }
}

/**
 * Plays a crisp, selectable dictation ready chime on the first captured audio frame (R-09)
 * or during settings preview. Supports 5 presets: soft, crystal, studio, minimal, none.
 */
export function playReadyChime(ctx?: AudioContext | null, preset: VoiceChimePreset = 'soft'): void {
  if (preset === 'none') return;
  let localAudioCtx: AudioContext | null = null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = ctx ?? new AudioCtx();
    if (!ctx) {
      localAudioCtx = audioCtx;
    }
    const now = audioCtx.currentTime;
    let closeAfterMs = 240;

    if (preset === 'crystal') {
      // Harmonic two-note crystal bell (A5 -> E6)
      const notes = [
        { freq: 880, start: 0, dur: 0.11, vol: 0.065 },
        { freq: 1318.5, start: 0.075, dur: 0.15, vol: 0.055 },
      ];
      for (const n of notes) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        gain.gain.setValueAtTime(0.001, now + n.start);
        gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.01);
      }
      closeAfterMs = 320;
    } else if (preset === 'studio') {
      // Warm deep studio cue (A4 -> C#5)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.13);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.085, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
      closeAfterMs = 260;
    } else if (preset === 'minimal') {
      // Short subtle 60 ms tactile click/pop
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.055);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
      closeAfterMs = 150;
    } else {
      // Default 'soft': gentle 120 ms rising chime (E5 -> A5)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
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
    }

    if (localAudioCtx) {
      const ctxToClose = localAudioCtx;
      localAudioCtx = null;
      window.setTimeout(() => {
        void ctxToClose.close().catch(() => {
          // Ignore audio context close error
        });
      }, closeAfterMs);
    }
  } catch {
    if (localAudioCtx) {
      void localAudioCtx.close().catch(() => {
        // Ignore audio context close error
      });
      localAudioCtx = null;
    }
    // Ignore chime audio restriction errors
  }
}

export interface VoiceCaptureCallbacks {
  autoStopMs?: number;
  noSpeechTimeoutMs?: number;
  deviceId?: string;
  noiseSuppression?: boolean;
  sensitivity?: VoiceSensitivityMode;
  chimePreset?: VoiceChimePreset;
  onReady?: (info?: { rnnoiseActive: boolean; sileroVadActive: boolean }) => void;
  onLevel?: (rms: number) => void;
  onAutoStop?: (pcm: Float32Array, reason: 'silence' | 'max_duration' | 'no_speech') => void;
  onError?: (code: string, message: string) => void;
}

export class VoiceAudioCapture {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private rnnoiseHandle: RnnoiseHandle | null = null;
  private highpassNode: BiquadFilterNode | null = null;
  private lowpassNode: BiquadFilterNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;
  private vad: VoiceVadController | null = null;
  private sileroVad: SileroVadEngine | null = null;
  private frameQueue: Promise<void> = Promise.resolve();
  private pendingFrames = 0;
  private active = false;
  private starting = false;
  private startSeq = 0;

  async start(callbacks: VoiceCaptureCallbacks = {}): Promise<boolean> {
    if (this.active || this.starting) return true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      callbacks.onError?.('INSECURE_CONTEXT', 'Audio capture requires a secure context.');
      return false;
    }

    const seq = ++this.startSeq;
    this.starting = true;
    try {
      const useNoiseFilter = callbacks.noiseSuppression !== false;
      const chimePreset = callbacks.chimePreset ?? 'soft';
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: useNoiseFilter,
        noiseSuppression: useNoiseFilter,
        autoGainControl: true,
      };
      if (callbacks.deviceId && callbacks.deviceId !== 'default') {
        audioConstraints.deviceId = { ideal: callbacks.deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      if (seq !== this.startSeq) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return false;
      }
      this.stream = stream;

      // 48 kHz matches RNNoise's native processing rate cleanly
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      this.audioCtx = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      if (seq !== this.startSeq) {
        this.cleanup();
        return false;
      }

      // Initialize AudioWorklet + RNNoise WASM + Silero VAD v5 ONNX in parallel
      const silero = new SileroVadEngine();
      const [, rnnoise, sileroReady] = await Promise.all([
        audioCtx.audioWorklet.addModule('/voice-worklet.js'),
        useNoiseFilter ? createRnnoiseNode(audioCtx) : Promise.resolve(null),
        silero.init(),
      ]);

      if (seq !== this.startSeq) {
        rnnoise?.destroy();
        silero.dispose();
        this.cleanup();
        return false;
      }

      this.rnnoiseHandle = rnnoise;
      this.sileroVad = sileroReady ? silero : null;
      this.frameQueue = Promise.resolve();

      this.sourceNode = audioCtx.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(audioCtx, 'agendamea-voice-processor', {
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

      const rnnoiseActive = Boolean(this.rnnoiseHandle);
      const sileroVadActive = Boolean(this.sileroVad);

      this.workletNode.port.onmessage = (event: MessageEvent) => {
        if (!this.active || seq !== this.startSeq) return;
        const msg = event.data as { type?: string; pcm?: Float32Array; rms?: number };
        if (msg?.type === 'ready') {
          playReadyChime(this.audioCtx, chimePreset);
          callbacks.onReady?.({ rnnoiseActive, sileroVadActive });
          return;
        }
        if (msg?.type === 'pcm' && msg.pcm instanceof Float32Array) {
          const pcmChunk = msg.pcm;
          callbacks.onLevel?.(Number(msg.rms) || 0);

          // Cap queued VAD frames on constrained CPUs to prevent unbounded RAM growth
          if (this.pendingFrames >= 16) {
            return;
          }
          this.pendingFrames += 1;

          const evaluateAndPush = async () => {
            try {
              if (!this.active || seq !== this.startSeq || !this.vad) return;
              const neuralProb = this.sileroVad
                ? await this.sileroVad.evaluateChunk(pcmChunk)
                : null;
              if (!this.active || seq !== this.startSeq || !this.vad) return;
              const vadRes = this.vad.pushFrame(pcmChunk, neuralProb);
              if (vadRes.action !== 'continue') {
                const finalPcm = this.stop();
                const reason =
                  vadRes.action === 'auto_stop_silence'
                    ? 'silence'
                    : vadRes.action === 'auto_stop_no_speech'
                      ? 'no_speech'
                      : 'max_duration';
                callbacks.onAutoStop?.(finalPcm, reason);
              }
            } finally {
              this.pendingFrames = Math.max(0, this.pendingFrames - 1);
            }
          };

          this.frameQueue = this.frameQueue.then(evaluateAndPush, evaluateAndPush);
        }
      };

      // Keep AudioWorklet actively scheduled on all Windows WASAPI drivers via muted sink (zero audio echo)
      this.silentGainNode = audioCtx.createGain();
      this.silentGainNode.gain.value = 0;

      if (useNoiseFilter) {
        // Mozilla RNNoise WASM (48 kHz) -> Voice Bandpass (85 Hz - 7800 Hz) -> 16 kHz Downsampler Worklet
        this.highpassNode = audioCtx.createBiquadFilter();
        this.highpassNode.type = 'highpass';
        this.highpassNode.frequency.value = 85;
        this.lowpassNode = audioCtx.createBiquadFilter();
        this.lowpassNode.type = 'lowpass';
        this.lowpassNode.frequency.value = 7800;

        if (this.rnnoiseHandle) {
          this.sourceNode.connect(this.rnnoiseHandle.node);
          this.rnnoiseHandle.node.connect(this.highpassNode);
        } else {
          this.sourceNode.connect(this.highpassNode);
        }
        this.highpassNode.connect(this.lowpassNode);
        this.lowpassNode.connect(this.workletNode);
      } else {
        this.sourceNode.connect(this.workletNode);
      }

      this.workletNode.connect(this.silentGainNode);
      this.silentGainNode.connect(audioCtx.destination);
      return true;
    } catch (err) {
      this.cleanup();
      if (seq !== this.startSeq) {
        return false;
      }
      const name = err instanceof DOMException ? err.name : 'MIC_ERROR';
      const code =
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'MIC_DENIED'
          : name === 'NotFoundError'
            ? 'MIC_NOT_FOUND'
            : 'MIC_ERROR';
      console.error('[VoiceAudioCapture] microphone start error:', err);
      const safeMessage =
        code === 'MIC_DENIED'
          ? 'Microphone permission denied.'
          : code === 'MIC_NOT_FOUND'
            ? 'No microphone device found.'
            : 'Microphone unavailable.';
      callbacks.onError?.(code, safeMessage);
      return false;
    } finally {
      this.starting = false;
    }
  }

  stop(): Float32Array {
    this.startSeq += 1;
    const pcm = this.vad ? this.vad.getMergedPcm() : new Float32Array(0);
    this.cleanup();
    return pcm;
  }

  private cleanup(): void {
    this.active = false;
    this.pendingFrames = 0;
    this.rnnoiseHandle?.destroy();
    this.rnnoiseHandle = null;
    this.sileroVad?.dispose();
    this.sileroVad = null;
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
      for (const track of this.stream?.getTracks() ?? []) {
        track.stop();
      }
    } catch {
      // Ignore
    }
    try {
      void this.audioCtx?.close().catch(() => {
        /* ignore */
      });
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
