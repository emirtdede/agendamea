'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pino = require('pino');

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_ROTATED_FILES = 3;
const ROTATION_CHECK_INTERVAL_MS = 10_000;

const REDACT_PATHS = [
  'secret',
  'webhookSecret',
  'webhookIncomingSecret',
  'authorization',
  'token',
  'apiKey',
  'password',
  '*.secret',
  '*.webhookSecret',
  '*.webhookIncomingSecret',
  '*.authorization',
  '*.token',
  '*.apiKey',
  '*.password',
  'req.headers.authorization',
  'req.headers["x-agendamea-secret"]',
  'headers.authorization',
  'headers["x-agendamea-secret"]',
];

/**
 * Strips OS user profile directories and inline bearer/webhook secrets from strings.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeTextForLog(value) {
  let str = typeof value === 'string' ? value : String(value ?? '');
  str = str.replace(/[A-Za-z]:\\Users\\[^\\/:*?"<>|\r\n]+/gi, (match) => {
    const drive = match.slice(0, 2);
    return `${drive}\\Users\\<REDACTED>`;
  });
  str = str.replace(/\/(?:Users|home)\/[^/\s:'"]+/g, '/<USER>/<REDACTED>');
  str = str.replace(/whsec_[A-Za-z0-9+/=_-]+/g, 'whsec_[REDACTED]');
  str = str.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  return str;
}

/**
 * Resolves the default local logs directory without mutating anything outside Agendamea dataDir.
 * @param {string} [explicitDataDir]
 * @returns {string}
 */
function resolveLogDir(explicitDataDir) {
  if (explicitDataDir && typeof explicitDataDir === 'string') {
    return path.join(path.resolve(explicitDataDir), 'logs');
  }
  if (process.env.AGENDAMEA_DATA_DIR) {
    return path.join(path.resolve(process.env.AGENDAMEA_DATA_DIR), 'logs');
  }
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Agendamea', 'logs');
}

/**
 * Rotates `<base>.log` -> `<base>.1.log` .. `<base>.3.log` safely on Windows NTFS.
 * Caller MUST close active file handles before invoking this function.
 * @param {string} filePath
 */
function rotateLogFileSync(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_LOG_BYTES) return;
    const ext = path.extname(filePath) || '.log';
    const base = filePath.slice(0, filePath.length - ext.length);
    for (let i = MAX_ROTATED_FILES; i >= 1; i -= 1) {
      const dst = `${base}.${i}${ext}`;
      const src = i === 1 ? filePath : `${base}.${i - 1}${ext}`;
      if (i === MAX_ROTATED_FILES && fs.existsSync(dst)) {
        try {
          fs.rmSync(dst, { force: true });
        } catch {
          // Windows handle still draining; skip rotation this cycle
        }
      }
      if (fs.existsSync(src)) {
        try {
          fs.renameSync(src, dst);
        } catch {
          // Concurrent process or AV scanner lock; keep writing cleanly without crashing
        }
      }
    }
  } catch {
    // Non-fatal rotation guard
  }
}

/**
 * Creates a Windows-safe non-worker Pino file destination with size rotation.
 * Avoids `pino.transport()` worker threads so Electron app.asar & esbuild single-file bundles stay rock solid.
 * @param {string} filePath
 */
function createRotatingDestination(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  rotateLogFileSync(filePath);
  let dest = pino.destination({ dest: filePath, sync: true, mkdir: true });
  let lastCheckAt = Date.now();

  const maybeRotate = () => {
    const now = Date.now();
    if (now - lastCheckAt < ROTATION_CHECK_INTERVAL_MS) return;
    lastCheckAt = now;
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.size < MAX_LOG_BYTES) return;
      if (typeof dest.flushSync === 'function') dest.flushSync();
      if (typeof dest.end === 'function') dest.end();
      rotateLogFileSync(filePath);
      dest = pino.destination({ dest: filePath, sync: true, mkdir: true });
    } catch {
      // Keep existing destination active if rotation could not acquire NTFS lock
    }
  };

  return {
    write(chunk) {
      maybeRotate();
      try {
        dest.write(sanitizeTextForLog(chunk));
      } catch {
        // Never allow log disk failure to crash the desktop app
      }
    },
    flushSync() {
      try {
        if (typeof dest.flushSync === 'function') dest.flushSync();
      } catch {
        // Ignore already-closed stream
      }
    },
    close() {
      try {
        if (typeof dest.flushSync === 'function') dest.flushSync();
        if (typeof dest.end === 'function') dest.end();
      } catch {
        // Ignore already-closed stream
      }
    },
  };
}

