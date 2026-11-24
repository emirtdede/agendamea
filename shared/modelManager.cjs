'use strict';

/**
 * WBS-2.1: Atomic Model Download, HTTP Range Resume, 2x Disk-Space Guard,
 * AbortController Cancel, Mandatory Streaming SHA-256 Verification & MSIX userData/models Cleanup.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getAppLogger } = require('./logger.cjs');
const {
  MODEL_CATALOG,
  MODELS_BY_ID,
  assertAllowedModelLicense,
  buildDownloadUrl,
} = require('./aiCatalog.cjs');

const modelLog = () => getAppLogger('model-manager');
const { getDiskFreeBytes } = require('./hardwareProfiler.cjs');
const { computeFileSha256, writeChunkSafe, renameWithRetry } = require('./downloadUtils.cjs');

function parseContentRangeTotal(res, fallbackStart = 0) {
  const cr = res?.headers?.get?.('content-range');
  if (typeof cr === 'string') {
    const match = cr.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
    if (match) {
      const start = Number(match[1]);
      const total = match[3] === '*' ? null : Number(match[3]);
      return { start, total: Number.isFinite(total) ? total : null };
    }
    const unsat = cr.match(/bytes\s+\*\/(\d+)/i);
    if (unsat) {
      const total = Number(unsat[1]);
      return { start: fallbackStart, total: Number.isFinite(total) ? total : null };
    }
  }
  const cl = Number(res?.headers?.get?.('content-length') || 0);
  if (Number.isFinite(cl) && cl > 0) {
    return { start: fallbackStart, total: fallbackStart + cl };
  }
  return { start: fallbackStart, total: null };
}

class ModelManager {
  constructor(options = {}) {
    if (!options.modelsDir) {
      throw new Error('ModelManager requires modelsDir (e.g. <userData>/models).');
    }
    this.modelsDir = path.resolve(options.modelsDir);
    this.fetchFn = options.fetchFn || ((input, init) => globalThis.fetch(input, init));
    this.statfsFn = options.statfsFn || null;
    this.urlOverrideById = options.urlOverrideById || {};
    this.onProgressEvent =
      typeof options.onProgressEvent === 'function' ? options.onProgressEvent : null;
    this.activeControllers = new Map();
    this.activePromises = new Map();
    this.pendingCleanParts = new Set();
    this.downloadProgress = new Map();
    this._manifestCache = new Map();
  }

  ensureDir() {
    fs.mkdirSync(this.modelsDir, { recursive: true });
  }

  resolveModelSpec(modelId, customSpec = null) {
    const spec = customSpec || MODELS_BY_ID[modelId];
    if (!spec) {
      throw new Error(`UNKNOWN_MODEL: "${modelId}" is not in the verified catalog.`);
    }
    assertAllowedModelLicense(spec);
    return {
      ...spec,
      url: this.urlOverrideById[spec.id] || spec.url || buildDownloadUrl(spec),
    };
  }

  getModelPath(modelId, customSpec = null) {
    const spec = this.resolveModelSpec(modelId, customSpec);
    return path.join(this.modelsDir, spec.file);
  }

  getPartPath(modelId, customSpec = null) {
    return `${this.getModelPath(modelId, customSpec)}.part`;
  }

  getManifestPath(modelId, customSpec = null) {
    return `${this.getModelPath(modelId, customSpec)}.manifest.json`;
  }

  readManifest(modelId, customSpec = null) {
    try {
      const p = this.getManifestPath(modelId, customSpec);
      let stat;
      try {
        stat = fs.statSync(p);
      } catch {
        this._manifestCache.delete(p);
        return null;
      }
      const cached = this._manifestCache.get(p);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.data;
      }
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      this._manifestCache.set(p, { mtimeMs: stat.mtimeMs, size: stat.size, data });
      return data;
    } catch {
      return null;
    }
  }

  getModelStatus(modelId, customSpec = null) {
    const spec = this.resolveModelSpec(modelId, customSpec);
    const full = path.join(this.modelsDir, spec.file);
    const part = `${full}.part`;
    const manifest = this.readManifest(modelId, customSpec);
    const present = fs.existsSync(full);
    const actualBytes = present ? fs.statSync(full).size : 0;
    const partialBytes = fs.existsSync(part) ? fs.statSync(part).size : 0;
    const active = this.downloadProgress.get(spec.id) || null;
    return {
      id: spec.id,
      role: spec.role,
      tier: spec.tier,
      label: spec.label,
      file: spec.file,
      license: spec.license,
      expectedBytes: spec.bytes,
      expectedSha256: spec.sha256,
      present,
      verified:
        present &&
        actualBytes === spec.bytes &&
        Boolean(manifest && manifest.sha256 === spec.sha256),
      bytes: actualBytes,
      partialBytes,
      downloading: this.activeControllers.has(spec.id),
      progress: active,
      modelPath: present ? full : null,
      manifest,
    };
  }

  listModelsStatus() {
    return MODEL_CATALOG.map((m) => this.getModelStatus(m.id));
  }

  getInstalledDiskUsageBytes() {
    let total = 0;
    try {
      if (!fs.existsSync(this.modelsDir)) return 0;
      for (const entry of fs.readdirSync(this.modelsDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        total += fs.statSync(path.join(this.modelsDir, entry.name)).size;
      }
    } catch {
      return total;
    }
    return total;
  }

  async verifyModel(modelId, customSpec = null) {
    const spec = this.resolveModelSpec(modelId, customSpec);
    const full = path.join(this.modelsDir, spec.file);
    if (!fs.existsSync(full)) return { ok: false, code: 'MODEL_MISSING' };
    const size = fs.statSync(full).size;
    if (size !== spec.bytes) {
      return { ok: false, code: 'SIZE_MISMATCH', expectedBytes: spec.bytes, actualBytes: size };
    }
    const sha256 = await computeFileSha256(full);
    if (sha256.toLowerCase() !== spec.sha256.toLowerCase()) {
      return {
        ok: false,
        code: 'SHA256_MISMATCH',
        expectedSha256: spec.sha256,
        actualSha256: sha256,
      };
    }
    return { ok: true, bytes: size, sha256 };
  }

  cancelDownload(modelId, { cleanPart = false } = {}) {
    const ctrl = this.activeControllers.get(modelId);
    if (cleanPart) {
      this.pendingCleanParts.add(modelId);
    }
    if (ctrl) {
      ctrl.abort();
      this.activeControllers.delete(modelId);
    }
    this.downloadProgress.delete(modelId);
    if (cleanPart && MODELS_BY_ID[modelId] && !this.activePromises.has(modelId)) {
      try {
        fs.rmSync(this.getPartPath(modelId), { force: true, maxRetries: 4, retryDelay: 40 });
      } catch {
        // Ignore cleanup failure
      }
      this.pendingCleanParts.delete(modelId);
    }
    return { ok: true, modelId, cancelled: Boolean(ctrl) };
  }

  /**
   * @param {string} modelId
   * @param {any} [customSpec]
   */
  deleteModel(modelId, customSpec = null) {
    this.cancelDownload(modelId, { cleanPart: true });
    const spec = this.resolveModelSpec(modelId, customSpec);
    const full = path.join(this.modelsDir, spec.file);
    const part = `${full}.part`;
    const manifest = `${full}.manifest.json`;
    this._manifestCache.delete(manifest);
    let removed = false;
    for (const target of [full, part, manifest]) {
      try {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { force: true, maxRetries: 5, retryDelay: 50 });
          removed = true;
        }
      } catch {
        // If .part is still closing asynchronously, finally block cleans it via pendingCleanParts
      }
    }
    return { ok: true, modelId: spec.id, removed };
  }

  deleteAllModels() {
    this._manifestCache.clear();
    for (const activeId of Array.from(this.activeControllers.keys())) {
      this.cancelDownload(activeId, { cleanPart: true });
    }
    let removedFiles = 0;
    try {
      if (fs.existsSync(this.modelsDir)) {
        for (const entry of fs.readdirSync(this.modelsDir, { withFileTypes: true })) {
          const target = path.join(this.modelsDir, entry.name);
          try {
            fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
            removedFiles += 1;
          } catch {
            // Active stream .part cleaned up in downloadModel finally
          }
        }
      }
    } catch {
      // Ignore cleanup failure
    }
    return { ok: true, removedFiles };
  }

  async downloadModel(modelId, options = {}) {
    const customSpec = options.customSpec || null;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    let spec;
    try {
      spec = this.resolveModelSpec(modelId, customSpec);
    } catch (err) {
      return {
        ok: false,
        code: String(err?.message || '').startsWith('DISALLOWED_LICENSE')
          ? 'DISALLOWED_LICENSE'
          : 'UNKNOWN_MODEL',
        error: 'Invalid or unsupported model specification.',
      };
    }

    if (this.activeControllers.has(spec.id) || this.activePromises.has(spec.id)) {
      return { ok: false, code: 'ALREADY_DOWNLOADING', error: 'Download already in progress.' };
    }

    const runPromise = this._downloadModelInternal(spec, customSpec, options, onProgress);
    this.activePromises.set(spec.id, runPromise);
    try {
      return await runPromise;
    } finally {
      this.activePromises.delete(spec.id);
    }
  }

  async _downloadModelInternal(spec, customSpec, options, onProgress) {
    this.ensureDir();
    const fullPath = path.join(this.modelsDir, spec.file);
    const partPath = `${fullPath}.part`;
    const manifestPath = `${fullPath}.manifest.json`;

    // Already downloaded and verified?
    if (fs.existsSync(fullPath)) {
      const check = await this.verifyModel(spec.id, customSpec);
      if (check.ok) {
        return {
          ok: true,
          modelId: spec.id,
          modelPath: fullPath,
          bytes: check.bytes,
          sha256: check.sha256,
          resumed: false,
          alreadyPresent: true,
        };
      }
      fs.rmSync(fullPath, { force: true });
    }

    // Strict 2x bytes free disk check before initiating download (WBS-2.1 / R-04)
    const freeBytes = getDiskFreeBytes(this.modelsDir, this.statfsFn);
    const requiredBytes = spec.bytes * 2;
    if (freeBytes !== null && freeBytes < requiredBytes) {
      return {
        ok: false,
        code: 'INSUFFICIENT_DISK_SPACE',
        requiredBytes,
        freeBytes,
        error: `Insufficient disk space: requires ${Math.ceil(requiredBytes / 1048576)} MB free, found ${Math.floor(freeBytes / 1048576)} MB.`,
      };
    }

    const externalSignal = options.signal || null;
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        return { ok: false, code: 'CANCELLED', error: 'Download cancelled.' };
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    this.activeControllers.set(spec.id, controller);
    let downloadOk = false;

    try {
      let startAt = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;
      if (startAt > spec.bytes) {
        fs.rmSync(partPath, { force: true });
        startAt = 0;
      }

      // If .part already matches exact target bytes, jump directly to SHA-256 verification!
      if (startAt === spec.bytes && startAt > 0) {
        const finalRes = await this._finalizeVerifiedPart(
          spec,
          partPath,
          fullPath,
          manifestPath,
          true,
        );
        downloadOk = Boolean(finalRes?.ok);
        return finalRes;
      }

      const headers = {};
      if (startAt > 0) {
        headers.Range = `bytes=${startAt}-`;
      }

      let res;
      try {
        res = await this.fetchFn(spec.url, {
          method: 'GET',
          headers,
          signal: controller.signal,
          redirect: 'follow',
        });
      } catch (err) {
        if (controller.signal.aborted) {
          return { ok: false, code: 'CANCELLED', error: 'Download cancelled.' };
        }
        modelLog().error({ modelId: spec.id, err }, 'Model download fetch failed');
        return {
          ok: false,
          code: 'NETWORK_ERROR',
          error: 'Network connection failed while downloading model.',
        };
      }

      if (res.status === 416) {
        const rangeInfo = parseContentRangeTotal(res, startAt);
        if (startAt === spec.bytes && rangeInfo.total === spec.bytes) {
          const finalRes = await this._finalizeVerifiedPart(
            spec,
            partPath,
            fullPath,
            manifestPath,
            true,
          );
          downloadOk = Boolean(finalRes?.ok);
          return finalRes;
        }
        fs.rmSync(partPath, { force: true, maxRetries: 4, retryDelay: 40 });
        startAt = 0;
        try {
          res = await this.fetchFn(spec.url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
          });
        } catch (err) {
          if (controller.signal.aborted) {
            return { ok: false, code: 'CANCELLED', error: 'Download cancelled.' };
          }
          modelLog().error({ modelId: spec.id, err }, 'Model download 416 retry fetch failed');
          return {
            ok: false,
            code: 'NETWORK_ERROR',
            error: 'Network connection failed while restarting download.',
          };
        }
      }

      let resumed = false;
      if (res.status === 206 && startAt > 0) {
        const rangeInfo = parseContentRangeTotal(res, startAt);
        if (rangeInfo.start !== startAt) {
          fs.rmSync(partPath, { force: true });
          return {
            ok: false,
            code: 'RANGE_MISMATCH',
            error: 'Server returned mismatched byte range.',
          };
        }
        resumed = true;
      } else if (res.status === 200) {
        if (startAt > 0) {
          fs.rmSync(partPath, { force: true });
          startAt = 0;
        }
      } else {
        return {
          ok: false,
          code: 'HTTP_ERROR',
          status: res.status,
          error: `Server returned HTTP ${res.status}.`,
        };
      }

      if (!res.body) {
        return { ok: false, code: 'EMPTY_BODY', error: 'Download response has empty body.' };
      }

      const out = fs.createWriteStream(partPath, { flags: resumed ? 'a' : 'w' });
      let writeErr = null;
      out.on('error', (e) => {
        writeErr = e;
      });

      let receivedBytes = startAt;
      let lastEmittedPct = -1;
      const reader = res.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) {
            throw Object.assign(new Error('Download cancelled.'), { name: 'AbortError' });
          }
          if (value && value.byteLength > 0) {
            const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            receivedBytes += buf.length;
            if (spec.bytes > 0 && receivedBytes > spec.bytes) {
              throw Object.assign(new Error('Downloaded model stream exceeded expected size.'), {
                code: 'SIZE_EXCEEDED',
              });
            }
            await writeChunkSafe(out, buf, () => writeErr);
            if (writeErr) throw writeErr;
            const percent = Math.min(100, Math.round((receivedBytes / spec.bytes) * 100));
            const prog = {
              modelId: spec.id,
              receivedBytes,
              totalBytes: spec.bytes,
              percent,
              resumed,
            };
            this.downloadProgress.set(spec.id, prog);
            if (onProgress) onProgress(prog);
            if (this.onProgressEvent && percent !== lastEmittedPct) {
              lastEmittedPct = percent;
              this.onProgressEvent(prog);
            }
          }
        }
      } catch (err) {
        try {
          await reader.cancel();
        } catch {
          // Ignore cancel error
        }
        await new Promise(
          /** @param {(v?: void) => void} resolve */ (resolve) => {
            out.once('close', () => resolve());
            out.end(() => resolve());
          },
        );
        if (controller.signal.aborted || err?.name === 'AbortError') {
          return {
            ok: false,
            code: 'CANCELLED',
            receivedBytes,
            totalBytes: spec.bytes,
            error: 'Download cancelled.',
          };
        }
        if (err?.code === 'SIZE_EXCEEDED') {
          try {
            fs.rmSync(partPath, { force: true });
          } catch {
            // Ignore cleanup failure
          }
          return {
            ok: false,
            code: 'SIZE_EXCEEDED',
            receivedBytes,
            totalBytes: spec.bytes,
            error: 'Download exceeded expected file size.',
          };
        }
        modelLog().error({ modelId: spec.id, err }, 'Model download stream failed');
        return {
          ok: false,
          code: writeErr ? 'DISK_WRITE_ERROR' : 'STREAM_ERROR',
          error: writeErr
            ? 'Disk write failed during model download.'
            : 'Download stream was interrupted.',
        };
      }

      await new Promise(
        /** @param {(v?: void) => void} resolve */ (resolve, reject) => {
          out.end((err) => (err ? reject(err) : resolve()));
        },
      );
      if (writeErr) {
        modelLog().error({ modelId: spec.id, err: writeErr }, 'Model download disk write failed');
        return {
          ok: false,
          code: 'DISK_WRITE_ERROR',
          error: 'Disk write failed during model download.',
        };
      }

      const finalRes = await this._finalizeVerifiedPart(
        spec,
        partPath,
        fullPath,
        manifestPath,
        resumed,
      );
      downloadOk = Boolean(finalRes?.ok);
      return finalRes;
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
      this.activeControllers.delete(spec.id);
      this.downloadProgress.delete(spec.id);
      if (this.pendingCleanParts.has(spec.id)) {
        this.pendingCleanParts.delete(spec.id);
        try {
          fs.rmSync(partPath, { force: true, maxRetries: 5, retryDelay: 50 });
        } catch {
          // Ignore delayed cleanup failure
        }
      }
      if (this.onProgressEvent) {
        this.onProgressEvent({ modelId: spec.id, done: true, ok: downloadOk });
      }
    }
  }

  async _finalizeVerifiedPart(spec, partPath, fullPath, manifestPath, resumed) {
    const actualSize = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;
    if (actualSize !== spec.bytes) {
      fs.rmSync(partPath, { force: true, maxRetries: 4, retryDelay: 40 });
      return {
        ok: false,
        code: 'SIZE_MISMATCH',
        expectedBytes: spec.bytes,
        actualBytes: actualSize,
        error: `Downloaded size mismatch (expected ${spec.bytes}, got ${actualSize}).`,
      };
    }

    const actualSha256 = await computeFileSha256(partPath);
    if (actualSha256.toLowerCase() !== spec.sha256.toLowerCase()) {
      // Fail-closed: immediately remove corrupted .part file so it can never be loaded
      fs.rmSync(partPath, { force: true, maxRetries: 4, retryDelay: 40 });
      return {
        ok: false,
        code: 'SHA256_MISMATCH',
        expectedSha256: spec.sha256,
        actualSha256,
        error: 'Downloaded model failed SHA-256 verification and was deleted.',
      };
    }

    await renameWithRetry(partPath, fullPath);
    const manifest = {
      modelId: spec.id,
      file: spec.file,
      role: spec.role,
      license: spec.license,
      commit: spec.commit,
      bytes: actualSize,
      sha256: actualSha256.toLowerCase(),
      downloadedAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    try {
      const st = fs.statSync(manifestPath);
      this._manifestCache.set(manifestPath, { mtimeMs: st.mtimeMs, size: st.size, data: manifest });
    } catch {
      this._manifestCache.delete(manifestPath);
    }

    return {
      ok: true,
      modelId: spec.id,
      modelPath: fullPath,
      bytes: actualSize,
      sha256: actualSha256.toLowerCase(),
      resumed,
    };
  }
}

module.exports = {
  ModelManager,
  computeFileSha256,
  parseContentRangeTotal,
  writeChunkSafe,
  renameWithRetry,
};
