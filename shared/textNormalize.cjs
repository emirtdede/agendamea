'use strict';

/**
 * Dual-Layer Locale-Safe Search & Identifier Normalization.
 * Solves Turkish dotted/dotless I collisions ('API' -> 'apı', 'IT' -> 'ıt') while preserving
 * full Turkish ('İstanbul' <-> 'istanbul', 'Işık' <-> 'ışık') and Latin diacritic folding.
 */

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i');
}

function normalizeAsciiLower(value) {
  return String(value || '')
    .toLowerCase()
    .trim();
}

function normalizeTurkishLower(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function normalizeFolded(value) {
  return stripDiacritics(normalizeTurkishLower(value)).toLowerCase().trim();
}

/**
 * Exact case-insensitive equality safe for BOTH English/ASCII acronyms ('API', 'IT')
 * and Turkish/Unicode identifiers ('İş', 'İstanbul', 'Işık').
 */
function equalsNormalized(a, b, options = {}) {
  const rawA = String(a || '').trim();
  const rawB = String(b || '').trim();
  if (!rawA && !rawB) return true;
  if (!rawA || !rawB) return false;
  if (normalizeAsciiLower(rawA) === normalizeAsciiLower(rawB)) return true;
  if (normalizeTurkishLower(rawA) === normalizeTurkishLower(rawB)) return true;
  if (options.foldDiacritics !== false && normalizeFolded(rawA) === normalizeFolded(rawB)) {
    return true;
  }
  return false;
}

/**
 * Substring match safe for BOTH English/ASCII ('API', 'IT') and Turkish/Unicode ('İstanbul', 'Işık').
 */
function matchesNormalized(haystack, needle, options = {}) {
  const q = String(needle || '').trim();
  if (!q) return true;
  const h = String(haystack || '');
  if (!h) return false;
  if (normalizeAsciiLower(h).includes(normalizeAsciiLower(q))) return true;
  if (normalizeTurkishLower(h).includes(normalizeTurkishLower(q))) return true;
  if (options.foldDiacritics !== false && normalizeFolded(h).includes(normalizeFolded(q))) {
    return true;
  }
  return false;
}

/**
 * Canonical deduplication key (e.g., for tags or category lookup maps) that treats
 * 'API' and 'api' identically AND 'İstanbul' and 'istanbul' identically.
 */
function canonicalKey(value) {
  return normalizeFolded(value);
}

module.exports = {
  stripDiacritics,
  normalizeAsciiLower,
  normalizeTurkishLower,
  normalizeFolded,
  equalsNormalized,
  matchesNormalized,
  canonicalKey,
};
