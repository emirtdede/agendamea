'use strict';

/**
 * Localized CLI User-Facing Messages & Labels across all 73 supported languages.
 * Lazy-loads per-language JSON from shared/cliLocales/<code>.json to keep CLI startup fast (~45ms).
 * Zero em-dash, zero emoji.
 */

const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, 'cliLocales');
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

function normalizeLangCode(lang) {
  const raw = String(lang || process.env.AGENDAMEA_LANG || process.env.AGENDAMEA_CLI_LANG || 'en')
    .trim()
    .replace(/_/g, '-');
  if (!raw) return 'en';
  const avail = getAvailableCodes();
  if (avail.has(raw)) return raw;
  const lower = raw.toLowerCase();
  for (const code of avail) {
    if (code.toLowerCase() === lower) return code;
  }
  if (
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hk') ||
    lower.startsWith('zh-mo')
  ) {
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

function loadLocaleBundle(lang) {
  const code = normalizeLangCode(lang);
  if (CACHE.has(code)) return CACHE.get(code);
  try {
    const filePath = path.join(LOCALES_DIR, `${code}.json`);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    CACHE.set(code, parsed);
    return parsed;
  } catch {
    if (code !== 'en') return loadLocaleBundle('en');
    return { labels: {}, messages: {} };
  }
}

function getCliMessages(lang) {
  return loadLocaleBundle(lang).messages;
}

function getCliLabels(lang, appVersion = '1.1.0') {
  const raw = loadLocaleBundle(lang).labels;
  const ver = String(appVersion || '1.1.0');
  return {
    ...raw,
    shortHelp: String(raw.shortHelp || '').replace(/\{version\}/g, ver),
    fullHelp: String(raw.fullHelp || '').replace(/\{version\}/g, ver),
  };
}

function formatMsg(template, vars = {}) {
  let out = String(template || '');
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

module.exports = {
  normalizeLangCode,
  getCliMessages,
  getCliLabels,
  formatMsg,
};
