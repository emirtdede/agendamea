import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { readInitialLanguage } from '../i18n/I18nContext';
import {
  getLanguageMeta,
  isValidLanguageCode,
  resolveSystemLanguage,
  type LanguageCode,
} from '../i18n/languages';
import { getDictionary } from '../i18n/localesWorld';
import type { AppIconId, AppSettings, CloseBehavior, ThemeId, ThemeMode } from '../types';
import {
  applyAccessibilityToDocument,
  applyAppIconTokensToDocument,
  applyThemeToDocument,
  clampZoomPercent,
  isValidAppIconId,
  isValidThemeId,
  normalizeHexColor,
  resolveAppIconColors,
} from '../utils/themes';

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

export function useThemeAndPreferences() {
  const initialTheme = useMemo(() => readInitialTheme(), []);
  const initialAccessibility = useMemo(() => readInitialAccessibility(), []);
  const initialLang = useMemo(() => readInitialLanguage(), []);

  const [themeMode, setThemeMode] = useState<ThemeMode>(initialTheme.mode);
  const [themeId, setThemeId] = useState<ThemeId>(initialTheme.themeId);
  const [customThemeColor, setCustomThemeColor] = useState<string>(initialTheme.customThemeColor);
  const [appIconId, setAppIconId] = useState<AppIconId>('match-theme');
  const [customIconColor, setCustomIconColor] = useState<string>('#2563eb');
  const [zoomPercent, setZoomPercent] = useState<number>(initialAccessibility.zoomPercent);
  const [highContrast, setHighContrast] = useState<boolean>(initialAccessibility.highContrast);
  const [reducedMotion, setReducedMotion] = useState<boolean>(initialAccessibility.reducedMotion);
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>('ask');
  const [launchAtStartup, setLaunchAtStartup] = useState<boolean>(false);
  const [globalQuickAddShortcut, setGlobalQuickAddShortcut] = useState<boolean>(true);
  const [language, setLanguage] = useState<LanguageCode>(initialLang.code);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    readInitialSidebarCollapsed(),
  );
  const [systemDarkTick, setSystemDarkTick] = useState(0);

  const iconInitializedRef = useRef(false);
  const iconDirtyRef = useRef(false);
  const themeDirtyRef = useRef(false);
  const sidebarDirtyRef = useRef(false);
  const langDirtyRef = useRef(false);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  sidebarCollapsedRef.current = sidebarCollapsed;

  const langMeta = useMemo(() => getLanguageMeta(language), [language]);
  const t = useMemo(() => getDictionary(language), [language]);
  const langRef = useRef(language);
  langRef.current = language;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (
      themeMode !== 'system' ||
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDarkTick((n) => n + 1);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
  }, [themeMode]);

  useEffect(() => {
    applyThemeToDocument(themeId, themeMode, customThemeColor);
  }, [themeId, themeMode, customThemeColor, systemDarkTick]);

  // Synchronize active App Icon across BrandMark, Window, Taskbar, System Tray & Windows Shortcuts
  useEffect(() => {
    const colors = resolveAppIconColors(
      appIconId,
      themeId,
      themeMode,
      customThemeColor,
      customIconColor,
    );
    applyAppIconTokensToDocument(colors);
    try {
      localStorage.setItem('agendamea-app-icon-tokens', JSON.stringify(colors));
    } catch {
      // Ignore storage restrictions
    }
    const shouldUpdateShortcuts = iconDirtyRef.current;
    if (iconInitializedRef.current || iconDirtyRef.current) {
      iconDirtyRef.current = false;
      void window.agendameaWindow
        ?.applyAppIcon?.({
          bg: colors.bg,
          fg: colors.fg,
          updateShortcuts: shouldUpdateShortcuts,
        })
        ?.catch(() => {});
    } else {
      iconInitializedRef.current = true;
    }
  }, [appIconId, customIconColor, themeId, themeMode, customThemeColor, systemDarkTick]);

  useEffect(() => {
    applyAccessibilityToDocument({ zoomPercent, highContrast, reducedMotion });
  }, [zoomPercent, highContrast, reducedMotion]);

  useEffect(() => {
    void window.agendameaWindow
      ?.updateTrayLabels?.({
        openLabel: t.trayOpenApp,
        newTaskLabel: t.addFirstTaskButton,
        dictateLabel: t.overlayTrayMenuDictate,
        todayLabel: t.today,
        importantLabel: t.important,
        quitLabel: t.closeActionQuitTitle,
      })
      ?.catch(() => {});
  }, [
    t.trayOpenApp,
    t.addFirstTaskButton,
    t.overlayTrayMenuDictate,
    t.today,
    t.important,
    t.closeActionQuitTitle,
  ]);

  useEffect(() => {
    void window.agendameaWindow?.setCloseBehavior?.(closeBehavior)?.catch(() => {});
  }, [closeBehavior]);

  const syncFromBootstrapSettings = useCallback(
    async (settings: AppSettings, options?: { fromExternalSse?: boolean }) => {
      const fromExternalSse = Boolean(options?.fromExternalSse);
      if (settings.customThemeColor) {
        const norm = normalizeHexColor(settings.customThemeColor);
        if (norm) setCustomThemeColor(norm);
      }
      if (settings.appIconId && isValidAppIconId(settings.appIconId)) {
        setAppIconId(settings.appIconId);
      }
      if (settings.customIconColor) {
        const norm = normalizeHexColor(settings.customIconColor);
        if (norm) setCustomIconColor(norm);
      }
      if (typeof settings.zoomPercent === 'number') {
        setZoomPercent(clampZoomPercent(settings.zoomPercent));
      }
      if (typeof settings.highContrast === 'boolean') {
        setHighContrast(settings.highContrast);
      }
      if (typeof settings.reducedMotion === 'boolean') {
        setReducedMotion(settings.reducedMotion);
      }
      if (
        settings.closeBehavior === 'ask' ||
        settings.closeBehavior === 'tray' ||
        settings.closeBehavior === 'quit'
      ) {
        setCloseBehavior(settings.closeBehavior);
      }
      if (typeof settings.launchAtStartup === 'boolean') {
        setLaunchAtStartup(settings.launchAtStartup);
        void window.agendameaWindow
          ?.setLaunchAtStartup?.(settings.launchAtStartup)
          ?.catch(() => {});
      }
      if (typeof settings.globalQuickAddShortcut === 'boolean') {
        setGlobalQuickAddShortcut(settings.globalQuickAddShortcut);
        void window.agendameaWindow
          ?.setGlobalQuickAddShortcut?.(settings.globalQuickAddShortcut)
          ?.catch(() => {});
      }
      if (typeof settings.voiceShortcut === 'string' && settings.voiceShortcut.trim()) {
        void window.agendameaWindow
          ?.setVoiceShortcut?.(settings.voiceShortcut.trim())
          ?.catch(() => {});
      }
      if (
        typeof settings.globalQuickAddShortcutKey === 'string' &&
        settings.globalQuickAddShortcutKey.trim()
      ) {
        void window.agendameaWindow
          ?.setGlobalQuickAddShortcutKey?.(settings.globalQuickAddShortcutKey.trim())
          ?.catch(() => {});
      }

      if (fromExternalSse && settings.language && isValidLanguageCode(settings.language)) {
        langDirtyRef.current = false;
        setLanguage(settings.language);
        try {
          localStorage.setItem('agendamea-language-customized', 'true');
        } catch {
          // Ignore storage write errors
        }
      } else if (!langDirtyRef.current && settings.language && isValidLanguageCode(settings.language)) {
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
          nativeLocale = (await window.agendameaWindow?.getInitialLocale?.()) ?? null;
        } catch {
          // Fall back to navigator language
        }

        if (nativeLocale?.installerLocale) {
          const setupLang = resolveSystemLanguage([nativeLocale.installerLocale], 'en');
          setLanguage(setupLang);
          try {
            localStorage.setItem('agendamea-language-customized', 'true');
          } catch {
            // Ignore storage write errors
          }
          if (settings.language !== setupLang) {
            void api.updateSettings({ language: setupLang }).catch(() => {});
          }
        } else if (!hasCustomLang) {
          let resolvedInitial: LanguageCode = initialLang.code;
          if (nativeLocale?.osLocale) {
            resolvedInitial = resolveSystemLanguage([nativeLocale.osLocale], 'en');
          }
          if (settings.language === 'tr' && resolvedInitial !== 'tr') {
            setLanguage(resolvedInitial);
            try {
              localStorage.setItem('agendamea-language-customized', 'true');
            } catch {
              // Ignore storage write errors
            }
            void api.updateSettings({ language: resolvedInitial }).catch(() => {});
          } else {
            setLanguage(settings.language);
          }
        } else {
          setLanguage(settings.language);
        }
      }

      if (fromExternalSse || !sidebarDirtyRef.current) {
        if (fromExternalSse) sidebarDirtyRef.current = false;
        const dbCollapsed = Boolean(settings.sidebarCollapsed);
        setSidebarCollapsed(dbCollapsed);
        try {
          localStorage.setItem('agendamea-sidebar-collapsed', String(dbCollapsed));
        } catch {
          // Ignore storage errors
        }
      }

      if (fromExternalSse) {
        themeDirtyRef.current = false;
        setThemeMode(settings.themeMode);
        setThemeId(settings.themeId);
      } else if (!themeDirtyRef.current) {
        const storedTheme = readInitialTheme();
        if (!settings.themeCustomized && storedTheme.hasStoredPreference) {
          setThemeMode(storedTheme.mode);
          setThemeId(storedTheme.themeId);
          void api
            .updateSettings({ themeMode: storedTheme.mode, themeId: storedTheme.themeId })
            .catch(() => {});
        } else {
          setThemeMode(settings.themeMode);
          setThemeId(settings.themeId);
        }
      }
    },
    [initialLang.code],
  );

  const applyRestoredSettings = useCallback((settings: AppSettings) => {
    themeDirtyRef.current = false;
    sidebarDirtyRef.current = false;
    langDirtyRef.current = false;
    const nextCollapsed = Boolean(settings.sidebarCollapsed);
    try {
      localStorage.setItem('agendamea-sidebar-collapsed', String(nextCollapsed));
    } catch {
      // Ignore storage errors
    }
    setThemeMode(settings.themeMode);
    setThemeId(settings.themeId);
    setCustomThemeColor(
      (settings.customThemeColor && normalizeHexColor(settings.customThemeColor)) || '#2563eb',
    );
    setAppIconId(
      settings.appIconId && isValidAppIconId(settings.appIconId)
        ? settings.appIconId
        : 'match-theme',
    );
    setCustomIconColor(
      (settings.customIconColor && normalizeHexColor(settings.customIconColor)) || '#2563eb',
    );
    setZoomPercent(
      typeof settings.zoomPercent === 'number' ? clampZoomPercent(settings.zoomPercent) : 100,
    );
    setHighContrast(Boolean(settings.highContrast));
    setReducedMotion(Boolean(settings.reducedMotion));
    const nextCloseBehavior: CloseBehavior =
      settings.closeBehavior === 'tray' || settings.closeBehavior === 'quit'
        ? settings.closeBehavior
        : 'ask';
    setCloseBehavior(nextCloseBehavior);
    void window.agendameaWindow?.setCloseBehavior?.(nextCloseBehavior)?.catch(() => {});
    const nextLaunchAtStartup = Boolean(settings.launchAtStartup);
    setLaunchAtStartup(nextLaunchAtStartup);
    void window.agendameaWindow?.setLaunchAtStartup?.(nextLaunchAtStartup)?.catch(() => {});
    const nextGlobalQuickAdd =
      settings.globalQuickAddShortcut === undefined
        ? true
        : Boolean(settings.globalQuickAddShortcut);
    setGlobalQuickAddShortcut(nextGlobalQuickAdd);
    void window.agendameaWindow?.setGlobalQuickAddShortcut?.(nextGlobalQuickAdd)?.catch(() => {});
    const nextVoiceShortcut =
      typeof settings.voiceShortcut === 'string' && settings.voiceShortcut.trim()
        ? settings.voiceShortcut.trim()
        : 'CommandOrControl+Alt+Space';
    void window.agendameaWindow?.setVoiceShortcut?.(nextVoiceShortcut)?.catch(() => {});
    const nextQuickAddKey =
      typeof settings.globalQuickAddShortcutKey === 'string' &&
      settings.globalQuickAddShortcutKey.trim()
        ? settings.globalQuickAddShortcutKey.trim()
        : 'CommandOrControl+Alt+N';
    void window.agendameaWindow?.setGlobalQuickAddShortcutKey?.(nextQuickAddKey)?.catch(() => {});
    if (settings.language && isValidLanguageCode(settings.language)) {
      setLanguage(settings.language);
    }
    setSidebarCollapsed(nextCollapsed);
  }, []);

  const handleToggleSidebarCollapse = useCallback(() => {
    sidebarDirtyRef.current = true;
    const next = !sidebarCollapsedRef.current;
    sidebarCollapsedRef.current = next;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem('agendamea-sidebar-collapsed', String(next));
    } catch {
      // Ignore storage errors
    }
    void api.updateSettings({ sidebarCollapsed: next }).catch(() => {});
  }, []);

  const expandSidebarIfCollapsed = useCallback((): boolean => {
    if (!sidebarCollapsedRef.current) return false;
    sidebarDirtyRef.current = true;
    sidebarCollapsedRef.current = false;
    setSidebarCollapsed(false);
    try {
      localStorage.setItem('agendamea-sidebar-collapsed', 'false');
    } catch {
      // Ignore storage errors
    }
    void api.updateSettings({ sidebarCollapsed: false }).catch(() => {});
    return true;
  }, []);

  return {
    themeMode,
    setThemeMode,
    themeId,
    setThemeId,
    customThemeColor,
    setCustomThemeColor,
    appIconId,
    setAppIconId,
    customIconColor,
    setCustomIconColor,
    zoomPercent,
    setZoomPercent,
    highContrast,
    setHighContrast,
    reducedMotion,
    setReducedMotion,
    closeBehavior,
    setCloseBehavior,
    launchAtStartup,
    setLaunchAtStartup,
    globalQuickAddShortcut,
    setGlobalQuickAddShortcut,
    language,
    setLanguage,
    sidebarCollapsed,
    langMeta,
    t,
    langRef,
    tRef,
    themeDirtyRef,
    iconDirtyRef,
    langDirtyRef,
    syncFromBootstrapSettings,
    applyRestoredSettings,
    handleToggleSidebarCollapse,
    expandSidebarIfCollapsed,
  };
}