/**
 * Formats an Error object with redacted user paths for structured NDJSON logs.
 * @param {unknown} err
 */
function serializeSafeError(err) {
  if (err instanceof Error) {
    /** @type {Record<string, unknown>} */
    const out = {
      type: err.name || 'Error',
      message: sanitizeTextForLog(err.message),
      stack: err.stack ? sanitizeTextForLog(err.stack).slice(0, 4000) : undefined,
    };
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (typeof code === 'string') out.code = code;
    return out;
  }
  return { message: sanitizeTextForLog(err) };
}

/** @type {Map<string, { logger: import('pino').Logger, dest: { flushSync: () => void, close: () => void } | null }>} */
const LOGGER_CACHE = new Map();

/**
 * Creates or returns a structured Pino NDJSON logger scoped to a single process file (`main.log`, `server.log`, etc.).
 * @param {{ processName?: string, dataDir?: string, level?: string, disableFile?: boolean }} [options]
 */
function createAppLogger(options = {}) {
  const processName = String(options.processName || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const level =
    options.level ||
    process.env.AGENDAMEA_LOG_LEVEL ||
    (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

  const logDir = resolveLogDir(options.dataDir);
  const filePath = path.join(logDir, `${processName || 'app'}.log`);

  let destination = null;
  /** @type {import('pino').DestinationStream} */
  let stream = process.stderr;
  if (!options.disableFile && level !== 'silent') {
    try {
      destination = createRotatingDestination(filePath);
      stream = destination;
    } catch {
      destination = null;
      stream = process.stderr;
    }
  }

  const logger = pino(
    {
      name: `agendamea:${processName || 'app'}`,
      level,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      serializers: {
        err: serializeSafeError,
        error: serializeSafeError,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        pid: process.pid,
        component: processName || 'app',
      },
    },
    stream,
  );

  return {
    logger,
    logFilePath: filePath,
    flushSync: () => destination?.flushSync(),
    close: () => destination?.close(),
  };
}

/**
 * Returns a cached per-process singleton logger.
 * @param {string} [processName]
 * @param {string} [dataDir]
 */
function getAppLogger(processName = 'server', dataDir) {
  const key = `${processName}:${dataDir || process.env.AGENDAMEA_DATA_DIR || 'default'}`;
  const existing = LOGGER_CACHE.get(key);
  if (existing) return existing.logger;
  const created = createAppLogger({ processName, dataDir });
  LOGGER_CACHE.set(key, {
    logger: created.logger,
    dest: { flushSync: created.flushSync, close: created.close },
  });
  return created.logger;
}

function flushAllLoggers() {
  for (const entry of LOGGER_CACHE.values()) {
    try {
      entry.dest?.flushSync();
    } catch {
      // Ignore flush error on exit
    }
  }
}

function closeAllLoggers() {
  for (const entry of LOGGER_CACHE.values()) {
    try {
      entry.dest?.close();
    } catch {
      // Ignore close error on exit
    }
  }
  LOGGER_CACHE.clear();
}

module.exports = {
  MAX_LOG_BYTES,
  MAX_ROTATED_FILES,
  REDACT_PATHS,
  sanitizeTextForLog,
  resolveLogDir,
  serializeSafeError,
  createAppLogger,
  getAppLogger,
  flushAllLoggers,
  closeAllLoggers,
};
