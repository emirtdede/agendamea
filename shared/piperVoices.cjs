'use strict';

/**
 * Local Offline Neural TTS Voice Catalog & Download Manager (Piper VITS ONNX)
 * - 100% commercial-safe licenses (MIT, CC0, Public Domain)
 * - Live-verified Hugging Face URLs & exact LFS SHA-256 checksums (fail-closed)
 * - Turkish Female + Male & English Female + Male voices (~60 MB each, optional 1-click download)
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function renameWithRetry(fromPath, toPath, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      fs.renameSync(fromPath, toPath);
      return;
    } catch (err) {
      if (i === attempts - 1 || (err?.code !== 'EPERM' && err?.code !== 'EBUSY')) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
}

class PiperVoiceManager {
  constructor(options = {}) {
    if (!options.voicesDir) {
      throw new Error('PiperVoiceManager requires voicesDir.');
    }
    this.voicesDir = path.resolve(options.voicesDir);
    this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
    this.onProgressEvent = typeof options.onProgressEvent === 'function' ? options.onProgressEvent : null;
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
    const ctrl = new AbortController();
    this.activeControllers.set(voiceId, ctrl);

    const run = (async () => {
      let writeStream = null;
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
          } catch {}
          return { ok: false, code: 'MODEL_DOWNLOAD_FAILED', message: `HTTP ${onnxRes.status}` };
        }

        const totalBytes = Number(onnxRes.headers.get('content-length') || spec.bytes) || spec.bytes;
        writeStream = fs.createWriteStream(partPath);
        const reader = onnxRes.body.getReader();
        let receivedBytes = 0;
        let lastEmit = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            if (!writeStream.write(buf)) {
              await new Promise((resolve, reject) => {
                writeStream.once('drain', resolve);
                writeStream.once('error', reject);
              });
            }
            receivedBytes += buf.byteLength;
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

        // 3. Mandatory SHA-256 verification (fail-closed)
        const actualSha = await computeFileSha256(partPath);
        if (actualSha.toLowerCase() !== spec.sha256.toLowerCase()) {
          try {
            fs.rmSync(partPath, { force: true });
            fs.rmSync(cfgTmp, { force: true });
          } catch {}
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
        };
        this.downloadProgress.delete(spec.id);
        this.onProgressEvent?.(donePayload);
        return { ok: true, voiceId: spec.id, sha256: actualSha };
      } catch (err) {
        if (writeStream) {
          try {
            writeStream.destroy();
          } catch {}
        }
        try {
          fs.rmSync(partPath, { force: true });
          fs.rmSync(`${configPath}.part`, { force: true });
        } catch {}
        const cancelled = ctrl.signal.aborted;
        return {
          ok: false,
          code: cancelled ? 'CANCELLED' : 'DOWNLOAD_ERROR',
          message: cancelled ? 'Download cancelled.' : err instanceof Error ? err.message : 'Download failed.',
        };
      } finally {
        this.activeControllers.delete(voiceId);
        this.activePromises.delete(voiceId);
        this.downloadProgress.delete(voiceId);
        this.onProgressEvent?.({ voiceId: spec.id, done: true });
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
