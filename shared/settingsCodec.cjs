'use strict';

/**
 * Single source of truth for reading/decoding and validating/writing all AppSettings keys.
 * Consumed by BOTH `src/db/database.ts` (Express server) and `shared/localStore.cjs`
 * (offline CLI & MCP engine) to prevent any settings schema or validation drift.
 *
 * Heavy modules (`aiCatalog`, `webhookEngine`) are lazy-required on demand so CLI cold start stays <150ms.
 */

const sharedConstants = require('./constants.cjs');

let _aiCatalog = null;
let _webhookEngine = null;

function getAiCatalog() {
  if (!_aiCatalog) _aiCatalog = require('./aiCatalog.cjs');
  return _aiCatalog;
}

function getWebhookEngine() {
  if (!_webhookEngine) _webhookEngine = require('./webhookEngine.cjs');
  return _webhookEngine;
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

function defaultClampZoom(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 100;
  return Math.max(80, Math.min(150, Math.round(num)));
}

function defaultClampLeadMinutes(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 15;
  return Math.max(1, Math.min(180, Math.round(num)));
}

const VALID_NOTIFICATION_PROFILES = new Set(['balanced', 'all', 'focus', 'silent_inapp', 'custom']);
const VALID_WEBHOOK_FORMATS = new Set(['auto', 'generic', 'discord', 'slack']);
const VALID_AI_TIERS = new Set([
  'tier-light',
  'tier-medium',
  'tier-strong',
  'cpu-light',
  'cpu-balanced',
  'gpu-very-weak',
  'gpu-weak',
  'gpu-balanced',
  'gpu-strong',
  'gpu-ultra',
  'custom',
  'external-ollama',
  'external-lmstudio',
]);
const VALID_TTS_STYLES = new Set(['natural', 'crisp', 'calm', 'bright', 'studio']);
const VALID_CHIME_PRESETS = new Set(['soft', 'crystal', 'studio', 'minimal', 'none']);
const VALID_VOICE_SENSITIVITIES = new Set(['auto', 'low', 'medium', 'high']);
const VALID_LIST_DENSITIES = new Set(['compact', 'comfortable', 'spacious']);
const VALID_FONT_FAMILIES = new Set(['system', 'sans', 'mono', 'dyslexic']);
const VALID_FONT_SCALES = new Set(['small', 'normal', 'large', 'xlarge']);
const VALID_WEEK_STARTS = new Set(['monday', 'sunday', 'saturday']);
const VALID_TIME_FORMATS = new Set(['24h', '12h']);
const VALID_STARTUP_VIEWS = new Set(['all', 'today', 'important']);
const VALID_LAYOUT_MODES = new Set(['list', 'kanban', 'calendar', 'matrix']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high']);
const VALID_COMPLETED_BEHAVIORS = new Set(['show', 'bottom', 'hide']);
const VALID_COMPLETION_SOUNDS = new Set(['none', 'pop', 'chime', 'soft']);
const VALID_TRASH_PURGE_DAYS = new Set([0, 7, 30, 90]);
const VALID_APP_LOCK_TYPES = new Set(['pin4', 'pin6', 'pin8', 'password']);
const VALID_APP_LOCK_MINUTES = new Set([0, 1, 5, 15, 30, 60]);
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeExternalBaseUrl(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().slice(0, 240);
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return trimmed.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function defaultIsValidNotifProfile(v) {
  return typeof v === 'string' && VALID_NOTIFICATION_PROFILES.has(v);
}

const SETTINGS_SELECT_SQL = `SELECT key, value FROM settings WHERE key IN (${sharedConstants.SETTING_KEYS.map(() => '?').join(', ')})`;

/**
 * Decode a `settings` key/value SQLite table into canonical `AppSettings` object.
 * Optional properties remain omitted when unset/default so fresh-DB bootstrap shape stays clean.
 */
function readSettingsFromDb(db, options = {}) {
  const keys = sharedConstants.SETTING_KEYS;
  const rows = db.prepare(SETTINGS_SELECT_SQL).all(...keys);

  const map = new Map(rows.map((r) => [r.key, r.value]));
  return decodeSettingsMap(map, options);
}

function decodeSettingsMap(map, options = {}) {
  const isValidThemeId =
    typeof options.isValidThemeId === 'function'
      ? options.isValidThemeId
      : (v) => typeof v === 'string' && v.trim().length > 0;
  const isValidAppIconId =
    typeof options.isValidAppIconId === 'function'
      ? options.isValidAppIconId
      : (v) => typeof v === 'string' && v.trim().length > 0;
  const isValidLanguageCode =
    typeof options.isValidLanguageCode === 'function'
      ? options.isValidLanguageCode
      : (v) => typeof v === 'string' && v.trim().length > 0;
  const clampZoomPercent =
    typeof options.clampZoomPercent === 'function' ? options.clampZoomPercent : defaultClampZoom;
  const clampNotificationLeadMinutes =
    typeof options.clampNotificationLeadMinutes === 'function'
      ? options.clampNotificationLeadMinutes
      : defaultClampLeadMinutes;
  const isValidNotificationProfileId =
    typeof options.isValidNotificationProfileId === 'function'
      ? options.isValidNotificationProfileId
      : defaultIsValidNotifProfile;
  const sanitizeCustomShortcuts =
    typeof options.sanitizeCustomShortcuts === 'function'
      ? options.sanitizeCustomShortcuts
      : (obj) => obj;
  const sanitizeNotificationChannels =
    typeof options.sanitizeNotificationChannels === 'function'
      ? options.sanitizeNotificationChannels
      : (obj) => obj;

  const rawMode = map.get('themeMode');
  const rawThemeId = map.get('themeId') ?? 'obsidian';
  const rawCustomThemeColor = map.get('customThemeColor');
  const rawAppIconId = map.get('appIconId');
  const rawCustomIconColor = map.get('customIconColor');
  const rawZoomPercent = map.get('zoomPercent');
  const rawHighContrast = map.get('highContrast');
  const rawReducedMotion = map.get('reducedMotion');
  const rawCloseBehavior = map.get('closeBehavior');
  const rawLaunchAtStartup = map.get('launchAtStartup');
  const rawGlobalQuickAdd = map.get('globalQuickAddShortcut');
  const rawDragLocked = map.get('dragLocked');
  const rawSidebarCollapsed = map.get('sidebarCollapsed');
  const rawThemeCustomized = map.get('themeCustomized');
  const rawLanguage = map.get('language');
  const rawAutoUpdate = map.get('autoUpdateCheck');
  const rawOnedriveAutoSync = map.get('onedriveAutoSync');
  const rawOnedrivePath = map.get('onedriveCustomPath') ?? '';
  const rawOnboardingCompleted = map.get('onboardingCompleted');
  const rawWebhookEnabled = map.get('webhookEnabled');
  const rawWebhookUrl = map.get('webhookUrl') ?? '';
  const rawWebhookSecret = map.get('webhookSecret') ?? '';
  const rawWebhookEvents = map.get('webhookEvents') ?? '';

  const settings = {
    themeMode: rawMode === 'dark' ? 'dark' : rawMode === 'system' ? 'system' : 'light',
    themeId: isValidThemeId(rawThemeId) ? rawThemeId : 'obsidian',
    dragLocked: rawDragLocked === '1' || rawDragLocked === 'true',
    sidebarCollapsed: rawSidebarCollapsed === '1' || rawSidebarCollapsed === 'true',
    themeCustomized: rawThemeCustomized === '1' || rawThemeCustomized === 'true',
    language: isValidLanguageCode(rawLanguage) ? rawLanguage : 'tr',
    autoUpdateCheck:
      rawAutoUpdate === undefined ? true : rawAutoUpdate === '1' || rawAutoUpdate === 'true',
  };

  const normCustomTheme = rawCustomThemeColor ? normalizeHexColor(rawCustomThemeColor) : null;
  if (normCustomTheme) settings.customThemeColor = normCustomTheme;

  if (isValidAppIconId(rawAppIconId) && rawAppIconId !== 'match-theme') {
    settings.appIconId = rawAppIconId;
  }
  const normCustomIcon = rawCustomIconColor ? normalizeHexColor(rawCustomIconColor) : null;
  if (normCustomIcon) settings.customIconColor = normCustomIcon;

  if (rawZoomPercent !== undefined) {
    const parsedZoom = clampZoomPercent(rawZoomPercent);
    if (parsedZoom !== 100) settings.zoomPercent = parsedZoom;
  }
  if (rawHighContrast === '1' || rawHighContrast === 'true') settings.highContrast = true;
  if (rawReducedMotion === '1' || rawReducedMotion === 'true') settings.reducedMotion = true;
  if (rawCloseBehavior === 'tray' || rawCloseBehavior === 'quit') {
    settings.closeBehavior = rawCloseBehavior;
  }
  if (rawLaunchAtStartup === '1' || rawLaunchAtStartup === 'true') settings.launchAtStartup = true;
  if (rawGlobalQuickAdd !== undefined) {
    settings.globalQuickAddShortcut = rawGlobalQuickAdd === '1' || rawGlobalQuickAdd === 'true';
  }
  if (rawOnedriveAutoSync === '1' || rawOnedriveAutoSync === 'true')
    settings.onedriveAutoSync = true;
  if (rawOnedrivePath.length > 0) settings.onedriveCustomPath = rawOnedrivePath;
  if (rawOnboardingCompleted === '1' || rawOnboardingCompleted === 'true') {
    settings.onboardingCompleted = true;
  }
  if (rawWebhookEnabled === '1' || rawWebhookEnabled === 'true') settings.webhookEnabled = true;
  if (rawWebhookUrl.length > 0) settings.webhookUrl = rawWebhookUrl;
  if (rawWebhookSecret.length > 0) settings.webhookSecret = rawWebhookSecret;
  if (rawWebhookEvents.length > 0) settings.webhookEvents = rawWebhookEvents;

  const rawWebhookFormat = map.get('webhookFormat');
  if (rawWebhookFormat && VALID_WEBHOOK_FORMATS.has(rawWebhookFormat)) {
    settings.webhookFormat = rawWebhookFormat;
  }
  const rawWebhookIncomingEnabled = map.get('webhookIncomingEnabled');
  if (rawWebhookIncomingEnabled === '1' || rawWebhookIncomingEnabled === 'true') {
    settings.webhookIncomingEnabled = true;
  } else if (rawWebhookIncomingEnabled === '0' || rawWebhookIncomingEnabled === 'false') {
    settings.webhookIncomingEnabled = false;
  }
  const rawWebhookIncomingSecret = map.get('webhookIncomingSecret') ?? '';
  if (rawWebhookIncomingSecret.length > 0) {
    settings.webhookIncomingSecret = rawWebhookIncomingSecret;
  }
  const rawWebhookAllowLocal = map.get('webhookAllowLocalNetwork');
  if (rawWebhookAllowLocal === '0' || rawWebhookAllowLocal === 'false') {
    settings.webhookAllowLocalNetwork = false;
  } else if (rawWebhookAllowLocal === '1' || rawWebhookAllowLocal === 'true') {
    settings.webhookAllowLocalNetwork = true;
  }
  const rawEndpointOverrides = map.get('webhookEndpointOverrides');
  if (rawEndpointOverrides) {
    try {
      const parsed = JSON.parse(rawEndpointOverrides);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings.webhookEndpointOverrides = parsed;
      }
    } catch {
      // Ignore malformed overrides JSON
    }
  }

  const rawAiEnabled = map.get('aiEnabled');
  if (rawAiEnabled === '1' || rawAiEnabled === 'true') settings.aiEnabled = true;
  else if (rawAiEnabled === '0' || rawAiEnabled === 'false') settings.aiEnabled = false;

  const rawAiTier = map.get('aiTier');
  if (rawAiTier && VALID_AI_TIERS.has(rawAiTier)) settings.aiTier = rawAiTier;

  const rawAiLlm = map.get('aiLlmModelId');
  if (rawAiLlm) settings.aiLlmModelId = rawAiLlm;
  const rawAiStt = map.get('aiSttModelId');
  if (rawAiStt) settings.aiSttModelId = rawAiStt;
  const rawAiEmbed = map.get('aiEmbedModelId');
  if (rawAiEmbed) settings.aiEmbedModelId = rawAiEmbed;

  const rawUseOllama = map.get('aiUseExternalOllama');
  if (rawUseOllama === '1' || rawUseOllama === 'true') settings.aiUseExternalOllama = true;
  else if (rawUseOllama === '0' || rawUseOllama === 'false') settings.aiUseExternalOllama = false;

  const rawOllamaModel = map.get('aiOllamaModel');
  if (rawOllamaModel) settings.aiOllamaModel = rawOllamaModel;
  const rawVoiceShortcut = map.get('voiceShortcut');
  if (rawVoiceShortcut) settings.voiceShortcut = rawVoiceShortcut;

  const rawVoiceAutoStop = map.get('voiceAutoStopMs');
  if (rawVoiceAutoStop !== undefined) {
    const ms = Number(rawVoiceAutoStop);
    if (Number.isFinite(ms) && ms >= 600 && ms <= 5000) {
      settings.voiceAutoStopMs = Math.round(ms);
    }
  }
  const rawVoiceTtsEnabled = map.get('voiceTtsEnabled');
  if (rawVoiceTtsEnabled === '1' || rawVoiceTtsEnabled === 'true') settings.voiceTtsEnabled = true;
  else if (rawVoiceTtsEnabled === '0' || rawVoiceTtsEnabled === 'false') {
    settings.voiceTtsEnabled = false;
  }

  const rawVoiceTtsVoice = map.get('voiceTtsVoice');
  if (rawVoiceTtsVoice) settings.voiceTtsVoice = rawVoiceTtsVoice;
  const rawVoiceTtsStyle = map.get('voiceTtsStyle');
  if (rawVoiceTtsStyle && VALID_TTS_STYLES.has(rawVoiceTtsStyle)) {
    settings.voiceTtsStyle = rawVoiceTtsStyle;
  }
  const rawVoiceChimePreset = map.get('voiceChimePreset');
  if (rawVoiceChimePreset && VALID_CHIME_PRESETS.has(rawVoiceChimePreset)) {
    settings.voiceChimePreset = rawVoiceChimePreset;
  }
  const rawVoiceMicDeviceId = map.get('voiceMicDeviceId');
  if (rawVoiceMicDeviceId) settings.voiceMicDeviceId = rawVoiceMicDeviceId;

  const rawVoiceNoiseSuppression = map.get('voiceNoiseSuppression');
  if (rawVoiceNoiseSuppression === '1' || rawVoiceNoiseSuppression === 'true') {
    settings.voiceNoiseSuppression = true;
  } else if (rawVoiceNoiseSuppression === '0' || rawVoiceNoiseSuppression === 'false') {
    settings.voiceNoiseSuppression = false;
  }
  const rawVoiceSensitivity = map.get('voiceSensitivity');
  if (rawVoiceSensitivity && VALID_VOICE_SENSITIVITIES.has(rawVoiceSensitivity)) {
    settings.voiceSensitivity = rawVoiceSensitivity;
  }
  const rawGlobalQuickAddKey = map.get('globalQuickAddShortcutKey');
  if (rawGlobalQuickAddKey) settings.globalQuickAddShortcutKey = rawGlobalQuickAddKey;

  const rawCustomShortcuts = map.get('customShortcuts');
  if (rawCustomShortcuts) {
    try {
      const parsed = JSON.parse(rawCustomShortcuts);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings.customShortcuts = sanitizeCustomShortcuts(parsed);
      }
    } catch {
      // Ignore malformed shortcuts JSON
    }
  }
  const rawNotifProfile = map.get('notificationProfile');
  if (isValidNotificationProfileId(rawNotifProfile)) {
    settings.notificationProfile = rawNotifProfile;
  }
  const rawNotifLead = map.get('notificationLeadMinutes');
  if (rawNotifLead !== undefined) {
    settings.notificationLeadMinutes = clampNotificationLeadMinutes(rawNotifLead);
  }
  const rawNotifChannels = map.get('notificationChannels');
  if (rawNotifChannels) {
    try {
      const parsed = JSON.parse(rawNotifChannels);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings.notificationChannels = sanitizeNotificationChannels(parsed);
      }
    } catch {
      // Ignore malformed channels JSON
    }
  }

  const rawListDensity = map.get('listDensity');
  if (rawListDensity && VALID_LIST_DENSITIES.has(rawListDensity)) {
    settings.listDensity = rawListDensity;
  }
  const rawFontFamily = map.get('fontFamily');
  if (rawFontFamily && VALID_FONT_FAMILIES.has(rawFontFamily)) {
    settings.fontFamily = rawFontFamily;
  }
  const rawFontScale = map.get('fontScale');
  if (rawFontScale && VALID_FONT_SCALES.has(rawFontScale)) {
    settings.fontScale = rawFontScale;
  }
  if (map.get('readableSpacing') === '1' || map.get('readableSpacing') === 'true') {
    settings.readableSpacing = true;
  }
  const rawRecentColors = map.get('recentCustomColors');
  if (rawRecentColors) {
    try {
      const parsed = JSON.parse(rawRecentColors);
      if (Array.isArray(parsed)) {
        const cleanColors = parsed
          .map((c) => normalizeHexColor(c))
          .filter(Boolean)
          .slice(0, 6);
        if (cleanColors.length > 0) settings.recentCustomColors = cleanColors;
      }
    } catch {
      // Ignore malformed colors JSON
    }
  }
  if (map.get('colorBlindShapes') === '1' || map.get('colorBlindShapes') === 'true') {
    settings.colorBlindShapes = true;
  }
  if (map.get('strongFocusRing') === '1' || map.get('strongFocusRing') === 'true') {
    settings.strongFocusRing = true;
  }
  const rawWeekStart = map.get('weekStartsOn');
  if (rawWeekStart && VALID_WEEK_STARTS.has(rawWeekStart)) {
    settings.weekStartsOn = rawWeekStart;
  }
  const rawTimeFormat = map.get('timeFormat');
  if (rawTimeFormat && VALID_TIME_FORMATS.has(rawTimeFormat)) {
    settings.timeFormat = rawTimeFormat;
  }
  const rawStartupView = map.get('defaultStartupView');
  if (rawStartupView && VALID_STARTUP_VIEWS.has(rawStartupView)) {
    settings.defaultStartupView = rawStartupView;
  }
  const rawLayoutMode = map.get('defaultLayoutMode');
  if (rawLayoutMode && VALID_LAYOUT_MODES.has(rawLayoutMode)) {
    settings.defaultLayoutMode = rawLayoutMode;
  }
  const rawDefaultPriority = map.get('defaultPriority');
  if (rawDefaultPriority && VALID_PRIORITIES.has(rawDefaultPriority)) {
    settings.defaultPriority = rawDefaultPriority;
  }
  const rawCompletedBehavior = map.get('completedTaskBehavior');
  if (rawCompletedBehavior && VALID_COMPLETED_BEHAVIORS.has(rawCompletedBehavior)) {
    settings.completedTaskBehavior = rawCompletedBehavior;
  }
  const rawCompletionSound = map.get('completionSound');
  if (rawCompletionSound && VALID_COMPLETION_SOUNDS.has(rawCompletionSound)) {
    settings.completionSound = rawCompletionSound;
  }
  if (map.get('confirmBeforeDelete') === '1' || map.get('confirmBeforeDelete') === 'true') {
    settings.confirmBeforeDelete = true;
  }
  if (map.get('launchMinimizedToTray') === '1' || map.get('launchMinimizedToTray') === 'true') {
    settings.launchMinimizedToTray = true;
  }
  const rawTrashPurgeDays = map.get('trashAutoPurgeDays');
  if (rawTrashPurgeDays !== undefined) {
    const daysNum = Number(rawTrashPurgeDays);
    if (VALID_TRASH_PURGE_DAYS.has(daysNum) && daysNum > 0) {
      settings.trashAutoPurgeDays = daysNum;
    }
  }
  const rawVoiceShortcutEnabled = map.get('voiceShortcutEnabled');
  if (rawVoiceShortcutEnabled === '0' || rawVoiceShortcutEnabled === 'false') {
    settings.voiceShortcutEnabled = false;
  } else if (rawVoiceShortcutEnabled === '1' || rawVoiceShortcutEnabled === 'true') {
    settings.voiceShortcutEnabled = true;
  }
  if (map.get('quietHoursEnabled') === '1' || map.get('quietHoursEnabled') === 'true') {
    settings.quietHoursEnabled = true;
  }
  const rawQuietStart = map.get('quietHoursStart');
  if (rawQuietStart && HH_MM_RE.test(rawQuietStart)) settings.quietHoursStart = rawQuietStart;
  const rawQuietEnd = map.get('quietHoursEnd');
  if (rawQuietEnd && HH_MM_RE.test(rawQuietEnd)) settings.quietHoursEnd = rawQuietEnd;
  const rawNotifSound = map.get('notificationSoundEnabled');
  if (rawNotifSound === '0' || rawNotifSound === 'false') {
    settings.notificationSoundEnabled = false;
  } else if (rawNotifSound === '1' || rawNotifSound === 'true') {
    settings.notificationSoundEnabled = true;
  }
  if (map.get('dailyDigestEnabled') === '1' || map.get('dailyDigestEnabled') === 'true') {
    settings.dailyDigestEnabled = true;
  }
  const rawDigestTime = map.get('dailyDigestTime');
  if (rawDigestTime && HH_MM_RE.test(rawDigestTime)) settings.dailyDigestTime = rawDigestTime;
  const rawVoiceDictLang = map.get('voiceDictationLanguage');
  if (rawVoiceDictLang && (rawVoiceDictLang === 'auto' || isValidLanguageCode(rawVoiceDictLang))) {
    settings.voiceDictationLanguage = rawVoiceDictLang;
  }
  const rawAiExternalBaseUrl = map.get('aiExternalBaseUrl');
  if (rawAiExternalBaseUrl) {
    const cleanUrl = sanitizeExternalBaseUrl(rawAiExternalBaseUrl);
    if (cleanUrl) settings.aiExternalBaseUrl = cleanUrl;
  }
  if (map.get('appLockEnabled') === '1' || map.get('appLockEnabled') === 'true') {
    settings.appLockEnabled = true;
  }
  const rawAppLockType = map.get('appLockType');
  if (rawAppLockType && VALID_APP_LOCK_TYPES.has(rawAppLockType)) {
    settings.appLockType = rawAppLockType;
  }
  const rawAppLockMinutes = map.get('appLockAutoLockMinutes');
  if (rawAppLockMinutes !== undefined) {
    const mins = Number(rawAppLockMinutes);
    if (Number.isFinite(mins) && VALID_APP_LOCK_MINUTES.has(Math.trunc(mins))) {
      settings.appLockAutoLockMinutes = Math.trunc(mins);
    }
  }
  if (map.get('appLockOnMinimize') === '1' || map.get('appLockOnMinimize') === 'true') {
    settings.appLockOnMinimize = true;
  }

  return settings;
}

