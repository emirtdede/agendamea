import { api } from '../api/client';
import { readInitialLanguage } from '../i18n/I18nContext';
import { isValidLanguageCode, type LanguageCode, resolveSystemLanguage } from '../i18n/languages';
import type {
  AppIconId,
  AppSettings,
  CloseBehavior,
  CompletedTaskBehavior,
  CompletionSoundPreset,
  DefaultStartupView,
  FontFamilyPreset,
  LayoutMode,
  ListDensity,
  Priority,
  ThemeId,
  ThemeMode,
  TimeFormatPreference,
  TrashAutoPurgeDays,
  WeekStartDay,
} from '../types';
import {
  clampZoomPercent,
  isValidAppIconId,
  isValidThemeId,
  normalizeHexColor,
} from '../utils/themes';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';
import { reportStoreError } from './storeErrorBus';

export interface PreferencesStoreState {
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  recentCustomColors: string[];
  appIconId: AppIconId;
  customIconColor: string;
  listDensity: ListDensity;
  fontFamily: FontFamilyPreset;
  zoomPercent: number;
  highContrast: boolean;
  reducedMotion: boolean;
  colorBlindShapes: boolean;
  strongFocusRing: boolean;
  closeBehavior: CloseBehavior;
  launchAtStartup: boolean;
  launchMinimizedToTray: boolean;
  weekStartsOn: WeekStartDay;
  timeFormat: TimeFormatPreference;
  defaultStartupView: DefaultStartupView;
  defaultLayoutMode: LayoutMode;
  defaultPriority: Priority;
  completedTaskBehavior: CompletedTaskBehavior;
  completionSound: CompletionSoundPreset;
  confirmBeforeDelete: boolean;
  trashAutoPurgeDays: TrashAutoPurgeDays;
  dragLocked: boolean;
  language: LanguageCode;
  sidebarCollapsed: boolean;
}

export interface PreferencesStore extends SelectorStore<PreferencesStoreState> {
  consumeIconDirty: () => boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setThemeId: (id: ThemeId) => void;
  setCustomThemeColor: (rawHex: string) => void;
  setAppIconId: (id: AppIconId) => void;
  setCustomIconColor: (rawHex: string) => void;
  setListDensity: (density: ListDensity) => void;
  setFontFamily: (font: FontFamilyPreset) => void;
  resetAppearance: () => void;
  setZoomPercent: (zoom: number, options?: { silentError?: boolean }) => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setColorBlindShapes: (enabled: boolean) => void;
  setStrongFocusRing: (enabled: boolean) => void;
  resetAccessibility: () => void;
  setCloseBehavior: (behavior: CloseBehavior, options?: { persist?: boolean }) => Promise<void>;
  setLaunchAtStartup: (enabled: boolean) => void;
  setLaunchMinimizedToTray: (enabled: boolean) => void;
  setWeekStartsOn: (day: WeekStartDay) => void;
  setTimeFormat: (fmt: TimeFormatPreference) => void;
  setDefaultStartupView: (view: DefaultStartupView) => void;
  setDefaultLayoutMode: (mode: LayoutMode) => void;
  setDefaultPriority: (prio: Priority) => void;
  setCompletedTaskBehavior: (behavior: CompletedTaskBehavior) => void;
  setCompletionSound: (sound: CompletionSoundPreset) => void;
  setConfirmBeforeDelete: (enabled: boolean) => void;
  setTrashAutoPurgeDays: (days: TrashAutoPurgeDays) => void;
  resetGeneral: () => void;
  setDragLocked: (locked: boolean, onRollback?: () => void) => void;
  setLanguage: (nextLang: LanguageCode) => void;
  toggleSidebarCollapsed: () => void;
  expandSidebarIfCollapsed: () => boolean;
  syncFromBootstrap: (
    settings: AppSettings,
    options?: { fromExternalSse?: boolean },
  ) => Promise<void>;
  applyRestored: (settings: AppSettings) => void;
  disposeTimers: () => void;
}

