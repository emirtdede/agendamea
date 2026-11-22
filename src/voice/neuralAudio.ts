/**
 * Local Offline Neural Audio Pipeline:
 * 1. Mozilla RNNoise WebAssembly (@sapphi-red/web-noise-suppressor, MIT / BSD-3-Clause)
 *    for real-time deep-learning noise suppression at 48 kHz inside AudioWorklet.
 * 2. Silero VAD v5 ONNX (@ricky0123/vad-web + onnxruntime-web/wasm, MIT / ISC)
 *    for neural human-speech probability detection on 512-sample (32 ms) 16 kHz frames.
 *
 * Zero CDN requests: all WASM/ONNX binaries load exclusively from /voice-assets/.
 * Every component degrades gracefully if WebAssembly/AudioWorklet is unavailable.
 */

import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';

const VOICE_ASSET_BASE = '/voice-assets';
const SILERO_FRAME_SAMPLES = 512; // 32 ms @ 16 kHz
const SILERO_CONTEXT_SAMPLES = 64;

let cachedRnnoiseWasm: ArrayBuffer | null = null;
let cachedSileroModel: ArrayBuffer | null = null;

export interface RnnoiseHandle {
  node: RnnoiseWorkletNode;
  destroy: () => void;
}

/**
 * Loads Mozilla RNNoise SIMD/WASM binary once and constructs a 48 kHz AudioWorkletNode.
 * Dynamically imports @sapphi-red/web-noise-suppressor so Node.js / SSR / tests never touch
 * browser-only AudioWorkletNode globals at module load time.
 * Returns null cleanly if unsupported or asset unavailable.
 */
