/**
 * Shared bounded LRU cache for Intl.DateTimeFormat instances across all UI views and utilities.
 * Prevents duplicate module-level Maps and caps memory across all 73 supported locales.
 */

const MAX_CACHE_ENTRIES = 32;
const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

export function getCachedDateTimeFormatter(
  intlLocale: string,
  optionsKey: string,
  options: Intl.DateTimeFormatOptions,
  fallbackLocale = 'tr-TR',
): Intl.DateTimeFormat {
  const safeLocale = intlLocale || fallbackLocale;
  const cacheKey = `${safeLocale}|${optionsKey}`;
  const existing = FORMATTER_CACHE.get(cacheKey);
  if (existing) {
    // Refresh LRU recency
    FORMATTER_CACHE.delete(cacheKey);
    FORMATTER_CACHE.set(cacheKey, existing);
    return existing;
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(safeLocale, options);
  } catch {
    formatter = new Intl.DateTimeFormat(fallbackLocale, options);
  }

  if (FORMATTER_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = FORMATTER_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      FORMATTER_CACHE.delete(oldestKey);
    }
  }
  FORMATTER_CACHE.set(cacheKey, formatter);
  return formatter;
}