export function readInitialTheme(): {
  mode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  hasStoredPreference: boolean;
} {
  try {
    const savedMode = localStorage.getItem('agendamea-theme-mode');
    const savedId = localStorage.getItem('agendamea-theme-id');
    const savedCustom = normalizeHexColor(
      localStorage.getItem('agendamea-custom-theme-color') ?? '',
    );
    const hasMode = savedMode === 'light' || savedMode === 'dark' || savedMode === 'system';
    const hasId = Boolean(savedId && isValidThemeId(savedId));
    return {
      mode: savedMode === 'dark' ? 'dark' : savedMode === 'system' ? 'system' : 'light',
      themeId: hasId && savedId ? (savedId as ThemeId) : 'obsidian',
      customThemeColor: savedCustom ?? '#2563eb',
      hasStoredPreference: hasMode || hasId,
    };
  } catch {
    return {
      mode: 'light',
      themeId: 'obsidian',
      customThemeColor: '#2563eb',
      hasStoredPreference: false,
    };
  }
}

function readInitialAccessibility(): {
  zoomPercent: number;
  highContrast: boolean;
  reducedMotion: boolean;
} {
  try {
    return {
      zoomPercent: clampZoomPercent(localStorage.getItem('agendamea-zoom-percent') ?? 100),
      highContrast: localStorage.getItem('agendamea-high-contrast') === 'true',
      reducedMotion: localStorage.getItem('agendamea-reduced-motion') === 'true',
    };
  } catch {
    return { zoomPercent: 100, highContrast: false, reducedMotion: false };
  }
}

function readInitialSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem('agendamea-sidebar-collapsed') === 'true';
  } catch {
    return false;
  }
}

function buildInitialPreferencesState(): PreferencesStoreState {
  const initialTheme = readInitialTheme();
  const initialAccessibility = readInitialAccessibility();
  const initialLang = readInitialLanguage();
  return {
    themeMode: initialTheme.mode,
    themeId: initialTheme.themeId,
    customThemeColor: initialTheme.customThemeColor,
    recentCustomColors: [],
    appIconId: 'match-theme',
    customIconColor: '#2563eb',
    listDensity: 'comfortable',
    fontFamily: 'system',
    zoomPercent: initialAccessibility.zoomPercent,
    highContrast: initialAccessibility.highContrast,
    reducedMotion: initialAccessibility.reducedMotion,
    colorBlindShapes: false,
    strongFocusRing: false,
    closeBehavior: 'ask',
    launchAtStartup: false,
    launchMinimizedToTray: false,
    weekStartsOn: 'monday',
    timeFormat: '24h',
    defaultStartupView: 'all',
    defaultLayoutMode: 'list',
    defaultPriority: 'normal',
    completedTaskBehavior: 'bottom',
    completionSound: 'none',
    confirmBeforeDelete: false,
    trashAutoPurgeDays: 0,
    dragLocked: false,
    language: initialLang.code,
    sidebarCollapsed: readInitialSidebarCollapsed(),
  };
}

