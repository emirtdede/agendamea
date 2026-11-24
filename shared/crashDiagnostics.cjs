'use strict';

const fs = require('node:fs');
const path = require('node:path');
const versionMod = require('./version.cjs');
const { resolveLogDir, sanitizeTextForLog } = require('./logger.cjs');

const MAX_CRASH_REPORTS = 10;
const MAX_STACK_LENGTH = 6000;
const SENSITIVE_KEY_RE = /(secret|token|authorization|password|apikey|cookie)/i;

/**
 * Deeply clones and redacts any sensitive fields or OS user home paths from crash context.
 * @param {unknown} input
 * @param {number} [depth]
 * @returns {unknown}
 */
function sanitizeCrashValue(input, depth = 0) {
  if (depth > 5) return '[MAX_DEPTH]';
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return sanitizeTextForLog(input).slice(0, MAX_STACK_LENGTH);
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((item) => sanitizeCrashValue(item, depth + 1));
  }
  if (typeof input === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizeCrashValue(v, depth + 1);
      }
    }
    return out;
  }
  return sanitizeTextForLog(input);
}

/**
 * Prunes older crash reports so `<dataDir>/logs/crash-*.json` never exceeds MAX_CRASH_REPORTS.
 * @param {string} logDir
 */
function pruneOldCrashReports(logDir) {
  try {
    if (!fs.existsSync(logDir)) return;
    const files = fs
      .readdirSync(logDir)
      .filter((name) => name.startsWith('crash-') && name.endsWith('.json'))
      .sort();
    while (files.length > MAX_CRASH_REPORTS) {
      const oldest = files.shift();
      if (!oldest) break;
      try {
        fs.rmSync(path.join(logDir, oldest), { force: true });
      } catch {
        // Ignore transient NTFS lock
      }
    }
  } catch {
    // Non-fatal cleanup
  }
}

/**
 * Persists a strictly local, redacted JSON crash diagnostic file under `<dataDir>/logs/crash-*.json`.
 * Never transmits data over any network.
 * @param {{
 *   source: string,
 *   error?: unknown,
 *   message?: string,
 *   stack?: string,
 *   componentStack?: string,
 *   context?: Record<string, unknown>,
 *   dataDir?: string,
 * }} options
 * @returns {{ ok: boolean, filePath: string | null, report: Record<string, unknown> }}
 */
function writeCrashReport(options) {
  const source = sanitizeTextForLog(options?.source || 'unknown').slice(0, 64);
  const errObj = options?.error;
  const errName =
    errObj instanceof Error
      ? errObj.name
      : errObj && typeof errObj === 'object' && 'name' in errObj
        ? String(/** @type {any} */ (errObj).name)
        : 'Error';
  const rawMessage =
    options?.message ??
    (errObj instanceof Error
      ? errObj.message
      : errObj !== undefined
        ? String(errObj)
        : 'Unknown error');
  const rawStack =
    options?.stack ??
    (errObj instanceof Error && typeof errObj.stack === 'string' ? errObj.stack : '');

  const now = new Date();
  const report = {
    schemaVersion: 1,
    app: 'Agendamea',
    appVersion: versionMod.APP_VERSION,
    timestamp: now.toISOString(),
    source,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    pid: process.pid,
    error: {
      name: sanitizeTextForLog(errName).slice(0, 128),
      message: sanitizeTextForLog(rawMessage).slice(0, 1000),
      stack: sanitizeTextForLog(rawStack).slice(0, MAX_STACK_LENGTH),
    },
    componentStack: options?.componentStack
      ? sanitizeTextForLog(options.componentStack).slice(0, MAX_STACK_LENGTH)
      : undefined,
    context: options?.context ? sanitizeCrashValue(options.context) : undefined,
  };

  try {
    const logDir = resolveLogDir(options?.dataDir);
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `crash-${stamp}-${process.pid}.json`;
    const filePath = path.join(logDir, fileName);
    fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    pruneOldCrashReports(logDir);
    return { ok: true, filePath, report };
  } catch {
    return { ok: false, filePath: null, report };
  }
}

/**
 * Lists up to MAX_CRASH_REPORTS most recent local crash report filenames & metadata.
 * @param {string} [dataDir]
 */
function listCrashReports(dataDir) {
  const logDir = resolveLogDir(dataDir);
  if (!fs.existsSync(logDir)) return [];
  try {
    return fs
      .readdirSync(logDir)
      .filter((name) => name.startsWith('crash-') && name.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, MAX_CRASH_REPORTS)
      .map((fileName) => {
        const fullPath = path.join(logDir, fileName);
        const stat = fs.statSync(fullPath);
        return {
          fileName,
          bytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      });
  } catch {
    return [];
  }
}

module.exports = {
  MAX_CRASH_REPORTS,
  sanitizeCrashValue,
  writeCrashReport,
  listCrashReports,
};
