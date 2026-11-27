'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const textNormalize = require('../textNormalize.cjs');
const { APP_VERSION } = require('../version.cjs');

// Lazy-loaded heavy modules keep CLI cold start under 150ms for daily task commands
const _lazyCache = Object.create(null);
function loadLazy(key, factory) {
  if (!_lazyCache[key]) _lazyCache[key] = factory();
  return _lazyCache[key];
}

const ABI_FALLBACK_EXIT_CODE = 86;
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayStr() {
  return formatLocalDate(new Date());
}

function getTomorrowStr() {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  return formatLocalDate(dt);
}

function normalizeSearchText(value) {
  return textNormalize.canonicalKey(value);
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value.trim())) return false;
  const [y, m, d] = value.trim().split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

function normalizeDateRange(startDate, dueDate) {
  const s = typeof startDate === 'string' && isValidIsoDate(startDate) ? startDate.trim() : null;
  const d = typeof dueDate === 'string' && isValidIsoDate(dueDate) ? dueDate.trim() : null;
  if (s && d && s > d) return { startDate: d, dueDate: s };
  return { startDate: s, dueDate: d };
}

function sanitizeDueTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return TIME_24H_RE.test(trimmed) ? trimmed : null;
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function sanitizeTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rawTags) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 28);
    if (!clean) continue;
    const key = normalizeSearchText(clean);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function getCandidateDataDirs() {
  if (process.env.AGENDAMEA_DATA_DIR) {
    return [path.resolve(process.env.AGENDAMEA_DATA_DIR)];
  }
  return [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Agendamea') : null,
    path.join(os.homedir(), 'AppData', 'Roaming', 'Agendamea'),
  ].filter(Boolean);
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err)?.code === 'EPERM';
  }
}

function getCandidateBaseUrls() {
  const urls = [];
  if (process.env.AGENDAMEA_URL) {
    urls.push(String(process.env.AGENDAMEA_URL).replace(/\/+$/, ''));
  }
  if (process.env.AGENDAMEA_PORT) {
    urls.push(`http://127.0.0.1:${process.env.AGENDAMEA_PORT}`);
  }
  for (const dir of getCandidateDataDirs()) {
    try {
      const portFile = path.join(dir, 'runtime-port.json');
      if (fs.existsSync(portFile)) {
        const parsed = JSON.parse(fs.readFileSync(portFile, 'utf8'));
        const port = Number(parsed?.port);
        const pid = Number(parsed?.pid);
        if (Number.isInteger(pid) && pid > 0 && !isPidAlive(pid)) {
          continue;
        }
        if (Number.isInteger(port) && port > 0 && port < 65536) {
          urls.push(`http://127.0.0.1:${port}`);
        }
      }
    } catch {
      // Ignore unreadable port file
    }
  }
  if (!process.env.AGENDAMEA_FORCE_OFFLINE && !process.env.AGENDAMEA_DATA_DIR) {
    for (const fallbackPort of [38721, 47821, 39721, 41721, 3000]) {
      urls.push(`http://127.0.0.1:${fallbackPort}`);
    }
  }
  return [...new Set(urls)];
}

let _cachedApiBaseUrl;
let _cachedApiBaseUrlKey = '';
let _cachedApiBaseUrlAt = 0;
const API_BASE_CACHE_TTL_MS = 5000;

function clearApiBaseUrlCache() {
  _cachedApiBaseUrl = undefined;
  _cachedApiBaseUrlKey = '';
  _cachedApiBaseUrlAt = 0;
}

async function resolveApiBaseUrl(options = {}) {
  if (process.env.AGENDAMEA_FORCE_OFFLINE === '1') {
    return null;
  }
  const envKey = `${process.env.AGENDAMEA_URL || ''}|${process.env.AGENDAMEA_PORT || ''}|${process.env.AGENDAMEA_FORCE_OFFLINE || ''}|${process.env.AGENDAMEA_DATA_DIR || ''}`;
  if (
    !options.bypassCache &&
    _cachedApiBaseUrl !== undefined &&
    _cachedApiBaseUrlKey === envKey &&
    Date.now() - _cachedApiBaseUrlAt < API_BASE_CACHE_TTL_MS
  ) {
    return _cachedApiBaseUrl;
  }
  const candidates = getCandidateBaseUrls();
  if (candidates.length === 0) {
    _cachedApiBaseUrl = null;
    _cachedApiBaseUrlKey = envKey;
    _cachedApiBaseUrlAt = Date.now();
    return null;
  }
  const explicitUrl = process.env.AGENDAMEA_URL
    ? String(process.env.AGENDAMEA_URL).replace(/\/+$/, '')
    : null;
  try {
    const resolved = await Promise.any(
      candidates.map(async (base) => {
        const controller = new AbortController();
        const probeTimeoutMs = explicitUrl && base === explicitUrl ? 1500 : 450;
        const timer = setTimeout(() => controller.abort(), probeTimeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
        try {
          const res = await fetch(`${base}/api/health`, { signal: controller.signal });
          if (!res.ok) throw new Error('not ok');
          const body = await res.json().catch(() => null);
          if (
            body &&
            body.ok === true &&
            (body.app === 'Agendamea' || typeof body.version === 'string')
          ) {
            return base;
          }
          throw new Error('not agendamea');
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    _cachedApiBaseUrl = resolved;
    _cachedApiBaseUrlKey = envKey;
    _cachedApiBaseUrlAt = Date.now();
    return resolved;
  } catch {
    _cachedApiBaseUrl = null;
    _cachedApiBaseUrlKey = envKey;
    _cachedApiBaseUrlAt = Date.now();
    return null;
  }
}

async function httpRequest(baseUrl, method, endpoint, body, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (timer && typeof timer.unref === 'function') timer.unref();
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  APP_VERSION,
  ABI_FALLBACK_EXIT_CODE,
  loadLazy,
  formatLocalDate,
  getTodayStr,
  getTomorrowStr,
  normalizeSearchText,
  isValidIsoDate,
  normalizeDateRange,
  sanitizeDueTime,
  normalizeHexColor,
  sanitizeTags,
  getCandidateDataDirs,
  getCandidateBaseUrls,
  resolveApiBaseUrl,
  clearApiBaseUrlCache,
  httpRequest,
};
