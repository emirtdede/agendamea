'use strict';

/**
 * Local Offline Neural TTS Voice Catalog & Download Manager (Piper VITS ONNX)
 * - 100% commercial-safe licenses (MIT, CC0, Public Domain)
 * - Live-verified Hugging Face URLs & exact LFS SHA-256 checksums (fail-closed)
 * - Turkish Female + Male & English Female + Male voices (~60 MB each, optional 1-click download)
 */

const fs = require('node:fs');
const path = require('node:path');
const { getAppLogger } = require('./logger.cjs');
const { getDiskFreeBytes } = require('./hardwareProfiler.cjs');
const { computeFileSha256, writeChunkSafe, renameWithRetry } = require('./downloadUtils.cjs');

const piperLog = () => getAppLogger('piper-voices');

const ALLOWED_PIPER_LICENSES = new Set(['mit', 'cc0', 'public-domain']);

const PIPER_VOICE_CATALOG = Object.freeze([
  Object.freeze({
    id: 'piper-tr-ilkiz-female',
    name: 'İlkiz',
    language: 'tr-TR',
    baseLang: 'tr',
    gender: 'female',
    quality: 'medium',
    sampleRate: 22050,
    license: 'mit',
    bytes: 63516174,
    sha256: 'c8dbe6ea87210f2a4132efd53aaf6d548f187c756ca656dd7a20e8b251dd14c7',
    onnxUrl: 'https://huggingface.co/ilkeraktuna/piper-tts-tr-ilkiz-medium/resolve/main/ilkiz.onnx',
    configUrl:
      'https://huggingface.co/ilkeraktuna/piper-tts-tr-ilkiz-medium/resolve/main/ilkiz.onnx.json',
  }),
  Object.freeze({
    id: 'piper-tr-fahrettin-male',
    name: 'Fahrettin',
    language: 'tr-TR',
    baseLang: 'tr',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    license: 'cc0',
    bytes: 63201294,
    sha256: '39081c47270180e8a0dfac69b07bf329fb6d039fcc1279dbe26c2daf2848b190',
    onnxUrl:
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx',
    configUrl:
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx.json',
  }),
  Object.freeze({
    id: 'piper-tr-fettah-male',
    name: 'Fettah',
    language: 'tr-TR',
    baseLang: 'tr',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    license: 'cc0',
    bytes: 63201294,
    sha256: '5d14d5222f36aea2b8fc8dba097fcb18dcf8f5b33e5b2aa76b5e0b44602aa8d7',
    onnxUrl:
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx',
    configUrl:
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx.json',
  }),
  Object.freeze({
    id: 'piper-en-kristin-female',
    name: 'Kristin',
    language: 'en-US',
    baseLang: 'en',
    gender: 'female',
    quality: 'medium',
    sampleRate: 22050,
    license: 'public-domain',
    bytes: 63531379,
    sha256: '5849957f929cbf720c258f8458692d6103fff2f0e3d3b19c8259474bb06a18d4',
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/en_US-kristin-medium.onnx',
    configUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/en_US-kristin-medium.onnx.json',
  }),
  Object.freeze({
    id: 'piper-en-joe-male',
    name: 'Joe',
    language: 'en-US',
    baseLang: 'en',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    license: 'cc0',
    bytes: 63221984,
    sha256: 'abf4b998e34045cbd00eaf050de2de620f81ded6eb8b85a24b022a1c2b3f08d2',
    onnxUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx',
    configUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/joe/medium/en_US-joe-medium.onnx.json',
  }),
]);

