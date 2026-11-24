import type { LanguageCode } from '../languages';
import type { UiDictionary } from './types';

export const THEME_COLOR_DICT_KEYS: Record<string, keyof UiDictionary> = {
  obsidian: 'colorObsidian',
  slate: 'colorSlate',
  navy: 'colorNavy',
  blue: 'colorBlue',
  cyan: 'colorCyan',
  indigo: 'colorIndigo',
  purple: 'colorPurple',
  pink: 'colorPink',
  red: 'colorRed',
  orange: 'colorOrange',
  yellow: 'colorYellow',
  emerald: 'colorEmerald',
  grass: 'colorGrass',
  lime: 'colorLime',
};

export const CATEGORY_HEX_DICT_KEYS: Record<string, keyof UiDictionary> = {
  '#dc2626': 'colorRed',
  '#2563eb': 'colorBlue',
  '#16a34a': 'colorGrass',
  '#eab308': 'colorPureYellow',
  '#ea580c': 'colorOrange',
  '#7c3aed': 'colorPurple',
  '#db2777': 'colorPink',
  '#ffffff': 'colorWhite',
};

export function resolveThemeColorName(
  themeId: string,
  fallbackName: string,
  dict: UiDictionary,
): string {
  const key = THEME_COLOR_DICT_KEYS[themeId];
  return key ? dict[key] : fallbackName;
}

export function resolveCategoryColorName(
  hex: string,
  fallbackName: string,
  dict: UiDictionary,
): string {
  const key = CATEGORY_HEX_DICT_KEYS[hex.toLowerCase()];
  return key ? dict[key] : fallbackName;
}

export function localizeErrorMessage(
  err: unknown,
  fallback: string,
  lang: LanguageCode,
  dict: UiDictionary,
): string {
  if (!(err instanceof Error) || !err.message) {
    return fallback;
  }
  const msg = err.message.trim().toLowerCase();
  // Catch raw browser/V8 English technical errors and standardized client network codes across all languages
  if (
    msg === 'network_timeout' ||
    msg === 'network_unreachable' ||
    /^(failed to fetch|networkerror|load failed|unexpected token|unexpected end of json|http \d{3})/i.test(
      msg,
    )
  ) {
    return fallback;
  }
  if (lang === 'tr') {
    return err.message;
  }
  if (msg.includes('5 mb')) {
    return dict.importSizeExceededError;
  }
  if (msg.includes('yedek') || msg.includes('json')) {
    return dict.importInvalidBackupError;
  }
  if (err.name === 'ApiLocalizedError' && !/[ğüşıöçĞÜŞİÖÇ]/.test(err.message)) {
    return err.message;
  }
  // Never leak Turkish server/client error strings into non-Turkish locales
  return fallback;
}
