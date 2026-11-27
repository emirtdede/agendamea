'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_ROTATED_FILES = 3;
const ROTATION_CHECK_INTERVAL_MS = 10_000;
const ASYNC_BUFFER_FLUSH_BYTES = 4096;
const ASYNC_FLUSH_INTERVAL_MS = 250;

const LEVEL_VALUES = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

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

const REDACT_KEYS = new Set([
  'secret',
  'webhooksecret',
  'webhookincomingsecret',
  'authorization',
  'token',
  'apikey',
  'password',
  'x-agendamea-secret',
]);

/**
 * Strips OS user profile directories and inline bearer/webhook secrets from strings.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeTextForLog(value) {
  let str = typeof value === 'string' ? value : String(value ?? '');
  if (
    str.indexOf('\\Users\\') !== -1 ||
    str.indexOf('\\users\\') !== -1 ||
    str.indexOf('/Users/') !== -1 ||
    str.indexOf('/home/') !== -1 ||
    str.indexOf('whsec_') !== -1 ||
    str.indexOf('Bearer ') !== -1 ||
    str.indexOf('bearer ') !== -1
  ) {
    str = str.replace(/[A-Za-z]:\\Users\\[^\\/:*?"<>|\r\n]+/gi, (match) => {
      const drive = match.slice(0, 2);
      return `${drive}\\Users\\<REDACTED>`;
    });
    str = str.replace(/\/(?:Users|home)\/[^/\s:'"]+/g, '/<USER>/<REDACTED>');
    str = str.replace(/whsec_[A-Za-z0-9+/=_-]+/g, 'whsec_[REDACTED]');
    str = str.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  }
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

/**
 * Redacts sensitive keys up to depth 3 without mutating caller objects.
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
function redactValue(value, depth = 0) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Error) {
    return serializeSafeError(value);
  }
  if (depth >= 3) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
    const lower = k.toLowerCase();
    if (REDACT_KEYS.has(lower)) {
      out[k] = '[REDACTED]';
    } else if ((lower === 'err' || lower === 'error') && v !== undefined && v !== null) {
      out[k] = serializeSafeError(v);
    } else if (v && typeof v === 'object') {
      out[k] = redactValue(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Zero-dependency buffered async rotating file destination (safe on Windows NTFS).
 * Accumulates log chunks in memory and flushes asynchronously to avoid blocking the event loop.
 * @param {string} filePath
 */
function createRotatingDestination(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  rotateLogFileSync(filePath);

  let buffer = '';
  let bufferedBytes = 0;
  let lastCheckAt = Date.now();
  let flushingAsync = false;
  let closed = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let flushTimer = null;

  const maybeRotate = () => {
    const now = Date.now();
    if (now - lastCheckAt < ROTATION_CHECK_INTERVAL_MS) return;
    lastCheckAt = now;
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.size >= MAX_LOG_BYTES) {
        rotateLogFileSync(filePath);
      }
    } catch {
      // Non-fatal rotation guard
    }
  };

  const clearTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flushAsync = () => {
    clearTimer();
    if (closed || flushingAsync || bufferedBytes === 0) return;
    const payload = buffer;
    buffer = '';
    bufferedBytes = 0;
    flushingAsync = true;
    maybeRotate();
    fs.appendFile(filePath, payload, 'utf8', () => {
      flushingAsync = false;
      if (!closed && bufferedBytes > 0) {
        if (bufferedBytes >= ASYNC_BUFFER_FLUSH_BYTES) {
          flushAsync();
        } else {
          scheduleFlush();
        }
      }
    });
  };

  const scheduleFlush = () => {
    if (closed || flushTimer || bufferedBytes === 0) return;
    flushTimer = setTimeout(flushAsync, ASYNC_FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
  };

  const flushSync = () => {
    clearTimer();
    if (bufferedBytes === 0) return;
    const payload = buffer;
    buffer = '';
    bufferedBytes = 0;
    maybeRotate();
    try {
      fs.appendFileSync(filePath, payload, 'utf8');
    } catch {
      // Never allow log disk failure to crash the desktop app
    }
  };

  return {
    write(chunk, immediate = false) {
      if (closed) return;
      const safe = sanitizeTextForLog(chunk);
      buffer += safe;
      bufferedBytes += Buffer.byteLength(safe, 'utf8');
      if (immediate) {
        flushSync();
      } else if (bufferedBytes >= ASYNC_BUFFER_FLUSH_BYTES) {
        flushAsync();
      } else {
        scheduleFlush();
      }
    },
    flushSync,
    close() {
      if (closed) return;
      flushSync();
      closed = true;
      clearTimer();
    },
  };
}

/**
 * Safely serializes an NDJSON log record, tolerating circular references.
 * @param {Record<string, unknown>} record
 * @returns {string}
 */