export function createPreferencesStore(
  persistSettings: (patch: Partial<AppSettings>) => Promise<AppSettings> = (patch) =>
    api.updateSettings(patch),
  onError: (err: unknown) => void = (err) => reportStoreError(err),
): PreferencesStore {
  const initialLangCode = readInitialLanguage().code;
  const base = createSelectorStore<PreferencesStoreState>(buildInitialPreferencesState);

  let themeDirty = false;
  let iconDirty = false;
  let sidebarDirty = false;
  let langDirty = false;
  let customThemeSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let customIconSaveTimer: ReturnType<typeof setTimeout> | null = null;

  const getBridge = () => (typeof window !== 'undefined' ? window.agendameaWindow : undefined);

  const consumeIconDirty = (): boolean => {
    if (!iconDirty) return false;
    iconDirty = false;
    return true;
  };

  const disposeTimers = (): void => {
    if (customThemeSaveTimer !== null) {
      clearTimeout(customThemeSaveTimer);
      customThemeSaveTimer = null;
    }
    if (customIconSaveTimer !== null) {
      clearTimeout(customIconSaveTimer);
      customIconSaveTimer = null;
    }
  };

  const setThemeMode = (nextMode: ThemeMode): void => {
    themeDirty = true;
    iconDirty = true;
    base.patchState({ themeMode: nextMode });
    void persistSettings({ themeMode: nextMode }).catch(onError);
  };

  const setThemeId = (nextId: ThemeId): void => {
    themeDirty = true;
    iconDirty = true;
    base.patchState({ themeId: nextId });
    void persistSettings({ themeId: nextId }).catch(onError);
  };

  const setCustomThemeColor = (rawHex: string): void => {
    const norm = normalizeHexColor(rawHex);
    if (!norm) return;
    themeDirty = true;
    iconDirty = true;
    const prevRecent = base.getState().recentCustomColors;
    const nextRecent = [norm, ...prevRecent.filter((c) => c !== norm)].slice(0, 6);
    base.patchState({ customThemeColor: norm, themeId: 'custom', recentCustomColors: nextRecent });
    if (customThemeSaveTimer !== null) {
      clearTimeout(customThemeSaveTimer);
    }
    customThemeSaveTimer = setTimeout(() => {
      customThemeSaveTimer = null;
      void persistSettings({
        themeId: 'custom',
        customThemeColor: norm,
        recentCustomColors: nextRecent,
      }).catch(onError);
    }, 250);
  };

  const setAppIconId = (nextIconId: AppIconId): void => {
    iconDirty = true;
    base.patchState({ appIconId: nextIconId });
    void persistSettings({ appIconId: nextIconId }).catch(onError);
  };

  const setCustomIconColor = (rawHex: string): void => {
    const norm = normalizeHexColor(rawHex);
    if (!norm) return;
    iconDirty = true;
    base.patchState({ customIconColor: norm, appIconId: 'custom' });
    if (customIconSaveTimer !== null) {
      clearTimeout(customIconSaveTimer);
    }
    customIconSaveTimer = setTimeout(() => {
      customIconSaveTimer = null;
      void persistSettings({ appIconId: 'custom', customIconColor: norm }).catch(onError);
    }, 250);
  };

  const setListDensity = (density: ListDensity): void => {
    base.patchState({ listDensity: density });
    void persistSettings({ listDensity: density }).catch(onError);
  };

  const setFontFamily = (font: FontFamilyPreset): void => {
    base.patchState({ fontFamily: font });
    void persistSettings({ fontFamily: font }).catch(onError);
  };

  const resetAppearance = (): void => {
    themeDirty = true;
    iconDirty = true;
    base.patchState({
      themeMode: 'light',
      themeId: 'obsidian',
      appIconId: 'match-theme',
      listDensity: 'comfortable',
      fontFamily: 'system',
    });
    void persistSettings({
      themeMode: 'light',
      themeId: 'obsidian',
      appIconId: 'match-theme',
      listDensity: 'comfortable',
      fontFamily: 'system',
    }).catch(onError);
  };

  const setZoomPercent = (nextZoom: number, options?: { silentError?: boolean }): void => {
    const clamped = clampZoomPercent(nextZoom);
    base.patchState({ zoomPercent: clamped });
    void persistSettings({ zoomPercent: clamped }).catch((err) => {
      if (!options?.silentError) onError(err);
    });
  };

  const setHighContrast = (enabled: boolean): void => {
    base.patchState({ highContrast: enabled });
    void persistSettings({ highContrast: enabled }).catch(onError);
  };

  const setReducedMotion = (enabled: boolean): void => {
    base.patchState({ reducedMotion: enabled });
    void persistSettings({ reducedMotion: enabled }).catch(onError);
  };

  const setColorBlindShapes = (enabled: boolean): void => {
    base.patchState({ colorBlindShapes: enabled });
    void persistSettings({ colorBlindShapes: enabled }).catch(onError);
  };

  const setStrongFocusRing = (enabled: boolean): void => {
    base.patchState({ strongFocusRing: enabled });
    void persistSettings({ strongFocusRing: enabled }).catch(onError);
  };

  const resetAccessibility = (): void => {
    base.patchState({
      zoomPercent: 100,
      highContrast: false,
      reducedMotion: false,
      colorBlindShapes: false,
      strongFocusRing: false,
    });
    void persistSettings({
      zoomPercent: 100,
      highContrast: false,
      reducedMotion: false,
      colorBlindShapes: false,
      strongFocusRing: false,
    }).catch(onError);
  };

  const setCloseBehavior = async (
    nextBehavior: CloseBehavior,
    options?: { persist?: boolean },
  ): Promise<void> => {
    base.patchState({ closeBehavior: nextBehavior });
    await getBridge()
      ?.setCloseBehavior?.(nextBehavior)
      ?.catch(() => {
        /* ignore */
      });
    if (options?.persist === false) return;
    try {
      await persistSettings({ closeBehavior: nextBehavior });
    } catch (err) {
      onError(err);
    }
  };

  const setLaunchAtStartup = (enabled: boolean): void => {
    base.patchState({ launchAtStartup: enabled });
    void getBridge()
      ?.setLaunchAtStartup?.(enabled, base.getState().launchMinimizedToTray)
      ?.catch(() => {
        /* ignore */
      });
    void persistSettings({ launchAtStartup: enabled }).catch(onError);
  };

  const setLaunchMinimizedToTray = (enabled: boolean): void => {
    base.patchState({ launchMinimizedToTray: enabled });
    void getBridge()
      ?.setLaunchAtStartup?.(base.getState().launchAtStartup, enabled)
      ?.catch(() => {
        /* ignore */
      });
    void persistSettings({ launchMinimizedToTray: enabled }).catch(onError);
  };

  const setWeekStartsOn = (day: WeekStartDay): void => {
    base.patchState({ weekStartsOn: day });
    void persistSettings({ weekStartsOn: day }).catch(onError);
  };

  const setTimeFormat = (fmt: TimeFormatPreference): void => {
    base.patchState({ timeFormat: fmt });
    void persistSettings({ timeFormat: fmt }).catch(onError);
  };

  const setDefaultStartupView = (view: DefaultStartupView): void => {
    base.patchState({ defaultStartupView: view });
    void persistSettings({ defaultStartupView: view }).catch(onError);
  };

  const setDefaultLayoutMode = (mode: LayoutMode): void => {
    base.patchState({ defaultLayoutMode: mode });
    void persistSettings({ defaultLayoutMode: mode }).catch(onError);
  };

  const setDefaultPriority = (prio: Priority): void => {
    base.patchState({ defaultPriority: prio });
    void persistSettings({ defaultPriority: prio }).catch(onError);
  };

  const setCompletedTaskBehavior = (behavior: CompletedTaskBehavior): void => {
    base.patchState({ completedTaskBehavior: behavior });
    void persistSettings({ completedTaskBehavior: behavior }).catch(onError);
  };

  const setCompletionSound = (sound: CompletionSoundPreset): void => {
    base.patchState({ completionSound: sound });
    void persistSettings({ completionSound: sound }).catch(onError);
  };

  const setConfirmBeforeDelete = (enabled: boolean): void => {
    base.patchState({ confirmBeforeDelete: enabled });
    void persistSettings({ confirmBeforeDelete: enabled }).catch(onError);
  };

  const setTrashAutoPurgeDays = (days: TrashAutoPurgeDays): void => {
    base.patchState({ trashAutoPurgeDays: days });
    void persistSettings({ trashAutoPurgeDays: days }).catch(onError);
  };

  const resetGeneral = (): void => {
    base.patchState({
      closeBehavior: 'ask',
      launchAtStartup: false,
      launchMinimizedToTray: false,
      weekStartsOn: 'monday',
      timeFormat: '24h',
      defaultStartupView: 'all',
      defaultLayoutMode: 'list',
      defaultPriority: 'normal',
      completedTaskBehavior: 'bottom',
      completionSound: 'none',
      confirmBeforeDelete: false,
      trashAutoPurgeDays: 0,
      dragLocked: false,
    });
    void getBridge()
      ?.setCloseBehavior?.('ask')
      ?.catch(() => {
        /* ignore */
      });
    void getBridge()
      ?.setLaunchAtStartup?.(false, false)
      ?.catch(() => {
        /* ignore */
      });
    void persistSettings({
      closeBehavior: 'ask',
      launchAtStartup: false,
      launchMinimizedToTray: false,
      weekStartsOn: 'monday',
      timeFormat: '24h',
      defaultStartupView: 'all',
      defaultLayoutMode: 'list',
      defaultPriority: 'normal',
      completedTaskBehavior: 'bottom',
      completionSound: 'none',
      confirmBeforeDelete: false,
      trashAutoPurgeDays: 0,
      dragLocked: false,
    }).catch(onError);
  };

  const setDragLocked = (locked: boolean, onRollback?: () => void): void => {
    base.patchState({ dragLocked: locked });
    void persistSettings({ dragLocked: locked }).catch((err) => {
      onError(err);
      onRollback?.();
    });
  };

  const setLanguage = (nextLang: LanguageCode): void => {
    langDirty = true;
    base.patchState({ language: nextLang });
    try {
      localStorage.setItem('agendamea-language-customized', 'true');
    } catch {
      // Ignore storage write errors
    }
    void persistSettings({ language: nextLang }).catch(onError);
  };

  const toggleSidebarCollapsed = (): void => {
    sidebarDirty = true;
    const next = !base.getState().sidebarCollapsed;
    base.patchState({ sidebarCollapsed: next });
    try {
      localStorage.setItem('agendamea-sidebar-collapsed', String(next));
    } catch {
      // Ignore storage errors
    }
    void persistSettings({ sidebarCollapsed: next }).catch(() => {
      /* ignore */
    });
  };

  const expandSidebarIfCollapsed = (): boolean => {
    if (!base.getState().sidebarCollapsed) return false;
    sidebarDirty = true;
    base.patchState({ sidebarCollapsed: false });
    try {
      localStorage.setItem('agendamea-sidebar-collapsed', 'false');
    } catch {
      // Ignore storage errors
    }
    void persistSettings({ sidebarCollapsed: false }).catch(() => {
      /* ignore */
    });
    return true;
  };

  const syncFromBootstrap = async (
    settings: AppSettings,
    options?: { fromExternalSse?: boolean },
  ): Promise<void> => {
    const fromExternalSse = Boolean(options?.fromExternalSse);
    const patch: Partial<PreferencesStoreState> = {
      dragLocked: Boolean(settings.dragLocked),
    };

    if (settings.customThemeColor) {
      const norm = normalizeHexColor(settings.customThemeColor);
      if (norm) patch.customThemeColor = norm;
    }
    if (settings.appIconId && isValidAppIconId(settings.appIconId)) {
      patch.appIconId = settings.appIconId;
    }
    if (settings.customIconColor) {
      const norm = normalizeHexColor(settings.customIconColor);
      if (norm) patch.customIconColor = norm;
    }
    if (typeof settings.zoomPercent === 'number') {
      patch.zoomPercent = clampZoomPercent(settings.zoomPercent);
    }
    if (typeof settings.highContrast === 'boolean') {
      patch.highContrast = settings.highContrast;
    }
    if (typeof settings.reducedMotion === 'boolean') {
      patch.reducedMotion = settings.reducedMotion;
    }
    if (
      settings.closeBehavior === 'ask' ||
      settings.closeBehavior === 'tray' ||
      settings.closeBehavior === 'quit'
    ) {
      patch.closeBehavior = settings.closeBehavior;
    }
    if (typeof settings.launchAtStartup === 'boolean') {
      patch.launchAtStartup = settings.launchAtStartup;
      void getBridge()
        ?.setLaunchAtStartup?.(settings.launchAtStartup, Boolean(settings.launchMinimizedToTray))
        ?.catch(() => {
          /* ignore */
        });
    }
    if (typeof settings.launchMinimizedToTray === 'boolean') {
      patch.launchMinimizedToTray = settings.launchMinimizedToTray;
    }
    if (settings.listDensity) patch.listDensity = settings.listDensity;
    if (settings.fontFamily) patch.fontFamily = settings.fontFamily;
    if (Array.isArray(settings.recentCustomColors)) {
      patch.recentCustomColors = settings.recentCustomColors.slice(0, 6);
    }
    if (typeof settings.colorBlindShapes === 'boolean') {
      patch.colorBlindShapes = settings.colorBlindShapes;
    }
    if (typeof settings.strongFocusRing === 'boolean') {
      patch.strongFocusRing = settings.strongFocusRing;
    }
    if (settings.weekStartsOn) patch.weekStartsOn = settings.weekStartsOn;
    if (settings.timeFormat) patch.timeFormat = settings.timeFormat;
    if (settings.defaultStartupView) patch.defaultStartupView = settings.defaultStartupView;
    if (settings.defaultLayoutMode) patch.defaultLayoutMode = settings.defaultLayoutMode;
    if (settings.defaultPriority) patch.defaultPriority = settings.defaultPriority;
    if (settings.completedTaskBehavior) {
      patch.completedTaskBehavior = settings.completedTaskBehavior;
    }
    if (settings.completionSound) patch.completionSound = settings.completionSound;
    if (typeof settings.confirmBeforeDelete === 'boolean') {
      patch.confirmBeforeDelete = settings.confirmBeforeDelete;
    }
    if (
      settings.trashAutoPurgeDays === 0 ||
      settings.trashAutoPurgeDays === 7 ||
      settings.trashAutoPurgeDays === 30 ||
      settings.trashAutoPurgeDays === 90
    ) {
      patch.trashAutoPurgeDays = settings.trashAutoPurgeDays;
    }

    if (fromExternalSse && settings.language && isValidLanguageCode(settings.language)) {
      langDirty = false;
      patch.language = settings.language;
      try {
        localStorage.setItem('agendamea-language-customized', 'true');
      } catch {
        // Ignore storage write errors
      }
    } else if (!langDirty && settings.language && isValidLanguageCode(settings.language)) {
      let hasCustomLang = false;
      try {
        hasCustomLang = localStorage.getItem('agendamea-language-customized') === 'true';
      } catch {
        // Ignore storage read errors
      }
      let nativeLocale: {
        installerLocale: string | null;
        osLocale: string;
        preferred: string;
      } | null = null;
      try {
        nativeLocale = (await getBridge()?.getInitialLocale?.()) ?? null;
      } catch {
        // Fall back to navigator language
      }

      if (nativeLocale?.installerLocale && !hasCustomLang) {
        const setupLang = resolveSystemLanguage([nativeLocale.installerLocale], 'en');
        patch.language = setupLang;
        try {
          localStorage.setItem('agendamea-language-customized', 'true');
        } catch {
          // Ignore storage write errors
        }
        if (settings.language !== setupLang) {
          void persistSettings({ language: setupLang }).catch(() => {
            /* ignore */
          });
        }
      } else if (!hasCustomLang) {
        let resolvedInitial: LanguageCode = initialLangCode;
        if (nativeLocale?.osLocale) {
          resolvedInitial = resolveSystemLanguage([nativeLocale.osLocale], 'en');
        }
        if (settings.language === 'tr' && resolvedInitial !== 'tr') {
          patch.language = resolvedInitial;
          try {
            localStorage.setItem('agendamea-language-customized', 'true');
          } catch {
            // Ignore storage write errors
          }
          void persistSettings({ language: resolvedInitial }).catch(() => {
            /* ignore */
          });
        } else {
          patch.language = settings.language;
        }
      } else {
        patch.language = settings.language;
      }
    }

    if (fromExternalSse || !sidebarDirty) {
      if (fromExternalSse) sidebarDirty = false;
      const dbCollapsed = Boolean(settings.sidebarCollapsed);
      patch.sidebarCollapsed = dbCollapsed;
      try {
        localStorage.setItem('agendamea-sidebar-collapsed', String(dbCollapsed));
      } catch {
        // Ignore storage errors
      }
    }

    if (fromExternalSse) {
      themeDirty = false;
      patch.themeMode = settings.themeMode;
      patch.themeId = settings.themeId;
    } else if (!themeDirty) {
      const storedTheme = readInitialTheme();
      if (!settings.themeCustomized && storedTheme.hasStoredPreference) {
        patch.themeMode = storedTheme.mode;
        patch.themeId = storedTheme.themeId;
        void persistSettings({
          themeMode: storedTheme.mode,
          themeId: storedTheme.themeId,
        }).catch(() => {
          /* ignore */
        });
      } else {
        patch.themeMode = settings.themeMode;
        patch.themeId = settings.themeId;
      }
    }

    base.patchState(patch);
  };

  const applyRestored = (settings: AppSettings): void => {
    themeDirty = false;
    sidebarDirty = false;
    langDirty = false;
    const nextCollapsed = Boolean(settings.sidebarCollapsed);
    try {
      localStorage.setItem('agendamea-sidebar-collapsed', String(nextCollapsed));
    } catch {
      // Ignore storage errors
    }
    const nextCloseBehavior: CloseBehavior =
      settings.closeBehavior === 'tray' || settings.closeBehavior === 'quit'
        ? settings.closeBehavior
        : 'ask';
    const nextLaunchAtStartup = Boolean(settings.launchAtStartup);
    const nextLaunchMinimizedToTray = Boolean(settings.launchMinimizedToTray);
    void getBridge()
      ?.setCloseBehavior?.(nextCloseBehavior)
      ?.catch(() => {
        /* ignore */
      });
    void getBridge()
      ?.setLaunchAtStartup?.(nextLaunchAtStartup, nextLaunchMinimizedToTray)
      ?.catch(() => {
        /* ignore */
      });

    base.patchState({
      themeMode: settings.themeMode,
      themeId: settings.themeId,
      customThemeColor:
        (settings.customThemeColor && normalizeHexColor(settings.customThemeColor)) || '#2563eb',
      recentCustomColors: Array.isArray(settings.recentCustomColors)
        ? settings.recentCustomColors.slice(0, 6)
        : [],
      appIconId:
        settings.appIconId && isValidAppIconId(settings.appIconId)
          ? settings.appIconId
          : 'match-theme',
      customIconColor:
        (settings.customIconColor && normalizeHexColor(settings.customIconColor)) || '#2563eb',
      listDensity: settings.listDensity ?? 'comfortable',
      fontFamily: settings.fontFamily ?? 'system',
      zoomPercent:
        typeof settings.zoomPercent === 'number' ? clampZoomPercent(settings.zoomPercent) : 100,
      highContrast: Boolean(settings.highContrast),
      reducedMotion: Boolean(settings.reducedMotion),
      colorBlindShapes: Boolean(settings.colorBlindShapes),
      strongFocusRing: Boolean(settings.strongFocusRing),
      closeBehavior: nextCloseBehavior,
      launchAtStartup: nextLaunchAtStartup,
      launchMinimizedToTray: Boolean(settings.launchMinimizedToTray),
      weekStartsOn: settings.weekStartsOn ?? 'monday',
      timeFormat: settings.timeFormat ?? '24h',
      defaultStartupView: settings.defaultStartupView ?? 'all',
      defaultLayoutMode: settings.defaultLayoutMode ?? 'list',
      defaultPriority: settings.defaultPriority ?? 'normal',
      completedTaskBehavior: settings.completedTaskBehavior ?? 'bottom',
      completionSound: settings.completionSound ?? 'none',
      confirmBeforeDelete: Boolean(settings.confirmBeforeDelete),
      trashAutoPurgeDays: settings.trashAutoPurgeDays ?? 0,
      dragLocked: Boolean(settings.dragLocked),
      language:
        settings.language && isValidLanguageCode(settings.language)
          ? settings.language
          : base.getState().language,
      sidebarCollapsed: nextCollapsed,
    });
  };

  const reset = (): void => {
    disposeTimers();
    themeDirty = false;
    iconDirty = false;
    sidebarDirty = false;
    langDirty = false;
    base.reset();
  };

  return {
    ...base,
    reset,
    consumeIconDirty,
    setThemeMode,
    setThemeId,
    setCustomThemeColor,
    setAppIconId,
    setCustomIconColor,
    setListDensity,
    setFontFamily,
    resetAppearance,
    setZoomPercent,
    setHighContrast,
    setReducedMotion,
    setColorBlindShapes,
    setStrongFocusRing,
    resetAccessibility,
    setCloseBehavior,
    setLaunchAtStartup,
    setLaunchMinimizedToTray,
    setWeekStartsOn,
    setTimeFormat,
    setDefaultStartupView,
    setDefaultLayoutMode,
    setDefaultPriority,
    setCompletedTaskBehavior,
    setCompletionSound,
    setConfirmBeforeDelete,
    setTrashAutoPurgeDays,
    resetGeneral,
    setDragLocked,
    setLanguage,
    toggleSidebarCollapsed,
    expandSidebarIfCollapsed,
    syncFromBootstrap,
    applyRestored,
    disposeTimers,
  };
}

export const preferencesStore = createPreferencesStore();

export function usePreferencesSelector<S>(
  selector: (state: PreferencesStoreState) => S,
  isEqual: EqualityFn<S> = shallowEqual,
): S {
  return useSelectorStore(preferencesStore, selector, isEqual);
}