export async function createRnnoiseNode(audioCtx: AudioContext): Promise<RnnoiseHandle | null> {
  if (
    typeof window === 'undefined' ||
    typeof AudioWorkletNode === 'undefined' ||
    !audioCtx.audioWorklet
  ) {
    return null;
  }
  try {
    const { loadRnnoise, RnnoiseWorkletNode: RnnoiseNodeCtor } = await import(
      '@sapphi-red/web-noise-suppressor'
    );
    if (!cachedRnnoiseWasm) {
      cachedRnnoiseWasm = await loadRnnoise({
        url: `${VOICE_ASSET_BASE}/rnnoise.wasm`,
        simdUrl: `${VOICE_ASSET_BASE}/rnnoise_simd.wasm`,
      });
    }
    await audioCtx.audioWorklet.addModule(`${VOICE_ASSET_BASE}/rnnoise-worklet.js`);
    // Clone cached ArrayBuffer because AudioWorklet constructor transfers/copies wasmBinary
    const binaryCopy = cachedRnnoiseWasm.slice(0);
    const node = new RnnoiseNodeCtor(audioCtx, {
      maxChannels: 1,
      wasmBinary: binaryCopy,
    });
    return {
      node,
      destroy: () => {
        try {
          node.destroy();
        } catch {
          // Ignore double destroy
        }
        try {
          node.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      },
    };
  } catch {
    return null;
  }
}

type OrtModule = typeof import('onnxruntime-web/wasm');
type OrtSession = import('onnxruntime-web/wasm').InferenceSession;
type OrtTensor = import('onnxruntime-web/wasm').Tensor;

let sharedSileroSession: OrtSession | null = null;
let sharedOrt: OrtModule | null = null;
let sileroInitPromise: Promise<{ ort: OrtModule; session: OrtSession } | null> | null = null;

async function ensureSileroSession(): Promise<{ ort: OrtModule; session: OrtSession } | null> {
  if (sharedSileroSession && sharedOrt) {
    return { ort: sharedOrt, session: sharedSileroSession };
  }
  if (sileroInitPromise) return sileroInitPromise;

  sileroInitPromise = (async () => {
    try {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = `${VOICE_ASSET_BASE}/`;
      // Single-threaded WASM works reliably in all Electron/browser contexts without COOP/COEP headers
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';

      if (!cachedSileroModel) {
        const res = await fetch(`${VOICE_ASSET_BASE}/silero_vad_v5.onnx`);
        if (!res.ok) return null;
        cachedSileroModel = await res.arrayBuffer();
      }
      const session = await ort.InferenceSession.create(cachedSileroModel.slice(0), {
        executionProviders: ['wasm'],
      });
      sharedOrt = ort;
      sharedSileroSession = session;
      return { ort, session };
    } catch {
      sileroInitPromise = null;
      return null;
    }
  })();

  return sileroInitPromise;
}

/**
 * Stateful Silero VAD v5 session runner for 16 kHz Mono Float32 PCM chunks.
 * Buffers arbitrary incoming PCM sizes (e.g. 1600 samples = 100 ms) into exact
 * 512-sample (32 ms) Silero v5 frames with a 64-sample rolling context window.
 */
export class SileroVadEngine {
  private ort: OrtModule | null = null;
  private session: OrtSession | null = null;
  private state: OrtTensor | null = null;
  private srTensor: OrtTensor | null = null;
  private context = new Float32Array(SILERO_CONTEXT_SAMPLES);
  private remainder = new Float32Array(0);
  private lastProb = 0;
  private ready = false;

  async init(): Promise<boolean> {
    if (this.ready && this.session && this.ort) return true;
    const loaded = await ensureSileroSession();
    if (!loaded) return false;
    this.ort = loaded.ort;
    this.session = loaded.session;
    this.srTensor = new loaded.ort.Tensor('int64', BigInt64Array.from([16000n]), [1]);
    this.reset();
    this.ready = true;
    return true;
  }

  isReady(): boolean {
    return this.ready && this.session !== null;
  }

  reset(): void {
    if (this.ort) {
      this.state = new this.ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128]);
    }
    this.context = new Float32Array(SILERO_CONTEXT_SAMPLES);
    this.remainder = new Float32Array(0);
    this.lastProb = 0;
  }

  /**
   * Evaluates a 16 kHz PCM chunk and returns the peak neural human-speech probability [0..1].
   * Returns null if engine is not ready or inference fails.
   */
  async evaluateChunk(pcm: Float32Array): Promise<number | null> {
    if (!this.ready || !this.session || !this.ort || !this.state || !this.srTensor) {
      return null;
    }
    try {
      const combined = new Float32Array(this.remainder.length + pcm.length);
      if (this.remainder.length > 0) {
        combined.set(this.remainder, 0);
      }
      combined.set(pcm, this.remainder.length);

      let offset = 0;
      let maxProb = -1;

      let currentState: OrtTensor = this.state;
      const srTensor: OrtTensor = this.srTensor;

      while (offset + SILERO_FRAME_SAMPLES <= combined.length) {
        const frame = combined.subarray(offset, offset + SILERO_FRAME_SAMPLES);
        offset += SILERO_FRAME_SAMPLES;

        const withContext = new Float32Array(SILERO_CONTEXT_SAMPLES + SILERO_FRAME_SAMPLES);
        withContext.set(this.context, 0);
        withContext.set(frame, SILERO_CONTEXT_SAMPLES);
        this.context = frame.slice(-SILERO_CONTEXT_SAMPLES);

        const inputTensor: OrtTensor = new this.ort.Tensor('float32', withContext, [
          1,
          withContext.length,
        ]);
        const outputs: Record<string, OrtTensor> = await this.session.run({
          input: inputTensor,
          state: currentState,
          sr: srTensor,
        });
        const nextState: OrtTensor | undefined = outputs['stateN'];
        const outTensor: OrtTensor | undefined = outputs['output'];
        if (!nextState || !outTensor?.data) {
          return null;
        }
        currentState = nextState;
        this.state = nextState;
        const prob = Number(outTensor.data[0]);
        if (Number.isFinite(prob) && prob > maxProb) {
          maxProb = prob;
        }
      }

      this.remainder = combined.slice(offset);
      if (maxProb >= 0) {
        this.lastProb = maxProb;
      }
      return this.lastProb;
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.ready = false;
    this.state = null;
    this.srTensor = null;
    this.remainder = new Float32Array(0);
    this.context = new Float32Array(SILERO_CONTEXT_SAMPLES);
  }
}