/** @type {Record<string, any>} */
const PIPER_VOICES_BY_ID = Object.freeze(
  PIPER_VOICE_CATALOG.reduce((/** @type {Record<string, any>} */ acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {}),
);

function assertAllowedPiperLicense(spec) {
  if (!spec || !ALLOWED_PIPER_LICENSES.has(String(spec.license || '').toLowerCase())) {
    throw new Error(`FORBIDDEN_VOICE_LICENSE: ${spec?.id || 'unknown'}`);
  }
}

class PiperVoiceManager {
  constructor(options = {}) {
    if (!options.voicesDir) {
      throw new Error('PiperVoiceManager requires voicesDir.');
    }
    this.voicesDir = path.resolve(options.voicesDir);
    this.fetchFn = options.fetchFn || ((input, init) => globalThis.fetch(input, init));
    this.statfsFn = options.statfsFn || null;
    this.onProgressEvent =
      typeof options.onProgressEvent === 'function' ? options.onProgressEvent : null;
    this.activeControllers = new Map();
    this.activePromises = new Map();
    this.downloadProgress = new Map();
  }

  ensureDir() {
    fs.mkdirSync(this.voicesDir, { recursive: true });
  }

  resolveSpec(voiceId) {
    const spec = PIPER_VOICES_BY_ID[voiceId];
    if (!spec) {
      throw new Error(`UNKNOWN_PIPER_VOICE: ${voiceId}`);
    }
    assertAllowedPiperLicense(spec);
    return spec;
  }

  getVoicePaths(voiceId) {
    const spec = this.resolveSpec(voiceId);
    const onnxPath = path.join(this.voicesDir, `${spec.id}.onnx`);
    const configPath = path.join(this.voicesDir, `${spec.id}.onnx.json`);
    const partPath = `${onnxPath}.part`;
    const installed = fs.existsSync(onnxPath) && fs.existsSync(configPath);
    return { spec, onnxPath, configPath, partPath, installed };
  }

  listVoices() {
    return PIPER_VOICE_CATALOG.map((spec) => {
      const { onnxPath, configPath, installed } = this.getVoicePaths(spec.id);
      let diskBytes = 0;
      if (installed) {
        try {
          diskBytes = fs.statSync(onnxPath).size + fs.statSync(configPath).size;
        } catch {
          diskBytes = 0;
        }
      }
      return {
        id: spec.id,
        name: spec.name,
        language: spec.language,
        baseLang: spec.baseLang,
        gender: spec.gender,
        quality: spec.quality,
        sampleRate: spec.sampleRate,
        license: spec.license,
        expectedBytes: spec.bytes,
        installed,
        bytes: diskBytes,
        downloading: this.activeControllers.has(spec.id),
        progress: this.downloadProgress.get(spec.id) || null,
      };
    });
  }

  cancelDownload(voiceId) {
    const ctrl = this.activeControllers.get(voiceId);
    if (!ctrl) return { ok: true, cancelled: false };
    ctrl.abort();
    return { ok: true, cancelled: true };
  }

  deleteVoice(voiceId) {
    this.cancelDownload(voiceId);
    const { onnxPath, configPath, partPath } = this.getVoicePaths(voiceId);
    let removed = false;
    for (const p of [onnxPath, configPath, partPath]) {
      try {
        if (fs.existsSync(p)) {
          fs.rmSync(p, { force: true });
          removed = true;
        }
      } catch {
        // Ignore locked file
      }
    }
    this.downloadProgress.delete(voiceId);
    return { ok: true, removed };
  }

  async downloadVoice(voiceId) {
    const existing = this.activePromises.get(voiceId);
    if (existing) return existing;

    const spec = this.resolveSpec(voiceId);
    const { onnxPath, configPath, partPath, installed } = this.getVoicePaths(voiceId);
    if (installed) {
      return { ok: true, voiceId: spec.id, alreadyInstalled: true };
    }

    this.ensureDir();

    // 2x free disk space guard before writing temporary voice binary
    const requiredFreeBytes = spec.bytes * 2;
    const freeBytes = getDiskFreeBytes(this.voicesDir, this.statfsFn || undefined);
    if (freeBytes !== null && freeBytes < requiredFreeBytes) {
      return {
        ok: false,
        code: 'INSUFFICIENT_DISK_SPACE',
        requiredBytes: requiredFreeBytes,
        freeBytes,
        message: 'Insufficient free disk space to download voice pack.',
      };
    }

    const ctrl = new AbortController();
    this.activeControllers.set(voiceId, ctrl);

    const run = (async () => {
      let writeStream = null;
      let doneEmitted = false;
      try {
        // 1. Download small JSON config first
        const cfgRes = await this.fetchFn(spec.configUrl, { signal: ctrl.signal });
        if (!cfgRes.ok) {
          return { ok: false, code: 'CONFIG_DOWNLOAD_FAILED', message: `HTTP ${cfgRes.status}` };
        }
        const cfgText = await cfgRes.text();
        // Validate JSON syntax before saving
        JSON.parse(cfgText);
        const cfgTmp = `${configPath}.part`;
        fs.writeFileSync(cfgTmp, cfgText, 'utf8');

        // 2. Stream ONNX binary to .part file
        const onnxRes = await this.fetchFn(spec.onnxUrl, { signal: ctrl.signal });
        if (!onnxRes.ok || !onnxRes.body) {
          try {
            fs.rmSync(cfgTmp, { force: true });
          } catch {
            /* ignore */
          }
          return { ok: false, code: 'MODEL_DOWNLOAD_FAILED', message: `HTTP ${onnxRes.status}` };
        }

        const totalBytes =
          Number(onnxRes.headers.get('content-length') || spec.bytes) || spec.bytes;
        writeStream = fs.createWriteStream(partPath);
        let writeErr = null;
        writeStream.on('error', (e) => {
          writeErr = e;
        });
        const reader = onnxRes.body.getReader();
        let receivedBytes = 0;
        let lastEmit = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            receivedBytes += buf.byteLength;
            if (spec.bytes > 0 && receivedBytes > spec.bytes) {
              throw Object.assign(new Error('Voice download exceeded expected size.'), {
                code: 'SIZE_EXCEEDED',
              });
            }
            await writeChunkSafe(writeStream, buf, () => writeErr);
            if (writeErr) throw writeErr;
            const now = Date.now();
            if (now - lastEmit >= 180 || receivedBytes >= totalBytes) {
              lastEmit = now;
              const progress = {
                voiceId: spec.id,
                receivedBytes,
                totalBytes,
                percent: Math.min(99, Math.round((receivedBytes / Math.max(1, totalBytes)) * 100)),
              };
              this.downloadProgress.set(spec.id, progress);
              this.onProgressEvent?.({ ...progress, done: false });
            }
          }
        }

        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          writeStream.end();
        });
        writeStream = null;
        if (writeErr) throw writeErr;

        // 3. Mandatory SHA-256 verification (fail-closed)
        const actualSha = await computeFileSha256(partPath);
        if (actualSha.toLowerCase() !== spec.sha256.toLowerCase()) {
          try {
            fs.rmSync(partPath, { force: true });
            fs.rmSync(cfgTmp, { force: true });
          } catch {
            /* ignore */
          }
          return {
            ok: false,
            code: 'SHA256_MISMATCH',
            message: 'Voice model SHA-256 verification failed.',
          };
        }

        // 4. Atomic rename into place
        await renameWithRetry(cfgTmp, configPath);
        await renameWithRetry(partPath, onnxPath);

        const donePayload = {
          voiceId: spec.id,
          receivedBytes: totalBytes,
          totalBytes,
          percent: 100,
          done: true,
          ok: true,
        };
        this.downloadProgress.delete(spec.id);
        doneEmitted = true;
        this.onProgressEvent?.(donePayload);
        return { ok: true, voiceId: spec.id, sha256: actualSha };
      } catch (err) {
        if (writeStream) {
          try {
            writeStream.destroy();
          } catch {
            /* ignore */
          }
        }
        try {
          fs.rmSync(partPath, { force: true });
          fs.rmSync(`${configPath}.part`, { force: true });
        } catch {
          /* ignore */
        }
        const cancelled = ctrl.signal.aborted;
        const sizeExceeded = err?.code === 'SIZE_EXCEEDED';
        if (!cancelled) {
          piperLog().error({ voiceId: spec.id, err }, 'Piper voice download failed');
        }
        return {
          ok: false,
          code: cancelled ? 'CANCELLED' : sizeExceeded ? 'SIZE_EXCEEDED' : 'DOWNLOAD_ERROR',
          message: cancelled
            ? 'Download cancelled.'
            : sizeExceeded
              ? 'Voice download exceeded expected size.'
              : 'Voice model download failed.',
        };
      } finally {
        this.activeControllers.delete(voiceId);
        this.activePromises.delete(voiceId);
        this.downloadProgress.delete(voiceId);
        if (!doneEmitted) {
          this.onProgressEvent?.({ voiceId: spec.id, done: true, ok: false });
        }
      }
    })();

    this.activePromises.set(voiceId, run);
    return run;
  }
}

module.exports = {
  ALLOWED_PIPER_LICENSES,
  PIPER_VOICE_CATALOG,
  PIPER_VOICES_BY_ID,
  assertAllowedPiperLicense,
  PiperVoiceManager,
};