function safeJsonLine(record) {
  try {
    return `${JSON.stringify(record)}\n`;
  } catch {
    const seen = new WeakSet();
    return `${JSON.stringify(record, (_k, val) => {
      if (typeof val === 'bigint') return String(val);
      if (val && typeof val === 'object') {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    })}\n`;
  }
}

/**
 * @typedef {{
 *   level: string;
 *   trace: (objOrMsg?: unknown, msg?: string) => void;
 *   debug: (objOrMsg?: unknown, msg?: string) => void;
 *   info: (objOrMsg?: unknown, msg?: string) => void;
 *   warn: (objOrMsg?: unknown, msg?: string) => void;
 *   error: (objOrMsg?: unknown, msg?: string) => void;
 *   fatal: (objOrMsg?: unknown, msg?: string) => void;
 *   child: (bindings?: Record<string, unknown>) => AppLoggerInstance;
 * }} AppLoggerInstance
 */

/**
 * Builds a Pino-compatible structured NDJSON logger instance with zero external dependencies.
 * @param {{
 *   level: string;
 *   baseBindings: Record<string, unknown>;
 *   writer: { write: (chunk: string, immediate?: boolean) => void };
 * }} cfg
 * @returns {AppLoggerInstance}
 */
function buildLoggerInstance(cfg) {
  let currentLevel = String(cfg.level || 'info').toLowerCase();
  let threshold =
    LEVEL_VALUES[/** @type {keyof typeof LEVEL_VALUES} */ (currentLevel)] ?? LEVEL_VALUES.info;

  const emit = (lvlNum, objOrMsg, msg) => {
    if (lvlNum < threshold) return;
    /** @type {Record<string, unknown>} */
    const record = {
      level: lvlNum,
      time: new Date().toISOString(),
      ...cfg.baseBindings,
    };

    if (objOrMsg !== undefined && objOrMsg !== null) {
      if (objOrMsg instanceof Error) {
        record.err = serializeSafeError(objOrMsg);
        record.msg = typeof msg === 'string' ? msg : objOrMsg.message;
      } else if (typeof objOrMsg === 'object' && !Array.isArray(objOrMsg)) {
        const redacted = /** @type {Record<string, unknown>} */ (redactValue(objOrMsg, 0));
        Object.assign(record, redacted);
        if (typeof msg === 'string') {
          record.msg = msg;
        }
      } else {
        record.msg = typeof msg === 'string' ? `${String(objOrMsg)} ${msg}` : String(objOrMsg);
      }
    } else if (typeof msg === 'string') {
      record.msg = msg;
    }

    const line = safeJsonLine(record);
    cfg.writer.write(line, lvlNum >= LEVEL_VALUES.error);
  };

  /** @type {AppLoggerInstance} */
  const instance = {
    get level() {
      return currentLevel;
    },
    set level(next) {
      currentLevel = String(next || 'info').toLowerCase();
      threshold =
        LEVEL_VALUES[/** @type {keyof typeof LEVEL_VALUES} */ (currentLevel)] ?? LEVEL_VALUES.info;
    },
    trace: (a, b) => emit(LEVEL_VALUES.trace, a, b),
    debug: (a, b) => emit(LEVEL_VALUES.debug, a, b),
    info: (a, b) => emit(LEVEL_VALUES.info, a, b),
    warn: (a, b) => emit(LEVEL_VALUES.warn, a, b),
    error: (a, b) => emit(LEVEL_VALUES.error, a, b),
    fatal: (a, b) => emit(LEVEL_VALUES.fatal, a, b),
    child(bindings = {}) {
      const safeBindings =
        bindings && typeof bindings === 'object'
          ? /** @type {Record<string, unknown>} */ (redactValue(bindings, 0))
          : {};
      return buildLoggerInstance({
        level: currentLevel,
        baseBindings: { ...cfg.baseBindings, ...safeBindings },
        writer: cfg.writer,
      });
    },
  };

  return instance;
}

/** @type {Map<string, { logger: AppLoggerInstance, dest: { flushSync: () => void, close: () => void } | null }>} */
const LOGGER_CACHE = new Map();

/**
 * Creates or returns a structured NDJSON logger scoped to a single process file (`main.log`, `server.log`, etc.).
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
  let writer = {
    write(chunk) {
      try {
        process.stderr.write(sanitizeTextForLog(chunk));
      } catch {
        // Ignore broken pipe
      }
    },
  };

  if (!options.disableFile && level !== 'silent') {
    try {
      destination = createRotatingDestination(filePath);
      writer = destination;
    } catch {
      destination = null;
    }
  }

  const logger = buildLoggerInstance({
    level,
    baseBindings: {
      pid: process.pid,
      component: processName || 'app',
      name: `agendamea:${processName || 'app'}`,
    },
    writer,
  });

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
