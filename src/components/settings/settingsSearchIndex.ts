import type { UiDictionary } from '../../i18n/translations';
import type { SettingsTabId } from '../../types';

export interface SettingsSearchEntry {
  id: string;
  tab: SettingsTabId;
  settingId: string;
  labelKey: keyof UiDictionary;
  keywords: string;
}

export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  {
    id: 'appearance-mode',
    tab: 'appearance',
    settingId: 'appearance-mode',
    labelKey: 'appearanceModeTitle',
    keywords: 'dark light system mode tema mod karanlik aydinlik',
  },
  {
    id: 'appearance-theme',
    tab: 'appearance',
    settingId: 'appearance-theme',
    labelKey: 'colorThemeTitle',
    keywords: 'color palette hex custom accent renk tema',
  },
  {
    id: 'appearance-density-font',
    tab: 'appearance',
    settingId: 'appearance-density-font',
    labelKey: 'appearanceTypographyTitle',
    keywords: 'density compact spacious font mono dyslexic typography yazi tipi yogunluk',
  },
  {
    id: 'appearance-icon',
    tab: 'appearance',
    settingId: 'appearance-icon',
    labelKey: 'appIconSectionTitle',
    keywords: 'icon logo taskbar tray simge ikon',
  },
  {
    id: 'a11y-zoom',
    tab: 'accessibility',
    settingId: 'a11y-zoom',
    labelKey: 'zoomLevelTitle',
    keywords: 'zoom scale font size percent olcek yakinlastir',
  },
  {
    id: 'a11y-contrast',
    tab: 'accessibility',
    settingId: 'a11y-contrast',
    labelKey: 'highContrastTitle',
    keywords: 'contrast colorblind focus ring motion wcag kontrast erisilebilirlik odak',
  },
  {
    id: 'general-language',
    tab: 'general',
    settingId: 'general-language',
    labelKey: 'languageSectionTitle',
    keywords: 'language locale rtl 73 dil turkce english',
  },
  {
    id: 'general-calendar-time',
    tab: 'general',
    settingId: 'general-calendar-time',
    labelKey: 'generalCalendarTimeTitle',
    keywords: 'week monday sunday saturday 12h 24h clock calendar hafta saat takvim',
  },
  {
    id: 'general-defaults',
    tab: 'general',
    settingId: 'general-defaults',
    labelKey: 'generalWorkspaceDefaultsTitle',
    keywords: 'startup view layout priority completed sound chime pop baslangic oncelik ses',
  },
  {
    id: 'general-desktop',
    tab: 'general',
    settingId: 'general-desktop',
    labelKey: 'closeBehaviorSectionTitle',
    keywords: 'tray minimize startup autostart close drag lock sistem tepsisi kapatma',
  },
  {
    id: 'general-safety',
    tab: 'general',
    settingId: 'general-safety',
    labelKey: 'generalSafetyTitle',
    keywords: 'confirm delete trash auto purge retention silme onay cop kutusu',
  },
  {
    id: 'shortcuts-global',
    tab: 'shortcuts',
    settingId: 'shortcuts-global',
    labelKey: 'shortcutGlobalQuickAdd',
    keywords: 'hotkey shortcut ctrl alt voice quick add conflict kisayol tus',
  },
  {
    id: 'shortcuts-inapp',
    tab: 'shortcuts',
    settingId: 'shortcuts-inapp',
    labelKey: 'keyboardShortcutsTitle',
    keywords: 'keybind kanban calendar matrix search reorder kisayol',
  },
  {
    id: 'notif-profiles',
    tab: 'notifications',
    settingId: 'notif-profiles',
    labelKey: 'notificationsProfilesTitle',
    keywords: 'notification reminder lead time desktop toast bildirim hatirlatma',
  },
  {
    id: 'notif-quiet-digest',
    tab: 'notifications',
    settingId: 'notif-quiet-digest',
    labelKey: 'notifQuietHoursTitle',
    keywords: 'quiet hours dnd do not disturb digest sound windows sessiz saat ozet',
  },
  {
    id: 'ai-tier',
    tab: 'ai',
    settingId: 'ai-tier',
    labelKey: 'settingsTabAi',
    keywords: 'ai llm ollama lm studio whisper qwen rag model gpu vram yapay zeka',
  },
  {
    id: 'ai-voice',
    tab: 'ai',
    settingId: 'ai-voice',
    labelKey: 'aiVoiceControlsTitle',
    keywords: 'microphone mic piper tts rnnoise vad dictation chime ses dikte mikrofon',
  },
  {
    id: 'data-cloud',
    tab: 'data',
    settingId: 'data-cloud',
    labelKey: 'cloudSyncSectionTitle',
    keywords: 'onedrive google drive icloud dropbox cloud sync snapshot history bulut yedek',
  },
  {
    id: 'data-export-import',
    tab: 'data',
    settingId: 'data-export-import',
    labelKey: 'backupRestoreTitle',
    keywords: 'export import json csv markdown ics icalendar encrypt aes backup yedekle',
  },
  {
    id: 'data-reset',
    tab: 'data',
    settingId: 'data-reset',
    labelKey: 'resetDataSectionTitle',
    keywords: 'reset factory clean start wipe sifirla',
  },
  {
    id: 'trash-main',
    tab: 'trash',
    settingId: 'trash-main',
    labelKey: 'tabTrash',
    keywords: 'trash restore deleted empty bulk cop kutusu geri yukle',
  },
  {
    id: 'docs-main',
    tab: 'docs',
    settingId: 'docs-main',
    labelKey: 'settingsTabDocs',
    keywords: 'docs cli mcp claude cursor vscode rest api sse playground syntax dokuman',
  },
  {
    id: 'webhooks-main',
    tab: 'webhooks',
    settingId: 'webhooks-main',
    labelKey: 'settingsTabWebhooks',
    keywords: 'webhook discord slack hmac incoming outgoing outbox logs',
  },
  {
    id: 'legal-main',
    tab: 'legal',
    settingId: 'legal-main',
    labelKey: 'settingsTabLegal',
    keywords: 'privacy gdpr kvkk terms license mit opensource accessibility gizlilik lisans',
  },
  {
    id: 'about-updates',
    tab: 'about',
    settingId: 'about-updates',
    labelKey: 'updatesSectionTitle',
    keywords: 'version update changelog diagnostics bug report logs folder hakkinda guncelleme',
  },
];
