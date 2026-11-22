/**
 * WBS-3.1: Secure Context AudioWorkletProcessor
 * Captures live microphone audio, downsamples continuously to 16 kHz Mono Float32 PCM
 * with fractional phase tracking (zero 128-sample quantum drift at 48 kHz / 44.1 kHz)
 * and a preallocated Float32Array ring/output buffer (zero GC push/splice on audio thread).
 */
class AgendameaVoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetRate =
      (options && options.processorOptions && options.processorOptions.targetSampleRate) || 16000;
    this.inputRate = sampleRate || 48000;
    this.ratio = this.inputRate / this.targetRate;
    this.srcOffset = 0;
    this.prevSample = 0;
    this.chunkTarget = 1600; // 100 ms @ 16 kHz
    this.outBuf = new Float32Array(this.chunkTarget);
    this.outIdx = 0;
    this.firstFrameSent = false;
  }

  process(inputs) {
    const input = inputs && inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const channel = input[0];
    const chLen = channel.length;
    let sumSq = 0;
    for (let i = 0; i < chLen; i += 1) {
      sumSq += channel[i] * channel[i];
    }
    const rms = Math.sqrt(sumSq / chLen);

    if (!this.firstFrameSent) {
      this.firstFrameSent = true;
      this.port.postMessage({ type: 'ready', sampleRate: this.targetRate, rms });
    }

    // Continuous linear resampling preserving fractional phase across 128-sample quanta
    if (Math.abs(this.ratio - 1) < 0.005) {
      for (let i = 0; i < chLen; i += 1) {
        this.outBuf[this.outIdx] = channel[i];
        this.outIdx += 1;
        if (this.outIdx >= this.chunkTarget) {
          const chunk = this.outBuf;
          this.outBuf = new Float32Array(this.chunkTarget);
          this.outIdx = 0;
          this.port.postMessage({ type: 'pcm', pcm: chunk, rms }, [chunk.buffer]);
        }
      }
    } else {
      while (this.srcOffset < chLen) {
        const idx0 = Math.floor(this.srcOffset);
        const frac = this.srcOffset - idx0;
        const s0 = idx0 >= 0 ? channel[idx0] : this.prevSample;
        const s1 = idx0 + 1 < chLen ? channel[idx0 + 1] : channel[chLen - 1];
        this.outBuf[this.outIdx] = s0 + (s1 - s0) * frac;
        this.outIdx += 1;
        this.srcOffset += this.ratio;

        if (this.outIdx >= this.chunkTarget) {
          const chunk = this.outBuf;
          this.outBuf = new Float32Array(this.chunkTarget);
          this.outIdx = 0;
          this.port.postMessage({ type: 'pcm', pcm: chunk, rms }, [chunk.buffer]);
        }
      }
      this.prevSample = channel[chLen - 1];
      this.srcOffset -= chLen;
    }

    return true;
  }
}

registerProcessor('agendamea-voice-processor', AgendameaVoiceProcessor);
