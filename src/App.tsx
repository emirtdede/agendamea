import React, {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Calendar as CalendarIcon,
  CheckCheck,
  Cloud,
  Columns3,
  FolderOpen,
  Grid2x2,
  Hash,
  List,
  Menu,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { api } from './api/client';
import { CloseActionModal } from './components/CloseActionModal';
import { ColorDot } from './components/ColorDot';
import { OfflineIndicator } from './components/OfflineIndicator';
import { QuickAddBar } from './components/QuickAddBar';
import { Sidebar } from './components/Sidebar';
import {
  CalendarPlannerView,
  EisenhowerMatrixView,
  KanbanBoardView,
} from './components/TaskBoardViews';
import { ToastContainer } from './components/ToastContainer';
import { TodoDetailPanel } from './components/TodoDetailPanel';
import { TodoItem } from './components/TodoItem';
import { WelcomeModal } from './components/WelcomeModal';
import { WindowControls } from './components/WindowControls';
import { useDelayedFocus } from './hooks/useDelayedFocus';
import { useToast } from './hooks/useToast';
import { useTodayDate } from './hooks/useTodayDate';
import { I18nProvider, readInitialLanguage } from './i18n/I18nContext';
import {
  getLanguageMeta,
  isValidLanguageCode,
  resolveSystemLanguage,
  type LanguageCode,
} from './i18n/languages';
import { getDictionary } from './i18n/localesWorld';
import { localizeErrorMessage } from './i18n/translations';
import type {
  ActiveView,
  AppIconId,
  BootstrapPayload,
  Category,
  CategoryPatch,
  CloseBehavior,
  LayoutMode,
  OneDriveStatus,
  Priority,
  SortOption,
  StatusFilter,
  ThemeId,
  ThemeMode,
  Todo,
  TodoPatch,
  UpdateCheckResult,
} from './types';
import {
  applyAccessibilityToDocument,
  applyAppIconTokensToDocument,
  applyThemeToDocument,
  clampZoomPercent,
  isValidAppIconId,
  isValidThemeId,
  normalizeHexColor,
  resolveAppIconColors,
  ZOOM_PRESETS,
} from './utils/themes';
import {
  computeViewCounts,
  filterAndSortTodos,
  getVerticalDropPosition,
  moveIdRelative,
  sortCategoriesWithPin,
} from './utils/todoLogic';

const SettingsModal = React.lazy(() => import('./components/SettingsModal'));

function readInitialTheme(): {
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
    const hasMode = savedMode === 'light' || savedMode === 'dark';
    const hasId = Boolean(savedId && isValidThemeId(savedId));
    return {
      mode: savedMode === 'dark' ? 'dark' : 'light',
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

export default function App() {
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
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(initialLang.code);
  const [autoUpdateCheck, setAutoUpdateCheck] = useState<boolean>(true);
  const [dragLocked, setDragLocked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    readInitialSidebarCollapsed(),
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const welcomeCheckedRef = useRef(false);
  const iconInitializedRef = useRef(false);
  const iconDirtyRef = useRef(false);

  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'error';
    result: UpdateCheckResult | null;
    downloadPercent: number | null;
  }>({
    status: 'idle',
    result: null,
    downloadPercent: null,
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [trashedCategories, setTrashedCategories] = useState<Category[]>([]);
  const [trashedTodos, setTrashedTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [oneDrivePrompt, setOneDrivePrompt] = useState<OneDriveStatus | null>(null);
  const [isRestoringOneDrivePrompt, setIsRestoringOneDrivePrompt] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>({ type: 'smart', id: 'all' });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('manual');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [todoDropTarget, setTodoDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  const langMeta = useMemo(() => getLanguageMeta(language), [language]);
  const t = useMemo(() => getDictionary(language), [language]);

  const {
    undoToast,
    infoToast,
    showUndoToast,
    clearUndoToast,
    pauseUndoToast,
    resumeUndoToast,
    showInfoToast,
    clearInfoToast,
  } = useToast();
  const { todayStr, todayFormatted } = useTodayDate(langMeta.intlLocale);

  const quickAddRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scheduleFocus = useDelayedFocus();
  const todoUpdateSeqRef = useRef<Map<string, number>>(new Map());
  const categoryUpdateSeqRef = useRef<Map<string, number>>(new Map());
  const subtaskUpdateSeqRef = useRef<Map<string, number>>(new Map());
  const reorderCatSeqRef = useRef(0);
  const reorderTodoSeqRef = useRef(0);
  const pendingDeletesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const pendingSubtaskDeletesRef = useRef<Set<string>>(new Set());
  const isEmptyingTrashRef = useRef(false);
  const pendingTrashOpsRef = useRef<Set<string>>(new Set());
  const themeDirtyRef = useRef(false);
  const sidebarDirtyRef = useRef(false);
  const langDirtyRef = useRef(false);
  const todosRef = useRef(todos);
  todosRef.current = todos;
  const trashedCategoriesRef = useRef(trashedCategories);
  trashedCategoriesRef.current = trashedCategories;
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  sidebarCollapsedRef.current = sidebarCollapsed;
  const langRef = useRef(language);
  langRef.current = language;
  const tRef = useRef(t);
  tRef.current = t;

  const formatUiError = useCallback((err: unknown, fallback?: string): string => {
    const dict = tRef.current;
    return localizeErrorMessage(
      err,
      fallback ?? dict.operationFailedToast,
      langRef.current,
      dict,
    );
  }, []);

  useEffect(() => {
    applyThemeToDocument(themeId, themeMode, customThemeColor);
  }, [themeId, themeMode, customThemeColor]);

  // Synchronize active App Icon across in-app BrandMark, Window, Taskbar, System Tray & Windows Shortcuts
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
      void window.agendameaWindow?.applyAppIcon?.({
        bg: colors.bg,
        fg: colors.fg,
        updateShortcuts: shouldUpdateShortcuts,
      });
    } else {
      iconInitializedRef.current = true;
    }
  }, [appIconId, customIconColor, themeId, themeMode, customThemeColor]);

  // Apply Accessibility settings (Zoom %, High Contrast, Reduced Motion)
  useEffect(() => {
    applyAccessibilityToDocument({ zoomPercent, highContrast, reducedMotion });
  }, [zoomPercent, highContrast, reducedMotion]);

  // Keep Electron System Tray labels localized across all 73 languages
  useEffect(() => {
    void window.agendameaWindow?.updateTrayLabels?.({
      openLabel: t.trayOpenApp,
      newTaskLabel: t.addFirstTaskButton,
      quitLabel: t.closeActionQuitTitle,
    });
  }, [t.trayOpenApp, t.addFirstTaskButton, t.closeActionQuitTitle]);

  // Keep Electron Main Process close behavior in sync & listen for close / quick-add events
  useEffect(() => {
    void window.agendameaWindow?.setCloseBehavior?.(closeBehavior);
  }, [closeBehavior]);

  useEffect(() => {
    const unsubClose = window.agendameaWindow?.onCloseRequested?.(() => {
      setIsCloseModalOpen(true);
    });
    const unsubQuickAdd = window.agendameaWindow?.onFocusQuickAdd?.(() => {
      scheduleFocus(() => quickAddRef.current?.focus(), 60);
    });
    return () => {
      if (typeof unsubClose === 'function') unsubClose();
      if (typeof unsubQuickAdd === 'function') unsubQuickAdd();
    };
  }, [scheduleFocus]);

  // Listen to Electron native update download progress if available
  useEffect(() => {
    const unsub = window.agendameaWindow?.onUpdateProgress?.((pct) => {
      setUpdateState((prev) =>
        prev.status === 'downloading' ? { ...prev, downloadPercent: pct } : prev,
      );
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setLoadError(null);
    }
    try {
      const data = await api.bootstrap();
      setCategories(sortCategoriesWithPin(data.categories));
      setTodos(data.todos);
      setTrashedCategories(data.trashedCategories);
      setTrashedTodos(data.trashedTodos);
      setDragLocked(Boolean(data.settings.dragLocked));
      setAutoUpdateCheck(
        data.settings.autoUpdateCheck === undefined ? true : Boolean(data.settings.autoUpdateCheck),
      );
      if (data.settings.customThemeColor) {
        const norm = normalizeHexColor(data.settings.customThemeColor);
        if (norm) setCustomThemeColor(norm);
      }
      if (data.settings.appIconId && isValidAppIconId(data.settings.appIconId)) {
        setAppIconId(data.settings.appIconId);
      }
      if (data.settings.customIconColor) {
        const norm = normalizeHexColor(data.settings.customIconColor);
        if (norm) setCustomIconColor(norm);
      }
      if (typeof data.settings.zoomPercent === 'number') {
        setZoomPercent(clampZoomPercent(data.settings.zoomPercent));
      }
      if (typeof data.settings.highContrast === 'boolean') {
        setHighContrast(data.settings.highContrast);
      }
      if (typeof data.settings.reducedMotion === 'boolean') {
        setReducedMotion(data.settings.reducedMotion);
      }
      if (
        data.settings.closeBehavior === 'ask' ||
        data.settings.closeBehavior === 'tray' ||
        data.settings.closeBehavior === 'quit'
      ) {
        setCloseBehavior(data.settings.closeBehavior);
      }

      if (!langDirtyRef.current && data.settings.language && isValidLanguageCode(data.settings.language)) {
        let hasCustomLang = false;
        try {
          hasCustomLang = localStorage.getItem('agendamea-language-customized') === 'true';
        } catch {
          // Ignore storage read errors
        }
        let nativeLocale: { installerLocale: string | null; osLocale: string; preferred: string } | null = null;
        try {
          nativeLocale = (await window.agendameaWindow?.getInitialLocale?.()) ?? null;
        } catch {
          // Fall back to navigator language
        }

        if (nativeLocale?.installerLocale) {
          // Setup wizard explicitly wrote a freshly chosen language: apply immediately (works on both fresh install & reinstall)
          const setupLang = resolveSystemLanguage([nativeLocale.installerLocale], 'en');
          setLanguage(setupLang);
          try {
            localStorage.setItem('agendamea-language-customized', 'true');
          } catch {
            // Ignore storage write errors
          }
          if (data.settings.language !== setupLang) {
            void api.updateSettings({ language: setupLang }).catch(() => {});
          }
        } else if (!hasCustomLang) {
          let resolvedInitial: LanguageCode = initialLang.code;
          if (nativeLocale?.osLocale) {
            resolvedInitial = resolveSystemLanguage([nativeLocale.osLocale], 'en');
          }
          if (data.settings.language === 'tr' && resolvedInitial !== 'tr') {
            setLanguage(resolvedInitial);
            try {
              localStorage.setItem('agendamea-language-customized', 'true');
            } catch {
              // Ignore storage write errors
            }
            void api.updateSettings({ language: resolvedInitial }).catch(() => {});
          } else {
            setLanguage(data.settings.language);
          }
        } else {
          setLanguage(data.settings.language);
        }
      }

      if (!sidebarDirtyRef.current) {
        const dbCollapsed = Boolean(data.settings.sidebarCollapsed);
        setSidebarCollapsed(dbCollapsed);
        try {
          localStorage.setItem('agendamea-sidebar-collapsed', String(dbCollapsed));
        } catch {
          // Ignore storage errors
        }
      }

      if (!themeDirtyRef.current) {
        const storedTheme = readInitialTheme();
        if (!data.settings.themeCustomized && storedTheme.hasStoredPreference) {
          setThemeMode(storedTheme.mode);
          setThemeId(storedTheme.themeId);
          void api
            .updateSettings({ themeMode: storedTheme.mode, themeId: storedTheme.themeId })
            .catch(() => {});
        } else {
          setThemeMode(data.settings.themeMode);
          setThemeId(data.settings.themeId);
        }
      }
      setLoadError(null);

      // First-launch OneDrive backup detection when local DB is completely empty (e.g. after OS format / reinstall)
      const isLocalCompletelyEmpty =
        data.todos.length === 0 &&
        data.categories.length === 0 &&
        data.trashedTodos.length === 0 &&
        data.trashedCategories.length === 0;

      if (!welcomeCheckedRef.current) {
        welcomeCheckedRef.current = true;
        let localOnboardingDone = false;
        try {
          localOnboardingDone = localStorage.getItem('agendamea-onboarding-completed') === 'true';
        } catch {
          // Ignore storage read errors
        }
        if (!data.settings.onboardingCompleted && !localOnboardingDone) {
          if (isLocalCompletelyEmpty) {
            setIsWelcomeOpen(true);
          } else {
            try {
              localStorage.setItem('agendamea-onboarding-completed', 'true');
            } catch {
              // Ignore storage write errors
            }
            void api.updateSettings({ onboardingCompleted: true }).catch(() => {});
          }
        }
      }

      if (isLocalCompletelyEmpty) {
        let dismissed = false;
        try {
          dismissed = localStorage.getItem('agendamea-onedrive-prompt-dismissed') === 'true';
        } catch {
          // Ignore storage read errors
        }
        if (!dismissed) {
          void api
            .getOneDriveStatus()
            .then((st) => {
              if (
                todosRef.current.length === 0 &&
                st.hasRemoteBackup &&
                ((st.remoteTodoCount ?? 0) > 0 || (st.remoteCategoryCount ?? 0) > 0)
              ) {
                setOneDrivePrompt(st);
              }
            })
            .catch(() => {});
        }
      } else {
        setOneDrivePrompt(null);
      }
    } catch (err) {
      if (!silent) {
        setLoadError(formatUiError(err, tRef.current.loadFailedError));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [formatUiError]);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // Manual & Automatic Update Check
  const runUpdateCheck = useCallback(
    async (isManual: boolean) => {
      setUpdateState((prev) => ({
        ...prev,
        status: 'checking',
      }));
      try {
        const res = await api.checkForUpdates();
        if (!res.ok) {
          setUpdateState({
            status: isManual ? 'error' : 'idle',
            result: res,
            downloadPercent: null,
          });
          return;
        }
        if (res.updateAvailable) {
          setUpdateState({
            status: 'available',
            result: res,
            downloadPercent: null,
          });
          if (!isManual) {
            showInfoToast(`${tRef.current.updateAvailableLabel}: v${res.latestVersion}`, 'info');
          }
        } else {
          setUpdateState({
            status: 'up-to-date',
            result: res,
            downloadPercent: null,
          });
        }
      } catch {
        setUpdateState((prev) => ({
          status: isManual ? 'error' : 'idle',
          result: prev.result,
          downloadPercent: null,
        }));
      }
    },
    [showInfoToast],
  );

  // Automatic background update check on startup & every 6 hours when enabled (skipped inside Microsoft Store MSIX sandbox)
  useEffect(() => {
    if (!autoUpdateCheck || window.agendameaWindow?.isWindowsStore) return;
    const startupTimer = window.setTimeout(() => {
      void runUpdateCheck(false);
    }, 3000);
    const periodicTimer = window.setInterval(
      () => {
        void runUpdateCheck(false);
      },
      6 * 60 * 60 * 1000,
    );
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(periodicTimer);
    };
  }, [autoUpdateCheck, runUpdateCheck]);

  const handleManualCheckForUpdates = useCallback(async () => {
    await runUpdateCheck(true);
  }, [runUpdateCheck]);

  const handleDownloadAndInstallUpdate = useCallback(async () => {
    const res = updateState.result;
    if (!res) return;
    const installerUrl = res.setupUrl || res.msixUrl || null;
    const downloadUrl = installerUrl || res.portableUrl || res.releaseUrl;
    if (window.agendameaWindow?.downloadAndInstallUpdate && installerUrl) {
      setUpdateState((prev) => ({
        ...prev,
        status: 'downloading',
        downloadPercent: 5,
      }));
      await window.agendameaWindow.downloadAndInstallUpdate(installerUrl);
      setUpdateState((prev) => ({
        ...prev,
        status: 'available',
        downloadPercent: null,
      }));
      return;
    }
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  }, [updateState.result]);

  // Handle Windows Jump List / PWA shortcut launch query params (?view=... & ?action=new)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const actionParam = params.get('action');

      if (
        viewParam === 'today' ||
        viewParam === 'important' ||
        viewParam === 'completed' ||
        viewParam === 'all'
      ) {
        setActiveView({ type: 'smart', id: viewParam });
      }
      if (actionParam === 'new') {
        scheduleFocus(() => quickAddRef.current?.focus(), 120);
      }
      if (viewParam || actionParam) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {
      // Ignore invalid URL environments
    }
  }, [scheduleFocus]);

  const focusSidebarSearch = useCallback(() => {
    if (window.innerWidth < 768) {
      setIsMobileSidebarOpen(true);
      scheduleFocus(() => searchInputRef.current?.focus(), 80);
      return;
    }
    if (sidebarCollapsedRef.current) {
      sidebarDirtyRef.current = true;
      sidebarCollapsedRef.current = false;
      setSidebarCollapsed(false);
      try {
        localStorage.setItem('agendamea-sidebar-collapsed', 'false');
      } catch {
        // Ignore storage errors
      }
      void api.updateSettings({ sidebarCollapsed: false }).catch(() => {});
      scheduleFocus(() => searchInputRef.current?.focus(), 80);
      return;
    }
    searchInputRef.current?.focus();
  }, [scheduleFocus]);

  const keyboardReorderRef = useRef<((direction: 'up' | 'down') => void) | null>(null);
  const keyStateRef = useRef({
    isSettingsOpen,
    isWelcomeOpen,
    isCloseModalOpen,
    isMobileSidebarOpen,
    selectedTodoId,
    searchQuery,
    tagFilter,
    focusSidebarSearch,
    zoomPercent,
  });
  keyStateRef.current = {
    isSettingsOpen,
    isWelcomeOpen,
    isCloseModalOpen,
    isMobileSidebarOpen,
    selectedTodoId,
    searchQuery,
    tagFilter,
    focusSidebarSearch,
    zoomPercent,
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = keyStateRef.current;
      const target = e.target as HTMLElement | null;
      const isTypingField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Global accessibility zoom shortcuts (Ctrl/Cmd + / - / 0)
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const idx = ZOOM_PRESETS.indexOf(state.zoomPercent as (typeof ZOOM_PRESETS)[number]);
          const next = ZOOM_PRESETS[Math.min(ZOOM_PRESETS.length - 1, idx >= 0 ? idx + 1 : 3)];
          setZoomPercent(next);
          void api.updateSettings({ zoomPercent: next }).catch(() => {});
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          const idx = ZOOM_PRESETS.indexOf(state.zoomPercent as (typeof ZOOM_PRESETS)[number]);
          const next = ZOOM_PRESETS[Math.max(0, idx >= 0 ? idx - 1 : 1)];
          setZoomPercent(next);
          void api.updateSettings({ zoomPercent: next }).catch(() => {});
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          setZoomPercent(100);
          void api.updateSettings({ zoomPercent: 100 }).catch(() => {});
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        state.focusSidebarSearch();
        return;
      }

      if (e.key === 'Escape') {
        if (state.isSettingsOpen || state.isWelcomeOpen || state.isCloseModalOpen) {
          // Modals handle Escape internally
          return;
        }
        if (state.isMobileSidebarOpen) {
          setIsMobileSidebarOpen(false);
        } else if (state.selectedTodoId) {
          setSelectedTodoId(null);
        } else if (state.searchQuery) {
          setSearchQuery('');
        } else if (state.tagFilter) {
          setTagFilter(null);
        }
        return;
      }

      if (isTypingField || state.isSettingsOpen || state.isWelcomeOpen || state.isCloseModalOpen) return;

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        keyboardReorderRef.current?.(e.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        state.focusSidebarSearch();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        quickAddRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleModeChange = useCallback(
    (nextMode: ThemeMode) => {
      themeDirtyRef.current = true;
      iconDirtyRef.current = true;
      setThemeMode(nextMode);
      void api.updateSettings({ themeMode: nextMode }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleThemeChange = useCallback(
    (nextId: ThemeId) => {
      themeDirtyRef.current = true;
      iconDirtyRef.current = true;
      setThemeId(nextId);
      void api.updateSettings({ themeId: nextId }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleCustomThemeColorChange = useCallback(
    (rawHex: string) => {
      const norm = normalizeHexColor(rawHex);
      if (!norm) return;
      themeDirtyRef.current = true;
      iconDirtyRef.current = true;
      setCustomThemeColor(norm);
      setThemeId('custom');
      void api.updateSettings({ themeId: 'custom', customThemeColor: norm }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleAppIconChange = useCallback(
    (nextIconId: AppIconId) => {
      iconDirtyRef.current = true;
      setAppIconId(nextIconId);
      void api.updateSettings({ appIconId: nextIconId }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleCustomIconColorChange = useCallback(
    (rawHex: string) => {
      const norm = normalizeHexColor(rawHex);
      if (!norm) return;
      iconDirtyRef.current = true;
      setCustomIconColor(norm);
      setAppIconId('custom');
      void api.updateSettings({ appIconId: 'custom', customIconColor: norm }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleZoomPercentChange = useCallback(
    (nextZoom: number) => {
      const clamped = clampZoomPercent(nextZoom);
      setZoomPercent(clamped);
      void api.updateSettings({ zoomPercent: clamped }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleToggleHighContrast = useCallback(
    (enabled: boolean) => {
      setHighContrast(enabled);
      void api.updateSettings({ highContrast: enabled }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleToggleReducedMotion = useCallback(
    (enabled: boolean) => {
      setReducedMotion(enabled);
      void api.updateSettings({ reducedMotion: enabled }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleCloseBehaviorChange = useCallback(
    (nextBehavior: CloseBehavior) => {
      setCloseBehavior(nextBehavior);
      void window.agendameaWindow?.setCloseBehavior?.(nextBehavior);
      void api.updateSettings({ closeBehavior: nextBehavior }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleCloseModalSelectAction = useCallback(
    async (action: 'tray' | 'quit', rememberChoice: boolean) => {
      setIsCloseModalOpen(false);
      if (rememberChoice) {
        setCloseBehavior(action);
        await window.agendameaWindow?.setCloseBehavior?.(action);
        try {
          await api.updateSettings({ closeBehavior: action });
        } catch {
          // Proceed with close even if settings write fails
        }
      }
      await window.agendameaWindow?.performCloseAction?.(action);
    },
    [],
  );

  const handleChangeLanguage = useCallback(
    (nextLang: LanguageCode) => {
      langDirtyRef.current = true;
      setLanguage(nextLang);
      try {
        localStorage.setItem('agendamea-language-customized', 'true');
      } catch {
        // Ignore storage write errors
      }
      void api.updateSettings({ language: nextLang }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleToggleAutoUpdateCheck = useCallback(
    (enabled: boolean) => {
      setAutoUpdateCheck(enabled);
      void api.updateSettings({ autoUpdateCheck: enabled }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

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

  const handleCreateCategory = useCallback(
    async (payload: { id: string; name: string; color: string }) => {
      try {
        const created = await api.createCategory(payload);
        setCategories((prev) =>
          sortCategoriesWithPin([...prev.filter((c) => c.id !== created.id), created]),
        );
        setActiveView({ type: 'category', id: created.id });
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        throw err;
      }
    },
    [showInfoToast, formatUiError],
  );

  const handleUpdateCategory = useCallback(
    async (id: string, patch: CategoryPatch) => {
      const seq = (categoryUpdateSeqRef.current.get(id) ?? 0) + 1;
      categoryUpdateSeqRef.current.set(id, seq);
      try {
        const updated = await api.updateCategory(id, patch);
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          setCategories((prev) =>
            sortCategoriesWithPin(prev.map((c) => (c.id === id ? updated : c))),
          );
        }
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          void loadData(true);
        }
        throw err;
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handleTogglePinCategory = useCallback(
    async (id: string, pinned: boolean) => {
      const seq = (categoryUpdateSeqRef.current.get(id) ?? 0) + 1;
      categoryUpdateSeqRef.current.set(id, seq);
      setCategories((prev) =>
        sortCategoriesWithPin(prev.map((c) => (c.id === id ? { ...c, pinned } : c))),
      );
      try {
        const updated = await api.updateCategory(id, { pinned });
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          setCategories((prev) =>
            sortCategoriesWithPin(prev.map((c) => (c.id === id ? updated : c))),
          );
        }
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        if (categoryUpdateSeqRef.current.get(id) === seq) {
          void loadData(true);
        }
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      try {
        const trashed = await api.deleteCategory(id);
        categoryUpdateSeqRef.current.delete(id);
        setCategories((prev) => prev.filter((c) => c.id !== id));
        setTrashedCategories((prev) => [trashed, ...prev.filter((c) => c.id !== id)]);

        setActiveView((prev) =>
          prev.type === 'category' && prev.id === id ? { type: 'smart', id: 'all' } : prev,
        );
        showUndoToast('category', id, tRef.current.categoryMovedToTrashToast);
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
        throw err;
      }
    },
    [showUndoToast, showInfoToast, loadData, formatUiError],
  );

  const handleRestoreCategory = useCallback(
    async (id: string) => {
      const opKey = `cat:${id}`;
      if (pendingTrashOpsRef.current.has(opKey)) return;
      pendingTrashOpsRef.current.add(opKey);
      try {
        const restored = await api.restoreCategory(id);
        setTrashedCategories((prev) => prev.filter((c) => c.id !== id));
        setCategories((prev) =>
          sortCategoriesWithPin([...prev.filter((c) => c.id !== id), restored]),
        );
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingTrashOpsRef.current.delete(opKey);
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handlePermanentDeleteCategory = useCallback(
    async (id: string) => {
      const opKey = `cat:${id}`;
      if (pendingTrashOpsRef.current.has(opKey)) return;
      pendingTrashOpsRef.current.add(opKey);
      try {
        await api.permanentDeleteCategory(id);
        categoryUpdateSeqRef.current.delete(id);
        setTrashedCategories((prev) => prev.filter((c) => c.id !== id));
        setTodos((prev) =>
          prev.map((tItem) => (tItem.categoryId === id ? { ...tItem, categoryId: null } : tItem)),
        );
        setTrashedTodos((prev) =>
          prev.map((tItem) => (tItem.categoryId === id ? { ...tItem, categoryId: null } : tItem)),
        );
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingTrashOpsRef.current.delete(opKey);
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handleAddTodo = useCallback(
    async (payload: {
      id?: string;
      title: string;
      priority: Priority;
      startDate?: string | null;
      dueDate: string | null;
      dueTime?: string | null;
      categoryId: string | null;
      important: boolean;
    }) => {
      try {
        const created = await api.createTodo(payload);
        setOneDrivePrompt(null);
        setTodos((prev) => [created, ...prev.filter((tItem) => tItem.id !== created.id)]);
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        throw err;
      }
    },
    [showInfoToast, formatUiError],
  );

  const handleUpdateTodo = useCallback(
    async (
      id: string,
      patch: TodoPatch,
      options?: { keepalive?: boolean },
    ): Promise<boolean> => {
      if (
        pendingDeletesRef.current.has(id) ||
        !todosRef.current.some((tItem) => tItem.id === id)
      ) {
        return false;
      }

      const seq = (todoUpdateSeqRef.current.get(id) ?? 0) + 1;
      todoUpdateSeqRef.current.set(id, seq);

      setTodos((prev) =>
        prev.map((tItem) =>
          tItem.id === id
            ? {
                ...tItem,
                ...patch,
                updatedAt: new Date().toISOString(),
              }
            : tItem,
        ),
      );
      try {
        const updated = await api.updateTodo(id, patch, options);
        if (todoUpdateSeqRef.current.get(id) === seq) {
          setTodos((prev) => prev.map((tItem) => (tItem.id === id ? updated : tItem)));
        }
        return true;
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        if (todoUpdateSeqRef.current.get(id) === seq) {
          void loadData(true);
        }
        return false;
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handleDeleteTodo = useCallback(
    (id: string) => {
      const target = todosRef.current.find((tItem) => tItem.id === id);
      if (!target) return;

      todoUpdateSeqRef.current.delete(id);
      const deletedAt = new Date().toISOString();
      setTodos((prev) => prev.filter((tItem) => tItem.id !== id));
      setTrashedTodos((prev) => [
        { ...target, deletedAt },
        ...prev.filter((tItem) => tItem.id !== id),
      ]);
      setSelectedTodoId((prev) => (prev === id ? null : prev));

      showUndoToast('todo', id, tRef.current.todoMovedToTrashToast);

      const deletePromise = api
        .deleteTodo(id)
        .then((trashed) => {
          setTrashedTodos((prev) => prev.map((tItem) => (tItem.id === id ? trashed : tItem)));
          return true;
        })
        .catch((err) => {
          clearUndoToast();
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
          return false;
        })
        .finally(() => {
          pendingDeletesRef.current.delete(id);
        });

      pendingDeletesRef.current.set(id, deletePromise);
    },
    [showUndoToast, clearUndoToast, showInfoToast, loadData, formatUiError],
  );

  const handleRestoreTodo = useCallback(
    async (id: string) => {
      const opKey = `todo:${id}`;
      if (pendingTrashOpsRef.current.has(opKey)) return;
      pendingTrashOpsRef.current.add(opKey);
      try {
        const inFlightDelete = pendingDeletesRef.current.get(id);
        if (inFlightDelete) {
          const deleteSucceeded = await inFlightDelete;
          if (!deleteSucceeded) return;
        }
        const restored = await api.restoreTodo(id);
        setTrashedTodos((prev) => prev.filter((tItem) => tItem.id !== id));
        setTodos((prev) => [restored, ...prev.filter((tItem) => tItem.id !== id)]);
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingTrashOpsRef.current.delete(opKey);
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handlePermanentDeleteTodo = useCallback(
    async (id: string) => {
      const opKey = `todo:${id}`;
      if (pendingTrashOpsRef.current.has(opKey)) return;
      pendingTrashOpsRef.current.add(opKey);
      try {
        const inFlightDelete = pendingDeletesRef.current.get(id);
        if (inFlightDelete) {
          const deleteSucceeded = await inFlightDelete;
          if (!deleteSucceeded) return;
        }
        await api.permanentDeleteTodo(id);
        todoUpdateSeqRef.current.delete(id);
        setTrashedTodos((prev) => prev.filter((tItem) => tItem.id !== id));
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingTrashOpsRef.current.delete(opKey);
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handleUndoSoftDelete = useCallback(async () => {
    if (!undoToast) return;
    const { kind, id } = undoToast;
    clearUndoToast();

    if (kind === 'todo') {
      await handleRestoreTodo(id);
    } else {
      await handleRestoreCategory(id);
    }
  }, [undoToast, clearUndoToast, handleRestoreTodo, handleRestoreCategory]);

  const handleClearCompleted = useCallback(
    async (scopeCategoryId?: string | null) => {
      const scopeCatId =
        scopeCategoryId !== undefined
          ? scopeCategoryId
          : activeView.type === 'category'
            ? activeView.id
            : null;

      try {
        const { trashedTodos: newlyTrashed } = await api.clearCompleted(scopeCatId);
        if (newlyTrashed.length === 0) return;

        const trashedIds = new Set(newlyTrashed.map((tItem) => tItem.id));
        trashedIds.forEach((tid) => todoUpdateSeqRef.current.delete(tid));
        setTodos((prev) => prev.filter((tItem) => !trashedIds.has(tItem.id)));
        setTrashedTodos((prev) => [
          ...newlyTrashed,
          ...prev.filter((tItem) => !trashedIds.has(tItem.id)),
        ]);
        setSelectedTodoId((prev) => (prev && trashedIds.has(prev) ? null : prev));
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      }
    },
    [activeView, showInfoToast, loadData, formatUiError],
  );

  const handleEmptyTrash = useCallback(async () => {
    if (isEmptyingTrashRef.current) return;
    isEmptyingTrashRef.current = true;
    try {
      if (pendingDeletesRef.current.size > 0) {
        await Promise.allSettled(Array.from(pendingDeletesRef.current.values()));
      }
      const removedCatIds = new Set(trashedCategoriesRef.current.map((c) => c.id));
      await api.emptyTrash();
      clearUndoToast();
      setTrashedTodos([]);
      setTrashedCategories([]);
      if (removedCatIds.size > 0) {
        setTodos((prev) =>
          prev.map((tItem) =>
            tItem.categoryId && removedCatIds.has(tItem.categoryId)
              ? { ...tItem, categoryId: null }
              : tItem,
          ),
        );
      }
    } catch (err) {
      showInfoToast(formatUiError(err), 'error');
      void loadData(true);
    } finally {
      isEmptyingTrashRef.current = false;
    }
  }, [clearUndoToast, showInfoToast, loadData, formatUiError]);

  const handleApplyRestoredBootstrap = useCallback(
    (restored: BootstrapPayload) => {
      clearUndoToast();
      todoUpdateSeqRef.current.clear();
      categoryUpdateSeqRef.current.clear();
      themeDirtyRef.current = false;
      sidebarDirtyRef.current = false;
      langDirtyRef.current = false;
      const nextCollapsed = Boolean(restored.settings.sidebarCollapsed);
      try {
        localStorage.setItem('agendamea-sidebar-collapsed', String(nextCollapsed));
      } catch {
        // Ignore storage errors
      }
      setCategories(sortCategoriesWithPin(restored.categories));
      setTodos(restored.todos);
      setTrashedCategories(restored.trashedCategories);
      setTrashedTodos(restored.trashedTodos);
      setThemeMode(restored.settings.themeMode);
      setThemeId(restored.settings.themeId);
      setDragLocked(Boolean(restored.settings.dragLocked));
      if (restored.settings.language && isValidLanguageCode(restored.settings.language)) {
        setLanguage(restored.settings.language);
      }
      setAutoUpdateCheck(
        restored.settings.autoUpdateCheck === undefined
          ? true
          : Boolean(restored.settings.autoUpdateCheck),
      );
      setSidebarCollapsed(nextCollapsed);
      setSelectedTodoId(null);
      setTagFilter(null);
      setSearchQuery('');
      setStatusFilter('all');
      setOneDrivePrompt(null);
      setActiveView({ type: 'smart', id: 'all' });
      showInfoToast(tRef.current.backupRestoredToast);
    },
    [clearUndoToast, showInfoToast],
  );

  const handleImportBackup = useCallback(
    async (payload: unknown) => {
      const restored = await api.importBackup(payload);
      handleApplyRestoredBootstrap(restored);
    },
    [handleApplyRestoredBootstrap],
  );

  const handleAddSubtask = useCallback(
    async (todoId: string, title: string): Promise<boolean> => {
      try {
        const created = await api.createSubtask(todoId, title);
        setTodos((prev) =>
          prev.map((tItem) =>
            tItem.id === todoId ? { ...tItem, subtasks: [...tItem.subtasks, created] } : tItem,
          ),
        );
        return true;
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        return false;
      }
    },
    [showInfoToast, formatUiError],
  );

  const handleToggleSubtask = useCallback(
    async (todoId: string, subtaskId: string, completed: boolean) => {
      if (pendingSubtaskDeletesRef.current.has(subtaskId)) return;
      const seq = (subtaskUpdateSeqRef.current.get(subtaskId) ?? 0) + 1;
      subtaskUpdateSeqRef.current.set(subtaskId, seq);

      setTodos((prev) =>
        prev.map((tItem) =>
          tItem.id === todoId
            ? {
                ...tItem,
                subtasks: tItem.subtasks.map((s) =>
                  s.id === subtaskId ? { ...s, completed } : s,
                ),
              }
            : tItem,
        ),
      );
      try {
        await api.updateSubtask(subtaskId, { completed });
      } catch (err) {
        if (
          !pendingSubtaskDeletesRef.current.has(subtaskId) &&
          subtaskUpdateSeqRef.current.get(subtaskId) === seq
        ) {
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
        }
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handleDeleteSubtask = useCallback(
    async (todoId: string, subtaskId: string) => {
      if (pendingSubtaskDeletesRef.current.has(subtaskId)) return;
      pendingSubtaskDeletesRef.current.add(subtaskId);
      subtaskUpdateSeqRef.current.delete(subtaskId);

      setTodos((prev) =>
        prev.map((tItem) =>
          tItem.id === todoId
            ? { ...tItem, subtasks: tItem.subtasks.filter((s) => s.id !== subtaskId) }
            : tItem,
        ),
      );
      try {
        await api.deleteSubtask(subtaskId);
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      } finally {
        pendingSubtaskDeletesRef.current.delete(subtaskId);
      }
    },
    [showInfoToast, loadData, formatUiError],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const counts = useMemo(
    () => computeViewCounts(todos, categories, todayStr),
    [todos, categories, todayStr],
  );

  const visibleTodos = useMemo(
    () =>
      filterAndSortTodos({
        todos,
        activeView,
        statusFilter,
        searchQuery: deferredSearchQuery,
        sortBy,
        todayStr,
        tagFilter,
      }),
    [todos, activeView, statusFilter, deferredSearchQuery, sortBy, todayStr, tagFilter],
  );

  const { activeCountInView, completedCountInView } = useMemo(() => {
    let completed = 0;
    for (const tItem of visibleTodos) {
      if (tItem.completed) completed += 1;
    }
    return {
      activeCountInView: visibleTodos.length - completed,
      completedCountInView: completed,
    };
  }, [visibleTodos]);

  const selectedTodo = useMemo(
    () => todos.find((tItem) => tItem.id === selectedTodoId) ?? null,
    [todos, selectedTodoId],
  );

  const handleToggleDragLock = useCallback(
    (locked: boolean) => {
      setDragLocked(locked);
      if (locked) {
        setDraggedTodoId(null);
        setTodoDropTarget(null);
      }
      void api.updateSettings({ dragLocked: locked }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      });
    },
    [showInfoToast, loadData, formatUiError],
  );

  const handleReorderCategories = useCallback(
    (orderedIds: string[]) => {
      const seq = reorderCatSeqRef.current + 1;
      reorderCatSeqRef.current = seq;
      const orderLookup = new Map(orderedIds.map((id, idx) => [id, idx]));
      setCategories((prev) =>
        sortCategoriesWithPin(
          prev.map((c) => ({ ...c, sortOrder: orderLookup.get(c.id) ?? c.sortOrder })),
        ),
      );
      void api.reorderCategories(orderedIds).catch((err) => {
        if (reorderCatSeqRef.current === seq) {
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
        }
      });
    },
    [showInfoToast, loadData, formatUiError],
  );

  const isCompletedView = activeView.type === 'smart' && activeView.id === 'completed';
  const canDragTodos =
    !dragLocked && !deferredSearchQuery.trim() && !tagFilter && visibleTodos.length > 1;

  const visibleTodosRef = useRef(visibleTodos);
  visibleTodosRef.current = visibleTodos;
  const draggedTodoIdRef = useRef(draggedTodoId);
  draggedTodoIdRef.current = draggedTodoId;
  const canDragTodosRef = useRef(canDragTodos);
  canDragTodosRef.current = canDragTodos;
  const dragLockedRef = useRef(dragLocked);
  dragLockedRef.current = dragLocked;
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;

  const handleDropTodo = useCallback(
    (sourceId: string, targetId: string, position: 'before' | 'after') => {
      if (dragLockedRef.current || sourceId === targetId) return;

      const currentVisible = visibleTodosRef.current;
      const sourceTodo = currentVisible.find((tItem) => tItem.id === sourceId);
      const targetTodo = currentVisible.find((tItem) => tItem.id === targetId);
      if (!sourceTodo || !targetTodo) return;
      if (sourceTodo.pinned !== targetTodo.pinned || sourceTodo.completed !== targetTodo.completed) {
        return;
      }

      const visibleIds = currentVisible.map((tItem) => tItem.id);
      const reorderedVisible = moveIdRelative(visibleIds, sourceId, targetId, position);
      const visibleSet = new Set(reorderedVisible);

      const allSorted = [...todosRef.current].sort((a, b) => a.sortOrder - b.sortOrder);
      let cursor = 0;
      const nextOrderedIds = allSorted.map((tItem) => {
        if (visibleSet.has(tItem.id)) {
          const replacement = reorderedVisible[cursor];
          cursor += 1;
          return replacement;
        }
        return tItem.id;
      });

      const finalOrderMap = new Map(nextOrderedIds.map((tid, i) => [tid, i]));
      if (sortByRef.current !== 'manual') {
        setSortBy('manual');
      }
      setTodos((prev) =>
        prev.map((tItem) => ({
          ...tItem,
          sortOrder: finalOrderMap.get(tItem.id) ?? tItem.sortOrder,
        })),
      );
      const seq = reorderTodoSeqRef.current + 1;
      reorderTodoSeqRef.current = seq;
      void api.reorderTodos(nextOrderedIds).catch((err) => {
        if (reorderTodoSeqRef.current === seq) {
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
        }
      });
    },
    [showInfoToast, loadData, formatUiError],
  );

  keyboardReorderRef.current = (direction: 'up' | 'down') => {
    if (!canDragTodos || !selectedTodoId) return;
    const idx = visibleTodos.findIndex((tItem) => tItem.id === selectedTodoId);
    if (idx === -1) return;
    const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
    const neighbor = visibleTodos[neighborIdx];
    if (!neighbor) return;
    handleDropTodo(selectedTodoId, neighbor.id, direction === 'up' ? 'before' : 'after');
  };

  const handleSelectTodo = useCallback((id: string) => {
    setSelectedTodoId((prev) => (prev === id ? null : id));
  }, []);

  const handleToggleTodoComplete = useCallback(
    (id: string, completed: boolean) => {
      void handleUpdateTodo(id, { completed });
    },
    [handleUpdateTodo],
  );

  const handleToggleTodoImportant = useCallback(
    (id: string, important: boolean) => {
      void handleUpdateTodo(id, { important });
    },
    [handleUpdateTodo],
  );

  const handleToggleTodoPin = useCallback(
    (id: string, pinned: boolean) => {
      void handleUpdateTodo(id, { pinned });
    },
    [handleUpdateTodo],
  );

  const handleTodoDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      setDraggedTodoId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/agendamea-todo', id);
      e.dataTransfer.setData('text/plain', id);
    },
    [],
  );

  const handleTodoDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      const draggedId = draggedTodoIdRef.current;
      if (!canDragTodosRef.current || !draggedId || draggedId === id) return;
      const list = visibleTodosRef.current;
      const sourceTodo = list.find((tItem) => tItem.id === draggedId);
      const targetTodo = list.find((tItem) => tItem.id === id);
      if (
        !sourceTodo ||
        !targetTodo ||
        sourceTodo.pinned !== targetTodo.pinned ||
        sourceTodo.completed !== targetTodo.completed
      ) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const position = getVerticalDropPosition(
        e.clientY,
        e.currentTarget.getBoundingClientRect(),
      );
      setTodoDropTarget((prev) =>
        prev && prev.id === id && prev.position === position ? prev : { id, position },
      );
    },
    [],
  );

  const handleTodoDragLeave = useCallback((id: string) => {
    setTodoDropTarget((prev) => (prev && prev.id === id ? null : prev));
  }, []);

  const handleTodoDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      if (!canDragTodosRef.current) return;
      e.preventDefault();
      const sourceId = draggedTodoIdRef.current ?? e.dataTransfer.getData('text/agendamea-todo');
      if (sourceId && sourceId !== targetId) {
        const position = getVerticalDropPosition(
          e.clientY,
          e.currentTarget.getBoundingClientRect(),
        );
        handleDropTodo(sourceId, targetId, position);
      }
      setDraggedTodoId(null);
      setTodoDropTarget(null);
    },
    [handleDropTodo],
  );

  const handleTodoDragEnd = useCallback(() => {
    setDraggedTodoId(null);
    setTodoDropTarget(null);
  }, []);

  const handleWindowNotify = useCallback(
    (msg: string) => showInfoToast(msg, 'info'),
    [showInfoToast],
  );

  const handleSelectView = useCallback((view: ActiveView) => {
    setActiveView(view);
    setStatusFilter('all');
    setTagFilter(null);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    setTagFilter((prev) => (prev && prev.toLowerCase() === tag.toLowerCase() ? null : tag));
  }, []);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const handleCompleteWelcome = useCallback(
    (openSettingsAfter = false) => {
      setIsWelcomeOpen(false);
      try {
        localStorage.setItem('agendamea-onboarding-completed', 'true');
      } catch {
        // Ignore storage errors
      }
      void api.updateSettings({ onboardingCompleted: true }).catch(() => {});
      if (openSettingsAfter) {
        setIsSettingsOpen(true);
      } else {
        scheduleFocus(() => quickAddRef.current?.focus(), 60);
      }
    },
    [scheduleFocus],
  );

  const handleOpenWelcomeGuide = useCallback(() => {
    setIsSettingsOpen(false);
    setIsWelcomeOpen(true);
  }, []);

  const handleCloseMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTodoId(null);
  }, []);

  const handleClearAllCompleted = useCallback(
    () => handleClearCompleted(null),
    [handleClearCompleted],
  );

  const handleUndoClick = useCallback(() => {
    void handleUndoSoftDelete();
  }, [handleUndoSoftDelete]);

  const handleRestoreOneDriveFromBanner = useCallback(async () => {
    if (isRestoringOneDrivePrompt) return;
    setIsRestoringOneDrivePrompt(true);
    try {
      const { bootstrap } = await api.syncOneDrivePull();
      setOneDrivePrompt(null);
      setIsWelcomeOpen(false);
      try {
        localStorage.setItem('agendamea-onedrive-prompt-dismissed', 'true');
        localStorage.setItem('agendamea-onboarding-completed', 'true');
      } catch {
        // Ignore storage error
      }
      void api.updateSettings({ onboardingCompleted: true }).catch(() => {});
      handleApplyRestoredBootstrap(bootstrap);
    } catch (err) {
      showInfoToast(formatUiError(err), 'error');
    } finally {
      setIsRestoringOneDrivePrompt(false);
    }
  }, [isRestoringOneDrivePrompt, handleApplyRestoredBootstrap, showInfoToast, formatUiError]);

  const handleDismissOneDriveBanner = useCallback(() => {
    setOneDrivePrompt(null);
    try {
      localStorage.setItem('agendamea-onedrive-prompt-dismissed', 'true');
    } catch {
      // Ignore storage error
    }
  }, []);

  const handleOpenOneDriveFolderFromBanner = useCallback(() => {
    void api.openOneDriveFolder(oneDrivePrompt?.folderPath).catch(() => {});
  }, [oneDrivePrompt]);

  const smartViewTitles: Record<string, string> = {
    all: t.allTasks,
    today: t.today,
    important: t.important,
    completed: t.completed,
  };

  const activeCategory =
    activeView.type === 'category' ? categoryMap.get(activeView.id) : undefined;
  const viewTitle =
    activeView.type === 'smart'
      ? smartViewTitles[activeView.id]
      : activeCategory?.name ?? t.categories;

  return (
    <I18nProvider lang={language} onChangeLanguage={handleChangeLanguage}>
      <div className="relative flex h-full w-full overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
        {/* Sidebar Navigation */}
        <Sidebar
          activeView={activeView}
          onSelectView={handleSelectView}
          categories={categories}
          counts={counts}
          dragLocked={dragLocked}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapse}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchInputRef={searchInputRef}
          onOpenSettings={handleOpenSettings}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onTogglePinCategory={handleTogglePinCategory}
          onDeleteCategory={handleDeleteCategory}
          onReorderCategories={handleReorderCategories}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={handleCloseMobileSidebar}
        />

        {/* Main Content Area */}
        <div className="relative flex flex-1 min-w-0 flex-col h-full overflow-hidden">
          <div
            aria-hidden="true"
            className="app-drag-region absolute left-0 right-36 top-0 z-10 h-9 select-none"
          />

          <main className="flex-1 overflow-y-auto px-4 pt-11 pb-8 sm:px-8 sm:pt-10">
            <div className="mx-auto w-full max-w-[820px] space-y-5">
              {/* Workspace Title & Date Line */}
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsMobileSidebarOpen(true)}
                    aria-label={t.openMenu}
                    className="app-no-drag flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:hidden shrink-0"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {activeCategory && <ColorDot color={activeCategory.color} size="md" />}
                    <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">
                      {viewTitle}
                    </h1>
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-[var(--text-muted)] capitalize">
                    {todayFormatted}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono-tabular whitespace-nowrap shrink-0">
                    <span>
                      {activeCountInView} {t.activeCountLabel}
                    </span>
                    {completedCountInView > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {completedCountInView} {t.completedCountLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Add Bar */}
              {!isCompletedView && (
                <QuickAddBar
                  inputRef={quickAddRef}
                  categories={categories}
                  todayStr={todayStr}
                  defaultCategoryId={
                    activeView.type === 'category' ? activeView.id : null
                  }
                  defaultImportant={
                    activeView.type === 'smart' && activeView.id === 'important'
                  }
                  defaultDueDate={
                    activeView.type === 'smart' && activeView.id === 'today'
                      ? todayStr
                      : null
                  }
                  onAdd={handleAddTodo}
                />
              )}

              {/* Filter, Layout View Switcher & Sort Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {!isCompletedView && (
                    <div
                      role="tablist"
                      aria-label={t.filterAll}
                      className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
                    >
                      {(
                        [
                          { id: 'all', label: t.filterAll },
                          { id: 'active', label: t.filterActive },
                          { id: 'completed', label: t.filterCompleted },
                        ] as const
                      ).map((tab) => {
                        const active = statusFilter === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setStatusFilter(tab.id)}
                            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border)]'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 4-Way Layout Switcher (List | Kanban | Calendar | Matrix) */}
                  <div
                    role="tablist"
                    aria-label={t.viewList}
                    data-testid="layout-mode-switcher"
                    className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
                  >
                    {(
                      [
                        { id: 'list', label: t.viewList, Icon: List },
                        { id: 'kanban', label: t.viewKanban, Icon: Columns3 },
                        { id: 'calendar', label: t.viewCalendar, Icon: CalendarIcon },
                        { id: 'matrix', label: t.viewMatrix, Icon: Grid2x2 },
                      ] as const
                    ).map(({ id, label, Icon }) => {
                      const active = layoutMode === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          data-testid={`layout-tab-${id}`}
                          aria-selected={active}
                          onClick={() => setLayoutMode(id)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {tagFilter && (
                    <button
                      type="button"
                      onClick={() => setTagFilter(null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors"
                    >
                      <Hash className="h-3 w-3 text-[var(--accent)]" />
                      <span>{tagFilter}</span>
                      <X className="h-3 w-3 text-[var(--text-muted)]" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {completedCountInView > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleClearCompleted()}
                      className="text-xs font-medium text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap"
                    >
                      {t.clearCompleted}
                    </button>
                  )}

                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="sr-only">{t.sortCustom}</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label={t.sortCustom}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors focus:border-[var(--border-strong)] focus:outline-none cursor-pointer"
                    >
                      <option value="manual">{t.sortCustom}</option>
                      <option value="priority">{t.sortPriority}</option>
                      <option value="dueDate">{t.sortDueDate}</option>
                      <option value="newest">{t.sortNewest}</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* First-Launch OneDrive Cloud Backup Recovery Prompt */}
              {oneDrivePrompt && (
                <div
                  role="region"
                  aria-label={t.onedriveBackupDetectedTitle}
                  data-testid="onedrive-recovery-banner"
                  className="rounded-xl border border-[var(--accent)]/45 bg-[var(--surface)] p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        <Cloud className="h-4 w-4" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                            {t.onedriveBackupDetectedTitle}
                          </h2>
                          {((oneDrivePrompt.remoteTodoCount ?? 0) > 0 ||
                            (oneDrivePrompt.remoteCategoryCount ?? 0) > 0) && (
                            <span className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                              {(oneDrivePrompt.remoteTodoCount ?? 0) > 0
                                ? `${oneDrivePrompt.remoteTodoCount} ${t.tasksTitle.toLowerCase()}`
                                : `${oneDrivePrompt.remoteCategoryCount} ${t.categories.toLowerCase()}`}
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                          {t.onedriveBackupDetectedDesc}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDismissOneDriveBanner}
                      aria-label={t.closeMenu}
                      className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-12">
                    <button
                      type="button"
                      disabled={isRestoringOneDrivePrompt}
                      onClick={() => void handleRestoreOneDriveFromBanner()}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-45"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {isRestoringOneDrivePrompt ? t.restoringButton : t.onedriveRestoreButton}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isRestoringOneDrivePrompt}
                      onClick={handleDismissOneDriveBanner}
                      className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      {t.onedriveStartFreshButton}
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenOneDriveFolderFromBanner}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>{t.onedriveOpenFolderButton}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error State */}
              {loadError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                >
                  <span>{loadError}</span>
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    className="rounded-md border border-current px-3 py-1 text-xs font-medium whitespace-nowrap"
                  >
                    {t.retry}
                  </button>
                </div>
              )}

              {/* Loading Skeleton */}
              {isLoading ? (
                <div
                  aria-busy="true"
                  aria-label="Agendamea"
                  className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
                >
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)] last:border-b-0"
                    >
                      <div className="h-5 w-5 rounded-full bg-[var(--surface-hover)] animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-2/3 rounded bg-[var(--surface-hover)] animate-pulse" />
                        <div className="h-3 w-1/3 rounded bg-[var(--surface-subtle)] animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : layoutMode === 'calendar' ? (
                <CalendarPlannerView
                  todos={visibleTodos}
                  categoryMap={categoryMap}
                  todayStr={todayStr}
                  selectedTodoId={selectedTodoId}
                  dragLocked={dragLocked}
                  onSelectTodo={handleSelectTodo}
                  onToggleComplete={handleToggleTodoComplete}
                  onToggleImportant={handleToggleTodoImportant}
                  onTogglePin={handleToggleTodoPin}
                  onUpdateTodo={handleUpdateTodo}
                  onTagClick={handleTagClick}
                />
              ) : layoutMode === 'kanban' ? (
                <KanbanBoardView
                  todos={visibleTodos}
                  categoryMap={categoryMap}
                  todayStr={todayStr}
                  selectedTodoId={selectedTodoId}
                  dragLocked={dragLocked}
                  onSelectTodo={handleSelectTodo}
                  onToggleComplete={handleToggleTodoComplete}
                  onToggleImportant={handleToggleTodoImportant}
                  onTogglePin={handleToggleTodoPin}
                  onUpdateTodo={handleUpdateTodo}
                  onTagClick={handleTagClick}
                />
              ) : layoutMode === 'matrix' ? (
                <EisenhowerMatrixView
                  todos={visibleTodos}
                  categoryMap={categoryMap}
                  todayStr={todayStr}
                  selectedTodoId={selectedTodoId}
                  dragLocked={dragLocked}
                  onSelectTodo={handleSelectTodo}
                  onToggleComplete={handleToggleTodoComplete}
                  onToggleImportant={handleToggleTodoImportant}
                  onTogglePin={handleToggleTodoPin}
                  onUpdateTodo={handleUpdateTodo}
                  onTagClick={handleTagClick}
                />
              ) : visibleTodos.length === 0 ? (
                /* Clean Empty State */
                <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
                  <div
                    className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    <CheckCheck className="h-5 w-5" />
                  </div>
                  <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {searchQuery.trim() || tagFilter
                      ? t.emptySearchTitle
                      : isCompletedView
                        ? t.emptyCompletedTitle
                        : t.emptyListTitle}
                  </h2>
                  <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
                    {searchQuery.trim() || tagFilter
                      ? t.emptySearchDesc
                      : isCompletedView
                        ? t.emptyCompletedDesc
                        : t.emptyListDesc}
                  </p>
                  {searchQuery.trim() || tagFilter ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setTagFilter(null);
                      }}
                      className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      {t.clearSearch}
                    </button>
                  ) : !isCompletedView ? (
                    <button
                      type="button"
                      onClick={() => quickAddRef.current?.focus()}
                      className="mt-4 rounded-lg px-4 py-2 text-xs font-medium transition-opacity"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      {t.addFirstTaskButton}
                    </button>
                  ) : null}
                </div>
              ) : (
                /* Flat Single-Container Task List */
                <div
                  data-testid="todo-list"
                  className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
                >
                  {visibleTodos.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      category={
                        todo.categoryId ? categoryMap.get(todo.categoryId) : undefined
                      }
                      todayStr={todayStr}
                      isSelected={selectedTodoId === todo.id}
                      canDrag={canDragTodos}
                      isDragging={draggedTodoId === todo.id}
                      dropIndicator={
                        todoDropTarget && todoDropTarget.id === todo.id
                          ? todoDropTarget.position
                          : null
                      }
                      onSelect={handleSelectTodo}
                      onToggleComplete={handleToggleTodoComplete}
                      onToggleImportant={handleToggleTodoImportant}
                      onTogglePin={handleToggleTodoPin}
                      onDelete={handleDeleteTodo}
                      onDragStart={handleTodoDragStart}
                      onDragOver={handleTodoDragOver}
                      onDragLeave={handleTodoDragLeave}
                      onDrop={handleTodoDrop}
                      onDragEnd={handleTodoDragEnd}
                      onTagClick={handleTagClick}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Right Detail Inspector Panel */}
        {selectedTodo && (
          <>
            <button
              type="button"
              aria-label={t.closeMenu}
              onClick={handleCloseDetail}
              className="fixed inset-0 z-20 bg-black/35 lg:hidden"
            />
            <TodoDetailPanel
              todo={selectedTodo}
              categories={categories}
              todayStr={todayStr}
              onClose={handleCloseDetail}
              onUpdate={handleUpdateTodo}
              onDelete={handleDeleteTodo}
              onAddSubtask={handleAddSubtask}
              onToggleSubtask={handleToggleSubtask}
              onDeleteSubtask={handleDeleteSubtask}
            />
          </>
        )}

        <ToastContainer
          undoToast={undoToast}
          infoToast={infoToast}
          onUndo={handleUndoClick}
          onClearUndo={clearUndoToast}
          onPauseUndo={pauseUndoToast}
          onResumeUndo={resumeUndoToast}
          onClearInfo={clearInfoToast}
        />

        {/* Lazy-Loaded Settings Modal */}
        {isSettingsOpen && (
          <Suspense fallback={null}>
            <SettingsModal
              onClose={handleCloseSettings}
              themeMode={themeMode}
              themeId={themeId}
              customThemeColor={customThemeColor}
              appIconId={appIconId}
              customIconColor={customIconColor}
              zoomPercent={zoomPercent}
              highContrast={highContrast}
              reducedMotion={reducedMotion}
              closeBehavior={closeBehavior}
              dragLocked={dragLocked}
              onChangeMode={handleModeChange}
              onChangeTheme={handleThemeChange}
              onChangeCustomThemeColor={handleCustomThemeColorChange}
              onChangeAppIcon={handleAppIconChange}
              onChangeCustomIconColor={handleCustomIconColorChange}
              onChangeZoomPercent={handleZoomPercentChange}
              onToggleHighContrast={handleToggleHighContrast}
              onToggleReducedMotion={handleToggleReducedMotion}
              onChangeCloseBehavior={handleCloseBehaviorChange}
              onToggleDragLock={handleToggleDragLock}
              autoUpdateCheck={autoUpdateCheck}
              onToggleAutoUpdateCheck={handleToggleAutoUpdateCheck}
              updateState={updateState}
              onCheckForUpdates={handleManualCheckForUpdates}
              onDownloadAndInstall={handleDownloadAndInstallUpdate}
              totalTodoCount={todos.length}
              completedTodoCount={counts.smart.completed}
              onClearAllCompleted={handleClearAllCompleted}
              onImportBackup={handleImportBackup}
              onApplyRestoredBootstrap={handleApplyRestoredBootstrap}
              trashedCategories={trashedCategories}
              trashedTodos={trashedTodos}
              onRestoreTodo={handleRestoreTodo}
              onPermanentDeleteTodo={handlePermanentDeleteTodo}
              onRestoreCategory={handleRestoreCategory}
              onPermanentDeleteCategory={handlePermanentDeleteCategory}
              onEmptyTrash={handleEmptyTrash}
              onOpenWelcomeGuide={handleOpenWelcomeGuide}
            />
          </Suspense>
        )}

        {/* PowerPilot-Style Close Action Modal (Minimize to Tray vs Quit Completely) */}
        {isCloseModalOpen && (
          <CloseActionModal
            onSelectAction={(action, remember) => void handleCloseModalSelectAction(action, remember)}
            onCancel={() => setIsCloseModalOpen(false)}
          />
        )}

        {/* First-Launch Welcome & Onboarding Modal */}
        {isWelcomeOpen && !oneDrivePrompt && !isSettingsOpen && (
          <WelcomeModal
            themeMode={themeMode}
            themeId={themeId}
            customThemeColor={customThemeColor}
            onChangeMode={handleModeChange}
            onChangeTheme={handleThemeChange}
            onChangeCustomThemeColor={handleCustomThemeColorChange}
            onComplete={handleCompleteWelcome}
          />
        )}

        <OfflineIndicator />

        <div className="app-no-drag fixed top-2 right-2.5 z-[60]">
          <WindowControls onNotify={handleWindowNotify} />
        </div>
      </div>
    </I18nProvider>
  );
}
