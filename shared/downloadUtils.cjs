'use strict';

/**
 * Shared atomic download & file verification primitives for AI GGUF models and Piper ONNX voice packs.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function writeChunkSafe(stream, buf, getWriteErr) {
  const existingErr = typeof getWriteErr === 'function' ? getWriteErr() : null;
  if (existingErr) throw existingErr;
  if (stream.write(buf)) return;
  await new Promise(
    /** @param {(v?: void) => void} resolve */ (resolve, reject) => {
      const cleanup = () => {
        stream.off('drain', onDrain);
        stream.off('error', onError);
        stream.off('close', onClose);
      };
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        const err = typeof getWriteErr === 'function' ? getWriteErr() : null;
        reject(err || new Error('DISK_STREAM_CLOSED'));
      };
      stream.once('drain', onDrain);
      stream.once('error', onError);
      stream.once('close', onClose);
    },
  );
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

module.exports = {
  computeFileSha256,
  writeChunkSafe,
  renameWithRetry,
};