/**
 * Apply a partial AppSettings patch to the `settings` SQLite table inside the caller's transaction.
 */
function applySettingsPatchToDb(db, patch, options = {}) {
  if (!patch || typeof patch !== 'object') return;

  const isValidThemeId =
    typeof options.isValidThemeId === 'function'
      ? options.isValidThemeId
      : (v) => typeof v === 'string' && v.trim().length > 0;
  const isValidAppIconId =
    typeof options.isValidAppIconId === 'function'
      ? options.isValidAppIconId
      : (v) => typeof v === 'string' && v.trim().length > 0;
  const isValidLanguageCode =
    typeof options.isValidLanguageCode === 'function'
      ? options.isValidLanguageCode
      : (v) => typeof v === 'string' && v.trim().length > 0;
  const clampZoomPercent =
    typeof options.clampZoomPercent === 'function' ? options.clampZoomPercent : defaultClampZoom;
  const clampNotificationLeadMinutes =
    typeof options.clampNotificationLeadMinutes === 'function'
      ? options.clampNotificationLeadMinutes
      : defaultClampLeadMinutes;
  const isValidNotificationProfileId =
    typeof options.isValidNotificationProfileId === 'function'
      ? options.isValidNotificationProfileId
      : defaultIsValidNotifProfile;
  const sanitizeCustomShortcuts =
    typeof options.sanitizeCustomShortcuts === 'function'
      ? options.sanitizeCustomShortcuts
      : (obj) => obj;
  const sanitizeNotificationChannels =
    typeof options.sanitizeNotificationChannels === 'function'
      ? options.sanitizeNotificationChannels
      : (obj) => obj;
  const validateSyncFolder =
    typeof options.validateSyncFolder === 'function' ? options.validateSyncFolder : (p) => p;
  const strictWebhookUrl = options.strictWebhookUrl !== false;
  const createValidationError =
    typeof options.createValidationError === 'function'
      ? options.createValidationError
      : (msg) => new Error(msg);

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  if (patch.themeMode === 'light' || patch.themeMode === 'dark' || patch.themeMode === 'system') {
    stmt.run('themeMode', patch.themeMode);
    stmt.run('themeCustomized', '1');
  }
  if (typeof patch.themeId === 'string' && isValidThemeId(patch.themeId.trim())) {
    stmt.run('themeId', patch.themeId.trim());
    stmt.run('themeCustomized', '1');
  }
  if (typeof patch.customThemeColor === 'string') {
    const norm = normalizeHexColor(patch.customThemeColor);
    if (norm) {
      stmt.run('customThemeColor', norm);
      stmt.run('themeCustomized', '1');
    }
  }
  if (patch.appIconId !== undefined && isValidAppIconId(patch.appIconId)) {
    stmt.run('appIconId', String(patch.appIconId).trim());
  }
  if (typeof patch.customIconColor === 'string') {
    const norm = normalizeHexColor(patch.customIconColor);
    if (norm) stmt.run('customIconColor', norm);
  }
  if (typeof patch.zoomPercent === 'number' && Number.isFinite(patch.zoomPercent)) {
    stmt.run('zoomPercent', String(clampZoomPercent(patch.zoomPercent)));
  }

  const boolKeys = [
    'highContrast',
    'reducedMotion',
    'launchAtStartup',
    'globalQuickAddShortcut',
    'dragLocked',
    'sidebarCollapsed',
    'autoUpdateCheck',
    'onedriveAutoSync',
    'onboardingCompleted',
    'webhookEnabled',
    'webhookIncomingEnabled',
    'webhookAllowLocalNetwork',
    'aiEnabled',
    'aiUseExternalOllama',
    'voiceTtsEnabled',
    'voiceNoiseSuppression',
    'colorBlindShapes',
    'strongFocusRing',
    'readableSpacing',
    'confirmBeforeDelete',
    'launchMinimizedToTray',
    'voiceShortcutEnabled',
    'quietHoursEnabled',
    'notificationSoundEnabled',
    'dailyDigestEnabled',
  ];
  for (const key of boolKeys) {
    if (typeof patch[key] === 'boolean') {
      stmt.run(key, patch[key] ? '1' : '0');
    }
  }

  if (
    patch.closeBehavior === 'ask' ||
    patch.closeBehavior === 'tray' ||
    patch.closeBehavior === 'quit'
  ) {
    stmt.run('closeBehavior', patch.closeBehavior);
  }
  if (typeof patch.language === 'string' && isValidLanguageCode(patch.language.trim())) {
    stmt.run('language', patch.language.trim());
  }
  if (typeof patch.onedriveCustomPath === 'string') {
    const trimmedPath = patch.onedriveCustomPath.trim().slice(0, 500);
    stmt.run('onedriveCustomPath', trimmedPath === '' ? '' : validateSyncFolder(trimmedPath));
  }

  if (typeof patch.webhookUrl === 'string') {
    const trimmedUrl = patch.webhookUrl.trim().slice(0, 4000);
    if (trimmedUrl === '') {
      stmt.run('webhookUrl', '');
    } else {
      const webhookEngine = getWebhookEngine();
      const rawEntries = trimmedUrl
        .split(/[\r\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean);
      const validUrls = rawEntries.filter(
        (u) => webhookEngine.validateWebhookUrlSyntax(u, { allowLocalNetwork: true }).ok,
      );
      if (rawEntries.length > 0 && validUrls.length === 0) {
        if (strictWebhookUrl) {
          throw createValidationError('Geçersiz webhook URL adresi (http/https).');
        }
      } else if (validUrls.length > 0) {
        stmt.run('webhookUrl', validUrls.join(','));
      }
    }
  }
  if (typeof patch.webhookSecret === 'string') {
    stmt.run('webhookSecret', patch.webhookSecret.trim().slice(0, 256));
  }
  if (typeof patch.webhookEvents === 'string') {
    const cleaned = patch.webhookEvents
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(',')
      .slice(0, 500);
    stmt.run('webhookEvents', cleaned);
  }
  if (typeof patch.webhookFormat === 'string' && VALID_WEBHOOK_FORMATS.has(patch.webhookFormat)) {
    stmt.run('webhookFormat', patch.webhookFormat);
  }
  if (typeof patch.webhookIncomingSecret === 'string') {
    stmt.run('webhookIncomingSecret', patch.webhookIncomingSecret.trim().slice(0, 256));
  }
  if (
    patch.webhookEndpointOverrides &&
    typeof patch.webhookEndpointOverrides === 'object' &&
    !Array.isArray(patch.webhookEndpointOverrides)
  ) {
    const sanitized = {};
    let count = 0;
    for (const [urlKey, cfg] of Object.entries(patch.webhookEndpointOverrides)) {
      if (count >= 32) break;
      const cleanUrl = String(urlKey || '')
        .trim()
        .slice(0, 1000);
      if (!cleanUrl || !cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
      const entry = {};
      if (typeof cfg.secret === 'string' && cfg.secret.trim()) {
        entry.secret = cfg.secret.trim().slice(0, 256);
      }
      if (typeof cfg.events === 'string' && cfg.events.trim()) {
        entry.events = cfg.events
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(',')
          .slice(0, 500);
      }
      if (typeof cfg.format === 'string' && VALID_WEBHOOK_FORMATS.has(cfg.format)) {
        entry.format = cfg.format;
      }
      if (typeof cfg.enabled === 'boolean') entry.enabled = cfg.enabled;
      if (Object.keys(entry).length > 0) {
        sanitized[cleanUrl] = entry;
        count += 1;
      }
    }
    stmt.run(
      'webhookEndpointOverrides',
      Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : '',
    );
  }

  if (typeof patch.aiTier === 'string' && VALID_AI_TIERS.has(patch.aiTier)) {
    stmt.run('aiTier', patch.aiTier);
  }
  if (typeof patch.aiLlmModelId === 'string') {
    const id = patch.aiLlmModelId.trim().slice(0, 120);
    if (id === '' || getAiCatalog().MODELS_BY_ID[id]?.role === 'llm') {
      stmt.run('aiLlmModelId', id);
    }
  }
  if (typeof patch.aiSttModelId === 'string') {
    const id = patch.aiSttModelId.trim().slice(0, 120);
    if (id === '' || getAiCatalog().MODELS_BY_ID[id]?.role === 'stt') {
      stmt.run('aiSttModelId', id);
    }
  }
  if (typeof patch.aiEmbedModelId === 'string') {
    const id = patch.aiEmbedModelId.trim().slice(0, 120);
    if (id === '' || getAiCatalog().MODELS_BY_ID[id]?.role === 'embed') {
      stmt.run('aiEmbedModelId', id);
    }
  }
  if (typeof patch.aiOllamaModel === 'string') {
    stmt.run('aiOllamaModel', patch.aiOllamaModel.trim().slice(0, 160));
  }
  if (typeof patch.voiceShortcut === 'string' && patch.voiceShortcut.trim().length > 0) {
    stmt.run('voiceShortcut', patch.voiceShortcut.trim().slice(0, 64));
  }
  if (typeof patch.voiceAutoStopMs === 'number' && Number.isFinite(patch.voiceAutoStopMs)) {
    const clamped = Math.max(600, Math.min(5000, Math.round(patch.voiceAutoStopMs)));
    stmt.run('voiceAutoStopMs', String(clamped));
  }
  if (typeof patch.voiceTtsVoice === 'string') {
    stmt.run('voiceTtsVoice', patch.voiceTtsVoice.trim().slice(0, 160));
  }
  if (typeof patch.voiceTtsStyle === 'string' && VALID_TTS_STYLES.has(patch.voiceTtsStyle)) {
    stmt.run('voiceTtsStyle', patch.voiceTtsStyle);
  }
  if (
    typeof patch.voiceChimePreset === 'string' &&
    VALID_CHIME_PRESETS.has(patch.voiceChimePreset)
  ) {
    stmt.run('voiceChimePreset', patch.voiceChimePreset);
  }
  if (typeof patch.voiceMicDeviceId === 'string') {
    stmt.run('voiceMicDeviceId', patch.voiceMicDeviceId.trim().slice(0, 200));
  }
  if (
    typeof patch.voiceSensitivity === 'string' &&
    VALID_VOICE_SENSITIVITIES.has(patch.voiceSensitivity)
  ) {
    stmt.run('voiceSensitivity', patch.voiceSensitivity);
  }
  if (
    typeof patch.globalQuickAddShortcutKey === 'string' &&
    patch.globalQuickAddShortcutKey.trim().length > 0
  ) {
    stmt.run('globalQuickAddShortcutKey', patch.globalQuickAddShortcutKey.trim().slice(0, 64));
  }
  if (
    patch.customShortcuts &&
    typeof patch.customShortcuts === 'object' &&
    !Array.isArray(patch.customShortcuts)
  ) {
    stmt.run('customShortcuts', JSON.stringify(sanitizeCustomShortcuts(patch.customShortcuts)));
  }
  if (isValidNotificationProfileId(patch.notificationProfile)) {
    stmt.run('notificationProfile', patch.notificationProfile);
  }
  if (
    typeof patch.notificationLeadMinutes === 'number' &&
    Number.isFinite(patch.notificationLeadMinutes)
  ) {
    stmt.run(
      'notificationLeadMinutes',
      String(clampNotificationLeadMinutes(patch.notificationLeadMinutes)),
    );
  }
  if (
    patch.notificationChannels &&
    typeof patch.notificationChannels === 'object' &&
    !Array.isArray(patch.notificationChannels)
  ) {
    stmt.run(
      'notificationChannels',
      JSON.stringify(sanitizeNotificationChannels(patch.notificationChannels)),
    );
  }
  if (typeof patch.listDensity === 'string' && VALID_LIST_DENSITIES.has(patch.listDensity)) {
    stmt.run('listDensity', patch.listDensity);
  }
  if (typeof patch.fontFamily === 'string' && VALID_FONT_FAMILIES.has(patch.fontFamily)) {
    stmt.run('fontFamily', patch.fontFamily);
  }
  if (typeof patch.fontScale === 'string' && VALID_FONT_SCALES.has(patch.fontScale)) {
    stmt.run('fontScale', patch.fontScale);
  }
  if (Array.isArray(patch.recentCustomColors)) {
    const seen = new Set();
    const cleaned = [];
    for (const c of patch.recentCustomColors) {
      const norm = normalizeHexColor(c);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        cleaned.push(norm);
      }
      if (cleaned.length >= 6) break;
    }
    stmt.run('recentCustomColors', JSON.stringify(cleaned));
  }
  if (typeof patch.weekStartsOn === 'string' && VALID_WEEK_STARTS.has(patch.weekStartsOn)) {
    stmt.run('weekStartsOn', patch.weekStartsOn);
  }
  if (typeof patch.timeFormat === 'string' && VALID_TIME_FORMATS.has(patch.timeFormat)) {
    stmt.run('timeFormat', patch.timeFormat);
  }
  if (
    typeof patch.defaultStartupView === 'string' &&
    VALID_STARTUP_VIEWS.has(patch.defaultStartupView)
  ) {
    stmt.run('defaultStartupView', patch.defaultStartupView);
  }
  if (
    typeof patch.defaultLayoutMode === 'string' &&
    VALID_LAYOUT_MODES.has(patch.defaultLayoutMode)
  ) {
    stmt.run('defaultLayoutMode', patch.defaultLayoutMode);
  }
  if (typeof patch.defaultPriority === 'string' && VALID_PRIORITIES.has(patch.defaultPriority)) {
    stmt.run('defaultPriority', patch.defaultPriority);
  }
  if (
    typeof patch.completedTaskBehavior === 'string' &&
    VALID_COMPLETED_BEHAVIORS.has(patch.completedTaskBehavior)
  ) {
    stmt.run('completedTaskBehavior', patch.completedTaskBehavior);
  }
  if (
    typeof patch.completionSound === 'string' &&
    VALID_COMPLETION_SOUNDS.has(patch.completionSound)
  ) {
    stmt.run('completionSound', patch.completionSound);
  }
  if (
    typeof patch.trashAutoPurgeDays === 'number' &&
    VALID_TRASH_PURGE_DAYS.has(patch.trashAutoPurgeDays)
  ) {
    stmt.run('trashAutoPurgeDays', String(patch.trashAutoPurgeDays));
  }
  if (typeof patch.quietHoursStart === 'string' && HH_MM_RE.test(patch.quietHoursStart.trim())) {
    stmt.run('quietHoursStart', patch.quietHoursStart.trim());
  }
  if (typeof patch.quietHoursEnd === 'string' && HH_MM_RE.test(patch.quietHoursEnd.trim())) {
    stmt.run('quietHoursEnd', patch.quietHoursEnd.trim());
  }
  if (typeof patch.dailyDigestTime === 'string' && HH_MM_RE.test(patch.dailyDigestTime.trim())) {
    stmt.run('dailyDigestTime', patch.dailyDigestTime.trim());
  }
  if (typeof patch.voiceDictationLanguage === 'string') {
    const vLang = patch.voiceDictationLanguage.trim();
    if (vLang === 'auto' || vLang === '' || isValidLanguageCode(vLang)) {
      stmt.run('voiceDictationLanguage', vLang || 'auto');
    }
  }
  if (typeof patch.aiExternalBaseUrl === 'string') {
    stmt.run('aiExternalBaseUrl', sanitizeExternalBaseUrl(patch.aiExternalBaseUrl));
  }
}

module.exports = {
  normalizeHexColor,
  readSettingsFromDb,
  decodeSettingsMap,
  applySettingsPatchToDb,
};
