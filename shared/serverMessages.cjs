'use strict';

/**
 * Localized Local API & Webhook Server Error Messages across all 73 supported languages.
 * Lazy-loads per-language JSON from shared/serverLocales/<code>.json with in-memory cache.
 * Zero em-dash, zero emoji.
 */

const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = (() => {
  const candidates = [
    typeof __dirname === 'string' ? path.join(__dirname, 'serverLocales') : '',
    typeof __dirname === 'string' ? path.join(__dirname, '..', 'shared', 'serverLocales') : '',
    process.env.AGENDAMEA_APP_ROOT
      ? path.join(process.env.AGENDAMEA_APP_ROOT, 'shared', 'serverLocales')
      : '',
    path.join(process.cwd(), 'shared', 'serverLocales'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {
      // Try next candidate
    }
  }
  return candidates[0] || path.join(process.cwd(), 'shared', 'serverLocales');
})();
const CACHE = new Map();

let AVAILABLE_CODES = null;
function getAvailableCodes() {
  if (!AVAILABLE_CODES) {
    try {
      AVAILABLE_CODES = new Set(
        fs
          .readdirSync(LOCALES_DIR)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -5)),
      );
    } catch {
      AVAILABLE_CODES = new Set(['en', 'tr']);
    }
  }
  return AVAILABLE_CODES;
}

function normalizeServerLang(lang) {
  const raw = String(lang || 'en')
    .trim()
    .replace(/_/g, '-');
  if (!raw) return 'en';
  const avail = getAvailableCodes();
  if (avail.has(raw)) return raw;
  const lower = raw.toLowerCase();
  for (const code of avail) {
    if (code.toLowerCase() === lower) return code;
  }
  if (lower.startsWith('zh-hant') || lower.startsWith('zh-tw') || lower.startsWith('zh-hk')) {
    return avail.has('zh-TW') ? 'zh-TW' : 'en';
  }
  if (lower.startsWith('zh')) {
    return avail.has('zh-CN') ? 'zh-CN' : 'en';
  }
  if (lower.startsWith('pt-br')) {
    return avail.has('pt-BR') ? 'pt-BR' : 'pt';
  }
  const base = lower.split('-')[0];
  if (base === 'fil') return avail.has('tl') ? 'tl' : 'en';
  if (base === 'nb' || base === 'nn') return avail.has('no') ? 'no' : 'en';
  if (avail.has(base)) return base;
  return 'en';
}

function getServerMessages(lang) {
  const code = normalizeServerLang(lang);
  if (CACHE.has(code)) return CACHE.get(code);
  try {
    const filePath = path.join(LOCALES_DIR, `${code}.json`);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    CACHE.set(code, parsed);
    return parsed;
  } catch {
    if (code !== 'en') return getServerMessages('en');
    return {};
  }
}

function getServerMessage(lang, key) {
  const msgs = getServerMessages(lang);
  if (msgs && typeof msgs[key] === 'string' && msgs[key].trim()) {
    return msgs[key];
  }
  const en = getServerMessages('en');
  return en[key] || key;
}

module.exports = {
  normalizeServerLang,
  getServerMessages,
  getServerMessage,
};
