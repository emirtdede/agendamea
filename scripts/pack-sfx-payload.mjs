import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);

// Already-compressed media/archive formats skip Brotli for zero wasted CPU
const SKIP_COMPRESS_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.woff2',
  '.gz',
  '.br',
  '.zip',
  '.7z',
]);

// .NET ticks epoch: 0001-01-01T00:00:00Z -> Unix epoch 1970-01-01T00:00:00Z
const DOTNET_EPOCH_TICKS = 621355968000000000n;

if (!isMainThread && parentPort) {
  const { files, quality } = workerData;
  const results = [];
  for (const item of files) {
    const raw = fs.readFileSync(item.absPath);
    const ext = path.extname(item.relPath).toLowerCase();
    let payload = raw;
    let flags = 0;
    if (raw.length >= 128 && !SKIP_COMPRESS_EXTS.has(ext)) {
      const compressed = zlib.brotliCompressSync(raw, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      });
      if (compressed.length < raw.length) {
        payload = compressed;
        flags = 1;
      }
    }
    results.push({
      relPath: item.relPath,
      rawLen: raw.length,
      compLen: payload.length,
      mtimeTicks: item.mtimeTicks,
      flags,
      payload,
    });
  }
  parentPort.postMessage(results);
}

function collectFiles(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
      } else if (entry.isFile()) {
        const st = fs.statSync(absPath);
        const relPath = path.relative(rootDir, absPath).split(path.sep).join('/');
        const mtimeTicks = DOTNET_EPOCH_TICKS + BigInt(Math.round(st.mtimeMs)) * 10000n;
        files.push({ absPath, relPath, size: st.size, mtimeTicks });
      }
    }
  };
  walk(rootDir);
  return files;
}

/**
 * Builds an AGM_SFX2 single-file executable:
 * [Stub EXE][Parallel Brotli Entry Data][Binary TOC][32-byte AGM_SFX2 Trailer]
 *
 * Uses Node.js worker_threads for fast multi-core compression and produces a format
 * that Agendamea.Portable (NativeAOT) and Agendamea.Setup (WPF) extract across up to 8 cores.
 */
export async function buildSfxV2Bundle({ stubExePath, sourceDir, outputExePath, quality = 8 }) {
  const startedAt = Date.now();
  const files = collectFiles(sourceDir);
  // Distribute largest files evenly across workers (round-robin after descending size sort)
  files.sort((a, b) => b.size - a.size);

  const cpuCount = Math.max(2, Math.min(os.cpus()?.length || 4, 8));
  const buckets = Array.from({ length: cpuCount }, () => []);
  for (let idx = 0; idx < files.length; idx += 1) {
    buckets[idx % cpuCount].push(files[idx]);
  }

  const workerOutputs = await Promise.all(
    buckets
      .filter((b) => b.length > 0)
      .map(
        (bucket) =>
          new Promise((resolve, reject) => {
            const w = new Worker(__filename, {
              workerData: { files: bucket, quality },
            });
            w.once('message', resolve);
            w.once('error', reject);
            w.once('exit', (code) => {
              if (code !== 0) reject(new Error(`SFX pack worker exited with code ${code}`));
            });
          }),
      ),
  );

  const packed = workerOutputs.flat();
  fs.mkdirSync(path.dirname(outputExePath), { recursive: true });
  const outFd = fs.openSync(outputExePath, 'w');
  let cursor = 0n;
  let totalRawBytes = 0;
  let totalCompBytes = 0;

  try {
    // 1. Copy stub executable prefix
    const stubFd = fs.openSync(stubExePath, 'r');
    const copyBuf = Buffer.allocUnsafe(1024 * 1024);
    try {
      let bytesRead = fs.readSync(stubFd, copyBuf, 0, copyBuf.length, null);
      while (bytesRead > 0) {
        fs.writeSync(outFd, copyBuf, 0, bytesRead);
        cursor += BigInt(bytesRead);
        bytesRead = fs.readSync(stubFd, copyBuf, 0, copyBuf.length, null);
      }
    } finally {
      fs.closeSync(stubFd);
    }

    const payloadOffset = cursor;
    const tocRecords = [];

    // 2. Stream compressed/raw entry payloads
    for (const item of packed) {
      const dataOffset = cursor - payloadOffset;
      const buf = Buffer.isBuffer(item.payload)
        ? item.payload
        : Buffer.from(item.payload.buffer, item.payload.byteOffset, item.payload.byteLength);
      if (buf.length > 0) {
        fs.writeSync(outFd, buf, 0, buf.length);
        cursor += BigInt(buf.length);
      }
      totalRawBytes += item.rawLen;
      totalCompBytes += item.compLen;
      tocRecords.push({
        relPath: item.relPath,
        dataOffset,
        compLen: BigInt(item.compLen),
        rawLen: BigInt(item.rawLen),
        mtimeTicks: BigInt(item.mtimeTicks),
        flags: item.flags,
      });
    }

    // 3. Serialize binary TOC
    const tocOffset = cursor;
    const tocParts = [];
    const countBuf = Buffer.alloc(4);
    countBuf.writeInt32LE(tocRecords.length, 0);
    tocParts.push(countBuf);

    for (const rec of tocRecords) {
      const pathBuf = Buffer.from(rec.relPath, 'utf8');
      const header = Buffer.alloc(2);
      header.writeUInt16LE(pathBuf.length, 0);
      const meta = Buffer.alloc(33);
      meta.writeBigInt64LE(rec.dataOffset, 0);
      meta.writeBigInt64LE(rec.compLen, 8);
      meta.writeBigInt64LE(rec.rawLen, 16);
      meta.writeBigInt64LE(rec.mtimeTicks, 24);
      meta.writeUInt8(rec.flags, 32);
      tocParts.push(header, pathBuf, meta);
    }

    const tocBuf = Buffer.concat(tocParts);
    fs.writeSync(outFd, tocBuf, 0, tocBuf.length);
    cursor += BigInt(tocBuf.length);

    const payloadLength = cursor - payloadOffset;

    // 4. Write 32-byte AGM_SFX2 trailer
    const footer = Buffer.alloc(32);
    footer.write('AGM_SFX2', 0, 8, 'ascii');
    footer.writeBigInt64LE(payloadOffset, 8);
    footer.writeBigInt64LE(payloadLength, 16);
    footer.writeBigInt64LE(tocOffset, 24);
    fs.writeSync(outFd, footer, 0, footer.length);

    return {
      fileCount: tocRecords.length,
      rawBytes: totalRawBytes,
      compressedBytes: totalCompBytes,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    fs.closeSync(outFd);
  }
}
