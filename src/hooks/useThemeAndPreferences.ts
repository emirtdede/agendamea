import { useEffect, useMemo, useRef } from 'react';
import { getLanguageMeta } from '../i18n/languages';
import { useResolvedLocaleBundle } from '../i18n/localeLoader';
import {
  preferencesStore,
  readInitialTheme,
  usePreferencesSelector,
} from '../store/preferencesStore';
import {
  applyAccessibilityToDocument,
  applyAppIconTokensToDocument,
  applyThemeToDocument,
  resolveAppIconColors,
} from '../utils/themes';

export { readInitialTheme };

/**
 * Narrow App-shell preferences bridge backed directly by preferencesStore.
 * Subscribes App.tsx ONLY to the 3 primitives it actually renders (language,
 * sidebarCollapsed, dragLocked), while DOM theme/icon/accessibility/closeBehavior
 * side-effects run imperatively via store subscription with ZERO App.tsx re-renders.
 */
export function useThemeAndPreferences() {
  const language = usePreferencesSelector((s) => s.language, Object.is);
  const pendingLanguage = usePreferencesSelector((s) => s.pendingLanguage, Object.is);
  const sidebarCollapsed = usePreferencesSelector((s) => s.sidebarCollapsed, Object.is);
  const dragLocked = usePreferencesSelector((s) => s.dragLocked, Object.is);

  const langMeta = useMemo(() => getLanguageMeta(language), [language]);
  const { dict: t } = useResolvedLocaleBundle(language);
  const langRef = useRef(language);
  langRef.current = language;
  const tRef = useRef(t);
  tRef.current = t;

  // Imperative DOM & Electron bridge sync (causes ZERO React re-renders in App.tsx)
  useEffect(() => {
    let iconInitialized = false;
    let pendingIconShortcuts = false;
    let iconApplyTimer: number | null = null;
    let prevThemeKey = '';
    let prevIconKey = '';
    let prevA11yKey = '';
    let prevCloseBehavior = '';
    let systemMql: MediaQueryList | null = null;

    const applyIconAndTheme = (forceSystemTick = false) => {
      const s = preferencesStore.getState();
      const themeKey = `${s.themeId}|${s.themeMode}|${s.customThemeColor}`;
      if (forceSystemTick || themeKey !== prevThemeKey) {
        prevThemeKey = themeKey;
        applyThemeToDocument(s.themeId, s.themeMode, s.customThemeColor);
        void window.agendameaWindow?.setWindowThemeMode?.(s.themeMode)?.catch(() => {
          /* ignore */
        });
      }

      const iconKey = `${s.appIconId}|${s.customIconColor}|${themeKey}`;
      if (forceSystemTick || iconKey !== prevIconKey) {
        prevIconKey = iconKey;
        const colors = resolveAppIconColors(
          s.appIconId,
          s.themeId,
          s.themeMode,
          s.customThemeColor,
          s.customIconColor,
        );
        applyAppIconTokensToDocument(colors);
        let legacyWhiteNeedsRepair = false;
        try {
          const prevRaw = localStorage.getItem('agendamea-app-icon-tokens');
          if (prevRaw && s.appIconId === 'match-theme' && s.themeId === 'obsidian') {
            const parsedPrev = JSON.parse(prevRaw) as { bg?: string };
            if (typeof parsedPrev?.bg === 'string' && parsedPrev.bg.toLowerCase() === '#fafafa') {
              legacyWhiteNeedsRepair = true;
            }
          }
          localStorage.setItem('agendamea-app-icon-tokens', JSON.stringify(colors));
        } catch {
          // Ignore storage restrictions
        }
        if (preferencesStore.consumeIconDirty() || legacyWhiteNeedsRepair) {
          pendingIconShortcuts = true;
        }
        if (!iconInitialized && !pendingIconShortcuts) {
          iconInitialized = true;
          void window.agendameaWindow
            ?.applyAppIcon?.({
              bg: colors.bg,
              fg: colors.fg,
              updateShortcuts: false,
            })
            ?.catch(() => {
              /* ignore */
            });
        } else {
          iconInitialized = true;
          if (iconApplyTimer !== null) {
            window.clearTimeout(iconApplyTimer);
          }
          iconApplyTimer = window.setTimeout(() => {
            iconApplyTimer = null;
            const shouldUpdateShortcuts = pendingIconShortcuts;
            pendingIconShortcuts = false;
            void window.agendameaWindow
              ?.applyAppIcon?.({
                bg: colors.bg,
                fg: colors.fg,
                updateShortcuts: shouldUpdateShortcuts,
              })
              ?.catch(() => {
                /* ignore */
              });
          }, 350);
        }
      }

      const a11yKey = `${s.zoomPercent}|${s.fontScale}|${s.highContrast}|${s.reducedMotion}|${s.readableSpacing}|${s.listDensity}|${s.fontFamily}|${s.colorBlindShapes}|${s.strongFocusRing}`;
      if (a11yKey !== prevA11yKey) {
        prevA11yKey = a11yKey;
        applyAccessibilityToDocument({
          zoomPercent: s.zoomPercent,
          fontScale: s.fontScale,
          highContrast: s.highContrast,
          reducedMotion: s.reducedMotion,
          readableSpacing: s.readableSpacing,
          listDensity: s.listDensity,
          fontFamily: s.fontFamily,
          colorBlindShapes: s.colorBlindShapes,
          strongFocusRing: s.strongFocusRing,
        });
      }

      if (s.closeBehavior !== prevCloseBehavior) {
        prevCloseBehavior = s.closeBehavior;
        void window.agendameaWindow?.setCloseBehavior?.(s.closeBehavior)?.catch(() => {
          /* ignore */
        });
      }
    };

    const onSystemColorSchemeChange = () => {
      if (preferencesStore.getState().themeMode === 'system') {
        applyIconAndTheme(true);
      }
    };

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      systemMql = window.matchMedia('(prefers-color-scheme: dark)');
      systemMql.addEventListener?.('change', onSystemColorSchemeChange);
    }

    applyIconAndTheme(false);
    const unsubscribe = preferencesStore.subscribe(() => {
      applyIconAndTheme(false);
    });

    return () => {
      unsubscribe();
      systemMql?.removeEventListener?.('change', onSystemColorSchemeChange);
      if (iconApplyTimer !== null) {
        window.clearTimeout(iconApplyTimer);
        iconApplyTimer = null;
      }
      preferencesStore.disposeTimers();
    };
  }, []);

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
      ?.catch(() => {
        /* ignore */
      });
  }, [
    t.trayOpenApp,
    t.addFirstTaskButton,
    t.overlayTrayMenuDictate,
    t.today,
    t.important,
    t.closeActionQuitTitle,
  ]);

  return {
    language,
    pendingLanguage,
    sidebarCollapsed,
    dragLocked,
    langMeta,
    t,
    langRef,
    tRef,
  };
}
