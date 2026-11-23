import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  Check,
  CheckCheck,
  Cloud,
  Columns3,
  Copy,
  Eye,
  FolderOpen,
  Grid2x2,
  Hash,
  List,
  Menu,
  Pin,
  SlidersHorizontal,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from './api/client';
import { subscribeServerEvents } from './api/eventStream';
import { CloseActionModal } from './components/CloseActionModal';
import { ColorDot } from './components/ColorDot';
import { ContextMenu } from './components/ContextMenu';
import { OfflineIndicator } from './components/OfflineIndicator';
import { QuickAddBar } from './components/QuickAddBar';
import { SelectField } from './components/SelectField';
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
import { useAppUpdater } from './hooks/useAppUpdater';
import { useDelayedFocus } from './hooks/useDelayedFocus';
import { useNotificationCenter } from './hooks/useNotificationCenter';
import { useThemeAndPreferences } from './hooks/useThemeAndPreferences';
import { useToast } from './hooks/useToast';
import { useTodayDate } from './hooks/useTodayDate';
import { useTodoDragReorder } from './hooks/useTodoDragReorder';
import {
  DEFAULT_CUSTOM_SHORTCUTS,
  matchesShortcutEvent,
  sanitizeCustomShortcuts,
  type CustomShortcutsMap,
  type ShortcutActionId,
} from './utils/shortcuts';
import { I18nProvider } from './i18n/I18nContext';
import type { LanguageCode } from './i18n/languages';
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
  SettingsTabId,
  SortOption,
  StatusFilter,
  ThemeId,
  ThemeMode,
  Todo,
  TodoPatch,
} from './types';
import {
  clampZoomPercent,
  getNextZoomPreset,
  getPrevZoomPreset,
  normalizeHexColor,
} from './utils/themes';
import {
  addDaysToDateString,
  computeViewCounts,
  filterAndSortTodos,
  sortCategoriesWithPin,
} from './utils/todoLogic';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  const {
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
  } = useThemeAndPreferences();

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [dragLocked, setDragLocked] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('appearance');
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const welcomeCheckedRef = useRef(false);

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
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [voiceShortcut, setVoiceShortcut] = useState('CommandOrControl+Alt+Space');
  const [globalQuickAddShortcutKey, setGlobalQuickAddShortcutKey] = useState(
    'CommandOrControl+Alt+N',
  );
  const [customShortcuts, setCustomShortcuts] = useState<CustomShortcutsMap>({
    ...DEFAULT_CUSTOM_SHORTCUTS,
  });
  const customShortcutsRef = useRef(customShortcuts);
  customShortcutsRef.current = customShortcuts;
  const [todoContextMenu, setTodoContextMenu] = useState<{
    x: number;
    y: number;
    todo: Todo;
  } | null>(null);
  const [dayContextMenu, setDayContextMenu] = useState<{
    x: number;
    y: number;
    dateStr: string;
  } | null>(null);

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
  const pendingDeletesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const pendingSubtaskDeletesRef = useRef<Set<string>>(new Set());
  const isEmptyingTrashRef = useRef(false);
  const pendingTrashOpsRef = useRef<Set<string>>(new Set());
  const todosRef = useRef(todos);
  todosRef.current = todos;
  const trashedCategoriesRef = useRef(trashedCategories);
  trashedCategoriesRef.current = trashedCategories;

  const formatUiError = useCallback(
    (err: unknown, fallback?: string): string => {
      const dict = tRef.current;
      return localizeErrorMessage(
        err,
        fallback ?? dict.operationFailedToast,
        langRef.current,
        dict,
      );
    },
    [langRef, tRef],
  );

  const {
    notificationProfile,
    notificationLeadMinutes,
    notificationChannels,
    hydrateNotificationSettings,
    applyNotificationProfile,
    updateNotificationChannel,
    updateNotificationLeadMinutes,
    dispatchNotification,
    sendTestNotification,
  } = useNotificationCenter({ todos, tRef, showInfoToast });

  const dispatchUpdateNotification = useCallback(
    (payload: { title: string; body?: string }) => {
      dispatchNotification('appUpdates', payload);
    },
    [dispatchNotification],
  );

  const dispatchVoiceNotification = useCallback(
    (payload: { title: string; body?: string; variant?: 'info' | 'error' }) => {
      dispatchNotification('voiceAssistant', payload);
    },
    [dispatchNotification],
  );

  const dispatchCloudSyncNotification = useCallback(
    (payload: { title: string; body?: string; variant?: 'info' | 'error' }) => {
      dispatchNotification('cloudSync', payload);
    },
    [dispatchNotification],
  );

  const {
    autoUpdateCheck,
    setAutoUpdateCheck,
    updateState,
    handleManualCheckForUpdates,
    handleDownloadAndInstallUpdate,
    handleQuitAndInstallUpdate,
    handleToggleAutoUpdateCheck,
  } = useAppUpdater({ tRef, showInfoToast, formatUiError, dispatchUpdateNotification });

  // Listen for Electron close / global quick-add / desktop notification click / Windows Jump List events
  useEffect(() => {
    const unsubClose = window.agendameaWindow?.onCloseRequested?.(() => {
      setIsCloseModalOpen(true);
    });
    const unsubQuickAdd = window.agendameaWindow?.onFocusQuickAdd?.(() => {
      setIsSettingsOpen(false);
      setIsWelcomeOpen(false);
      setIsCloseModalOpen(false);
      scheduleFocus(() => quickAddRef.current?.focus(), 60);
    });
    const unsubNavView = window.agendameaWindow?.onNavigateSmartView?.((viewId) => {
      if (viewId === 'today' || viewId === 'important' || viewId === 'all') {
        setIsSettingsOpen(false);
        setIsWelcomeOpen(false);
        setIsCloseModalOpen(false);
        setActiveView({ type: 'smart', id: viewId });
      }
    });
    const unsubFocusTodo = window.agendameaWindow?.onFocusTodo?.((todoId) => {
      if (typeof todoId === 'string' && todoId.trim()) {
        setIsSettingsOpen(false);
        setIsWelcomeOpen(false);
        setIsCloseModalOpen(false);
        setActiveView({ type: 'smart', id: 'all' });
        setSelectedTodoId(todoId);
      }
    });
    return () => {
      if (typeof unsubClose === 'function') unsubClose();
      if (typeof unsubQuickAdd === 'function') unsubQuickAdd();
      if (typeof unsubNavView === 'function') unsubNavView();
      if (typeof unsubFocusTodo === 'function') unsubFocusTodo();
    };
  }, [scheduleFocus]);

  const loadData = useCallback(async (silent = false, fromExternalSse = false) => {
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
      setWebhookEnabled(Boolean(data.settings.webhookEnabled));
      setWebhookUrl(data.settings.webhookUrl ?? '');
      setWebhookSecret(data.settings.webhookSecret ?? '');
      if (typeof data.settings.voiceShortcut === 'string' && data.settings.voiceShortcut.trim()) {
        setVoiceShortcut(data.settings.voiceShortcut.trim());
      }
      if (
        typeof data.settings.globalQuickAddShortcutKey === 'string' &&
        data.settings.globalQuickAddShortcutKey.trim()
      ) {
        setGlobalQuickAddShortcutKey(data.settings.globalQuickAddShortcutKey.trim());
      }
      setCustomShortcuts(sanitizeCustomShortcuts(data.settings.customShortcuts));
      hydrateNotificationSettings(data.settings);
      await syncFromBootstrapSettings(data.settings, { fromExternalSse });
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
  }, [
    formatUiError,
    hydrateNotificationSettings,
    setAutoUpdateCheck,
    syncFromBootstrapSettings,
    tRef,
  ]);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // Live refresh whenever external CLI, MCP server, or Incoming Webhook mutates tasks (shared SSE bus)
  useEffect(() => {
    let refreshTimer: number | null = null;
    const unsub = subscribeServerEvents((parsed) => {
      if (parsed?.type === 'ai.download.progress' && parsed.done && parsed.ok !== false) {
        const modelLabel = typeof parsed.modelId === 'string' ? parsed.modelId : '';
        dispatchVoiceNotification({
          title: tRef.current.notificationsEventVoice,
          body: modelLabel
            ? `${modelLabel} (${tRef.current.aiModelInstalledBadge})`
            : tRef.current.aiModelInstalledBadge,
        });
        return;
      }
      if (parsed?.type === 'tts.download.progress' && parsed.done && parsed.ok !== false) {
        const voiceLabel = typeof parsed.voiceId === 'string' ? parsed.voiceId : '';
        dispatchVoiceNotification({
          title: tRef.current.notificationsEventVoice,
          body: voiceLabel
            ? `${voiceLabel} (${tRef.current.aiModelInstalledBadge})`
            : tRef.current.aiModelInstalledBadge,
        });
        return;
      }
      if (parsed?.type && parsed.type !== 'changed') {
        return;
      }
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadData(true, true);
      }, 120);
    });
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      unsub();
    };
  }, [dispatchVoiceNotification, loadData]);

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
    if (expandSidebarIfCollapsed()) {
      scheduleFocus(() => searchInputRef.current?.focus(), 80);
      return;
    }
    searchInputRef.current?.focus();
  }, [scheduleFocus, expandSidebarIfCollapsed]);

  const keyboardReorderRef = useRef<((direction: 'up' | 'down') => void) | null>(null);
  const keyStateRef = useRef({
    isSettingsOpen,
    isWelcomeOpen,
    isCloseModalOpen,
    isMobileSidebarOpen,
    selectedTodoId,
    searchQuery,
    searchDateFrom,
    searchDateTo,
    tagFilter,
    focusSidebarSearch,
    zoomPercent,
    customShortcuts,
  });
  keyStateRef.current = {
    isSettingsOpen,
    isWelcomeOpen,
    isCloseModalOpen,
    isMobileSidebarOpen,
    selectedTodoId,
    searchQuery,
    searchDateFrom,
    searchDateTo,
    tagFilter,
    focusSidebarSearch,
    zoomPercent,
    customShortcuts,
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
          const next = getNextZoomPreset(state.zoomPercent);
          setZoomPercent(next);
          void api.updateSettings({ zoomPercent: next }).catch(() => {});
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          const next = getPrevZoomPreset(state.zoomPercent);
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
        } else if (state.searchQuery || state.searchDateFrom || state.searchDateTo) {
          setSearchQuery('');
          setSearchDateFrom('');
          setSearchDateTo('');
          setIsDateFilterOpen(false);
        } else if (state.tagFilter) {
          setTagFilter(null);
        }
        return;
      }

      if (isTypingField || state.isSettingsOpen || state.isWelcomeOpen || state.isCloseModalOpen) return;

      const sc = state.customShortcuts;
      if (matchesShortcutEvent(e, sc.openSettings)) {
        e.preventDefault();
        setSettingsInitialTab('appearance');
        setIsSettingsOpen(true);
        return;
      }
      if (matchesShortcutEvent(e, sc.reorderUp)) {
        e.preventDefault();
        keyboardReorderRef.current?.('up');
        return;
      }
      if (matchesShortcutEvent(e, sc.reorderDown)) {
        e.preventDefault();
        keyboardReorderRef.current?.('down');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewList)) {
        e.preventDefault();
        setLayoutMode('list');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewKanban)) {
        e.preventDefault();
        setLayoutMode('kanban');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewCalendar)) {
        e.preventDefault();
        setLayoutMode('calendar');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewMatrix)) {
        e.preventDefault();
        setLayoutMode('matrix');
        return;
      }
      if (matchesShortcutEvent(e, sc.search)) {
        e.preventDefault();
        state.focusSidebarSearch();
      } else if (matchesShortcutEvent(e, sc.newTask)) {
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

  const handleToggleLaunchAtStartup = useCallback(
    (enabled: boolean) => {
      setLaunchAtStartup(enabled);
      void window.agendameaWindow?.setLaunchAtStartup?.(enabled);
      void api.updateSettings({ launchAtStartup: enabled }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleToggleGlobalQuickAddShortcut = useCallback(
    (enabled: boolean) => {
      setGlobalQuickAddShortcut(enabled);
      void window.agendameaWindow?.setGlobalQuickAddShortcut?.(enabled);
      void api.updateSettings({ globalQuickAddShortcut: enabled }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleChangeGlobalQuickAddShortcutKey = useCallback(
    (nextKey: string) => {
      setGlobalQuickAddShortcutKey(nextKey);
      void window.agendameaWindow?.setGlobalQuickAddShortcutKey?.(nextKey);
      void api.updateSettings({ globalQuickAddShortcutKey: nextKey }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleChangeVoiceShortcut = useCallback(
    (nextKey: string) => {
      setVoiceShortcut(nextKey);
      void window.agendameaWindow?.setVoiceShortcut?.(nextKey);
      void api.updateSettings({ voiceShortcut: nextKey }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleChangeCustomShortcut = useCallback(
    (action: ShortcutActionId, nextShortcut: string) => {
      const next: CustomShortcutsMap = { ...customShortcutsRef.current, [action]: nextShortcut };
      customShortcutsRef.current = next;
      setCustomShortcuts(next);
      void api.updateSettings({ customShortcuts: next }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  const handleResetAllShortcuts = useCallback(() => {
    const defaults = { ...DEFAULT_CUSTOM_SHORTCUTS };
    setCustomShortcuts(defaults);
    setGlobalQuickAddShortcutKey('CommandOrControl+Alt+N');
    setVoiceShortcut('CommandOrControl+Alt+Space');
    void window.agendameaWindow?.setGlobalQuickAddShortcutKey?.('CommandOrControl+Alt+N');
    void window.agendameaWindow?.setVoiceShortcut?.('CommandOrControl+Alt+Space');
    void api
      .updateSettings({
        customShortcuts: defaults,
        globalQuickAddShortcutKey: 'CommandOrControl+Alt+N',
        voiceShortcut: 'CommandOrControl+Alt+Space',
      })
      .catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
  }, [showInfoToast, formatUiError]);

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
    [setCloseBehavior],
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
        return created;
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
      subtaskUpdateSeqRef.current.clear();
      setCategories(sortCategoriesWithPin(restored.categories));
      setTodos(restored.todos);
      setTrashedCategories(restored.trashedCategories);
      setTrashedTodos(restored.trashedTodos);
      applyRestoredSettings(restored.settings);
      setDragLocked(Boolean(restored.settings.dragLocked));
      setAutoUpdateCheck(
        restored.settings.autoUpdateCheck === undefined
          ? true
          : Boolean(restored.settings.autoUpdateCheck),
      );
      setWebhookEnabled(Boolean(restored.settings.webhookEnabled));
      setWebhookUrl(restored.settings.webhookUrl ?? '');
      setWebhookSecret(restored.settings.webhookSecret ?? '');
      setVoiceShortcut(restored.settings.voiceShortcut || 'CommandOrControl+Alt+Space');
      setGlobalQuickAddShortcutKey(
        restored.settings.globalQuickAddShortcutKey || 'CommandOrControl+Alt+N',
      );
      setCustomShortcuts(sanitizeCustomShortcuts(restored.settings.customShortcuts));
      hydrateNotificationSettings(restored.settings);
      setSelectedTodoId(null);
      setTagFilter(null);
      setSearchQuery('');
      setSearchDateFrom('');
      setSearchDateTo('');
      setIsDateFilterOpen(false);
      setStatusFilter('all');
      setOneDrivePrompt(null);
      setActiveView({ type: 'smart', id: 'all' });
      showInfoToast(tRef.current.backupRestoredToast);
    },
    [
      clearUndoToast,
      applyRestoredSettings,
      hydrateNotificationSettings,
      setAutoUpdateCheck,
      showInfoToast,
      tRef,
    ],
  );

  const handleImportBackup = useCallback(
    async (payload: unknown) => {
      const restored = await api.importBackup(payload);
      handleApplyRestoredBootstrap(restored);
    },
    [handleApplyRestoredBootstrap],
  );

  const handleResetAllData = useCallback(
    async (resetSettings: boolean) => {
      const fresh = await api.resetAllData({ resetSettings });
      setSearchQuery('');
      setSearchDateFrom('');
      setSearchDateTo('');
      setIsDateFilterOpen(false);
      setTagFilter(null);
      setActiveView({ type: 'smart', id: 'all' });
      setOneDrivePrompt(null);
      clearUndoToast();
      todoUpdateSeqRef.current.clear();
      categoryUpdateSeqRef.current.clear();
      subtaskUpdateSeqRef.current.clear();
      setCategories(fresh.categories);
      setTodos(fresh.todos);
      setTrashedCategories(fresh.trashedCategories);
      setTrashedTodos(fresh.trashedTodos);
      setSelectedTodoId(null);
      if (resetSettings) {
        try {
          localStorage.removeItem('agendamea-theme-mode');
          localStorage.removeItem('agendamea-theme-id');
          localStorage.removeItem('agendamea-custom-theme-color');
          localStorage.removeItem('agendamea-zoom-percent');
          localStorage.removeItem('agendamea-high-contrast');
          localStorage.removeItem('agendamea-reduced-motion');
        } catch {
          // Ignore storage errors
        }
        applyRestoredSettings(fresh.settings);
        setDragLocked(Boolean(fresh.settings.dragLocked));
        setWebhookEnabled(false);
        setWebhookUrl('');
        setWebhookSecret('');
        setVoiceShortcut(fresh.settings.voiceShortcut || 'CommandOrControl+Alt+Space');
        setGlobalQuickAddShortcutKey(
          fresh.settings.globalQuickAddShortcutKey || 'CommandOrControl+Alt+N',
        );
        setCustomShortcuts(sanitizeCustomShortcuts(fresh.settings.customShortcuts));
        hydrateNotificationSettings(fresh.settings);
      }
      showInfoToast(tRef.current.resetDataDoneToast, 'info');
    },
    [clearUndoToast, applyRestoredSettings, hydrateNotificationSettings, showInfoToast, tRef],
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

  const handleRenameSubtask = useCallback(
    async (todoId: string, subtaskId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed || pendingSubtaskDeletesRef.current.has(subtaskId)) return;
      const seq = (subtaskUpdateSeqRef.current.get(subtaskId) ?? 0) + 1;
      subtaskUpdateSeqRef.current.set(subtaskId, seq);

      setTodos((prev) =>
        prev.map((tItem) =>
          tItem.id === todoId
            ? {
                ...tItem,
                subtasks: tItem.subtasks.map((s) =>
                  s.id === subtaskId ? { ...s, title: trimmed } : s,
                ),
              }
            : tItem,
        ),
      );
      try {
        await api.updateSubtask(subtaskId, { title: trimmed });
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
        dateFrom: searchDateFrom,
        dateTo: searchDateTo,
      }),
    [
      todos,
      activeView,
      statusFilter,
      deferredSearchQuery,
      sortBy,
      todayStr,
      tagFilter,
      searchDateFrom,
      searchDateTo,
    ],
  );

  const hasDateRangeFilter = Boolean(searchDateFrom || searchDateTo);
  const showDateRangeBar =
    searchQuery.trim().length > 0 || isDateFilterOpen || hasDateRangeFilter;

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

  const isCompletedView = activeView.type === 'smart' && activeView.id === 'completed';
  const canDragTodos =
    !dragLocked &&
    !deferredSearchQuery.trim() &&
    !tagFilter &&
    !hasDateRangeFilter &&
    visibleTodos.length > 1;

  const {
    draggedTodoId,
    todoDropTarget,
    clearDragState,
    handleDropTodo,
    handleTodoDragStart,
    handleTodoDragOver,
    handleTodoDragLeave,
    handleTodoDrop,
    handleTodoDragEnd,
  } = useTodoDragReorder({
    visibleTodos,
    todosRef,
    setTodos,
    dragLocked,
    canDragTodos,
    sortBy,
    setSortBy,
    showInfoToast,
    formatUiError,
    loadData,
  });

  const handleToggleDragLock = useCallback(
    (locked: boolean) => {
      setDragLocked(locked);
      if (locked) {
        clearDragState();
      }
      void api.updateSettings({ dragLocked: locked }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      });
    },
    [clearDragState, showInfoToast, loadData, formatUiError],
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
      const target = todosRef.current.find((item) => item.id === id);
      void handleUpdateTodo(id, { completed }).then((ok) => {
        if (ok && completed && target) {
          dispatchNotification('taskCompleted', {
            title: tRef.current.markCompletedDone,
            body: target.title,
            todoId: target.id,
          });
        }
      });
    },
    [dispatchNotification, handleUpdateTodo, tRef],
  );

  const handleOpenTodoContextMenu = useCallback((e: React.MouseEvent, todo: Todo) => {
    setDayContextMenu(null);
    setTodoContextMenu({ x: e.clientX, y: e.clientY, todo });
  }, []);

  const handleOpenDayContextMenu = useCallback((e: React.MouseEvent, dateStr: string) => {
    setTodoContextMenu(null);
    setDayContextMenu({ x: e.clientX, y: e.clientY, dateStr });
  }, []);

  const handleCloseTodoContextMenu = useCallback(() => {
    setTodoContextMenu(null);
  }, []);

  const handleCloseDayContextMenu = useCallback(() => {
    setDayContextMenu(null);
  }, []);

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

  const handleWindowNotify = useCallback(
    (msg: string) => showInfoToast(msg, 'info'),
    [showInfoToast],
  );

  const handleSelectView = useCallback((view: ActiveView) => {
    setIsSettingsOpen(false);
    setActiveView(view);
    setStatusFilter('all');
    setTagFilter(null);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (value.trim().length > 0) {
      setIsSettingsOpen(false);
    }
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    setTagFilter((prev) => (prev && prev.toLowerCase() === tag.toLowerCase() ? null : tag));
  }, []);

  const handleOpenSettings = useCallback((tab: SettingsTabId = 'appearance') => {
    setSettingsInitialTab(tab);
    setSelectedTodoId(null);
    setIsSettingsOpen(true);
  }, []);

  const handleOpenDefaultSettings = useCallback(() => {
    handleOpenSettings('appearance');
  }, [handleOpenSettings]);

  const handleOpenMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setActiveView({ type: 'smart', id: 'all' });
    setStatusFilter('all');
    setTagFilter(null);
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
        setSettingsInitialTab('data');
        setSelectedTodoId(null);
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

  const handleSaveWebhook = useCallback(
    async (patch: { webhookEnabled: boolean; webhookUrl: string; webhookSecret: string }) => {
      setWebhookEnabled(patch.webhookEnabled);
      setWebhookUrl(patch.webhookUrl);
      setWebhookSecret(patch.webhookSecret);
      try {
        const updated = await api.updateSettings(patch);
        setWebhookEnabled(Boolean(updated.webhookEnabled));
        setWebhookUrl(updated.webhookUrl ?? '');
        setWebhookSecret(updated.webhookSecret ?? '');
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
      }
    },
    [showInfoToast, formatUiError],
  );

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
      dispatchNotification('cloudSync', {
        title: tRef.current.onedriveSyncedToast,
      });
    } catch (err) {
      showInfoToast(formatUiError(err), 'error');
    } finally {
      setIsRestoringOneDrivePrompt(false);
    }
  }, [
    dispatchNotification,
    isRestoringOneDrivePrompt,
    handleApplyRestoredBootstrap,
    showInfoToast,
    formatUiError,
    tRef,
  ]);

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

  const smartViewTitles = useMemo<Record<string, string>>(
    () => ({
      all: t.allTasks,
      today: t.today,
      important: t.important,
      completed: t.completed,
    }),
    [t.allTasks, t.today, t.important, t.completed],
  );

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
          onSearchChange={handleSearchChange}
          searchInputRef={searchInputRef}
          isSettingsOpen={isSettingsOpen}
          onOpenSettings={handleOpenDefaultSettings}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onTogglePinCategory={handleTogglePinCategory}
          onDeleteCategory={handleDeleteCategory}
          onReorderCategories={handleReorderCategories}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={handleCloseMobileSidebar}
        />

        {/* Main Content Area (Tasks Workspace OR Full-Page Tabbed Settings) */}
        <div className="relative flex flex-1 min-w-0 flex-col h-full overflow-hidden">
          {!isSettingsOpen && (
            <div
              aria-hidden="true"
              className="app-drag-region absolute left-0 right-36 top-0 z-10 h-9 select-none"
            />
          )}

          {isSettingsOpen ? (
            <SettingsModal
              onClose={handleCloseSettings}
              initialTab={settingsInitialTab}
              onOpenMobileSidebar={handleOpenMobileSidebar}
              themeMode={themeMode}
              themeId={themeId}
              customThemeColor={customThemeColor}
              appIconId={appIconId}
              customIconColor={customIconColor}
              zoomPercent={zoomPercent}
              highContrast={highContrast}
              reducedMotion={reducedMotion}
              closeBehavior={closeBehavior}
              launchAtStartup={launchAtStartup}
              globalQuickAddShortcut={globalQuickAddShortcut}
              globalQuickAddShortcutKey={globalQuickAddShortcutKey}
              voiceShortcut={voiceShortcut}
              customShortcuts={customShortcuts}
              onChangeGlobalQuickAddShortcutKey={handleChangeGlobalQuickAddShortcutKey}
              onVoiceShortcutChange={handleChangeVoiceShortcut}
              onChangeCustomShortcut={handleChangeCustomShortcut}
              onResetAllShortcuts={handleResetAllShortcuts}
              notificationProfile={notificationProfile}
              notificationLeadMinutes={notificationLeadMinutes}
              notificationChannels={notificationChannels}
              onApplyNotificationProfile={applyNotificationProfile}
              onChangeNotificationChannel={updateNotificationChannel}
              onChangeNotificationLeadMinutes={updateNotificationLeadMinutes}
              onSendTestNotification={sendTestNotification}
              onNotifyVoice={dispatchVoiceNotification}
              onNotifyCloudSync={dispatchCloudSyncNotification}
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
              onToggleLaunchAtStartup={handleToggleLaunchAtStartup}
              onToggleGlobalQuickAddShortcut={handleToggleGlobalQuickAddShortcut}
              onToggleDragLock={handleToggleDragLock}
              autoUpdateCheck={autoUpdateCheck}
              onToggleAutoUpdateCheck={handleToggleAutoUpdateCheck}
              updateState={updateState}
              onCheckForUpdates={handleManualCheckForUpdates}
              onDownloadAndInstall={handleDownloadAndInstallUpdate}
              onQuitAndInstallUpdate={handleQuitAndInstallUpdate}
              totalTodoCount={todos.length}
              completedTodoCount={counts.smart.completed}
              onClearAllCompleted={handleClearAllCompleted}
              onImportBackup={handleImportBackup}
              onApplyRestoredBootstrap={handleApplyRestoredBootstrap}
              onResetAllData={handleResetAllData}
              trashedCategories={trashedCategories}
              trashedTodos={trashedTodos}
              onRestoreTodo={handleRestoreTodo}
              onPermanentDeleteTodo={handlePermanentDeleteTodo}
              onRestoreCategory={handleRestoreCategory}
              onPermanentDeleteCategory={handlePermanentDeleteCategory}
              onEmptyTrash={handleEmptyTrash}
              onOpenWelcomeGuide={handleOpenWelcomeGuide}
              webhookEnabled={webhookEnabled}
              webhookUrl={webhookUrl}
              webhookSecret={webhookSecret}
              onSaveWebhook={handleSaveWebhook}
            />
          ) : (
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

                  <button
                    type="button"
                    data-testid="tasks-date-range-toggle"
                    aria-pressed={showDateRangeBar}
                    onClick={() => setIsDateFilterOpen((prev) => !prev)}
                    title={t.taskDateRangeFilterButton}
                    className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      hasDateRangeFilter || isDateFilterOpen
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    <span className="hidden sm:inline">{t.taskDateRangeFilterButton}</span>
                  </button>

                  <div className="relative inline-flex items-center">
                    <SlidersHorizontal
                      aria-hidden="true"
                      className="pointer-events-none absolute left-2.5 z-10 h-3.5 w-3.5 text-[var(--text-muted)]"
                    />
                    <SelectField
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label={t.sortCustom}
                      selectClassName="h-[30px] bg-[var(--surface)] pl-8 pr-8 font-medium hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                      <option value="manual">{t.sortCustom}</option>
                      <option value="priority">{t.sortPriority}</option>
                      <option value="dueDate">{t.sortDueDate}</option>
                      <option value="newest">{t.sortNewest}</option>
                    </SelectField>
                  </div>
                </div>
              </div>

              {/* Search / All-Tasks Date Range Filter Bar */}
              {showDateRangeBar && (
                <div
                  data-testid="tasks-date-range-bar"
                  className="animate-tab-enter flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                      <CalendarIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>{t.taskDateRangeFilterButton}</span>
                    </span>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <span>{t.trashDateFrom}</span>
                      <input
                        type="date"
                        data-testid="tasks-date-from"
                        value={searchDateFrom}
                        onChange={(e) => setSearchDateFrom(e.target.value)}
                        aria-label={t.trashDateFrom}
                        className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 font-mono-tabular text-[11px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <span>{t.trashDateTo}</span>
                      <input
                        type="date"
                        data-testid="tasks-date-to"
                        value={searchDateTo}
                        onChange={(e) => setSearchDateTo(e.target.value)}
                        aria-label={t.trashDateTo}
                        className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 font-mono-tabular text-[11px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasDateRangeFilter && (
                      <button
                        type="button"
                        data-testid="tasks-date-clear"
                        onClick={() => {
                          setSearchDateFrom('');
                          setSearchDateTo('');
                        }}
                        className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
                      >
                        {t.zoomResetButton}
                      </button>
                    )}
                    {!searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsDateFilterOpen(false);
                          setSearchDateFrom('');
                          setSearchDateTo('');
                        }}
                        aria-label={t.closeMenu}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

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

              {/* 1:1 Layout-Matched Loading Skeleton */}
              {isLoading ? (
                layoutMode === 'calendar' ? (
                  <div
                    aria-busy="true"
                    aria-label="Agendamea"
                    data-testid="calendar-loading-skeleton"
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                      <div className="h-4 w-32 rounded bg-[var(--surface-hover)] animate-pulse" />
                      <div className="flex items-center gap-1.5">
                        <div className="h-7 w-14 rounded-md bg-[var(--surface-subtle)] animate-pulse" />
                        <div className="h-7 w-7 rounded-md bg-[var(--surface-subtle)] animate-pulse" />
                        <div className="h-7 w-7 rounded-md bg-[var(--surface-subtle)] animate-pulse" />
                      </div>
                    </div>
                    <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-subtle)]/50">
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <div key={d} className="flex justify-center py-2">
                          <div className="h-3 w-7 rounded bg-[var(--surface-hover)] animate-pulse" />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 divide-x divide-y divide-[var(--border)]">
                      {Array.from({ length: 35 }).map((_, idx) => (
                        <div key={idx} className="min-h-[82px] p-1.5 space-y-1.5">
                          <div className="h-3.5 w-5 rounded bg-[var(--surface-subtle)] animate-pulse" />
                          {idx % 5 === 1 && (
                            <div className="h-4 w-full rounded bg-[var(--surface-hover)] animate-pulse" />
                          )}
                          {idx % 7 === 3 && (
                            <div className="h-4 w-4/5 rounded bg-[var(--surface-hover)] animate-pulse" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : layoutMode === 'kanban' ? (
                  <div
                    aria-busy="true"
                    aria-label="Agendamea"
                    className="grid grid-cols-1 md:grid-cols-3 gap-3"
                  >
                    {[0, 1, 2].map((col) => (
                      <div
                        key={col}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between px-1">
                          <div className="h-3.5 w-24 rounded bg-[var(--surface-hover)] animate-pulse" />
                          <div className="h-4 w-6 rounded bg-[var(--surface-hover)] animate-pulse" />
                        </div>
                        {[0, 1].map((card) => (
                          <div
                            key={card}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--surface-hover)] animate-pulse" />
                              <div className="flex-1 space-y-1.5">
                                <div className="h-3.5 w-3/4 rounded bg-[var(--surface-hover)] animate-pulse" />
                                <div className="h-3 w-1/2 rounded bg-[var(--surface-subtle)] animate-pulse" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : layoutMode === 'matrix' ? (
                  <div
                    aria-busy="true"
                    aria-label="Agendamea"
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    {[0, 1, 2, 3].map((q) => (
                      <div
                        key={q}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-2.5 min-h-[168px]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="h-3.5 w-36 rounded bg-[var(--surface-hover)] animate-pulse" />
                          <div className="h-4 w-6 rounded bg-[var(--surface-subtle)] animate-pulse" />
                        </div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3 space-y-1.5">
                          <div className="h-3.5 w-2/3 rounded bg-[var(--surface-hover)] animate-pulse" />
                          <div className="h-3 w-1/3 rounded bg-[var(--surface-subtle)] animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    aria-busy="true"
                    aria-label="Agendamea"
                    className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0"
                      >
                        <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-hover)] animate-pulse" />
                        <div className="flex-1 min-w-0 space-y-2 py-0.5">
                          <div
                            className={`h-[15px] rounded bg-[var(--surface-hover)] animate-pulse ${
                              i % 2 === 0 ? 'w-3/5' : 'w-2/5'
                            }`}
                          />
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-16 rounded bg-[var(--surface-subtle)] animate-pulse" />
                            <div className="h-3 w-20 rounded bg-[var(--surface-subtle)] animate-pulse" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <div className="h-7 w-7 rounded-md bg-[var(--surface-subtle)] animate-pulse" />
                          <div className="h-7 w-7 rounded-md bg-[var(--surface-subtle)] animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : layoutMode === 'calendar' ? (
                <div key="view-calendar" className="animate-tab-enter">
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
                    onTodoContextMenu={handleOpenTodoContextMenu}
                    onDayContextMenu={handleOpenDayContextMenu}
                  />
                </div>
              ) : layoutMode === 'kanban' ? (
                <div key="view-kanban" className="animate-tab-enter">
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
                    onTodoContextMenu={handleOpenTodoContextMenu}
                  />
                </div>
              ) : layoutMode === 'matrix' ? (
                <div key="view-matrix" className="animate-tab-enter">
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
                    onTodoContextMenu={handleOpenTodoContextMenu}
                  />
                </div>
              ) : visibleTodos.length === 0 ? (
                /* Clean Empty State */
                <div
                  key={`empty-${activeView.type}-${activeView.id}`}
                  className="animate-tab-enter flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center"
                >
                  <div
                    className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    <CheckCheck className="h-5 w-5" />
                  </div>
                  <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {searchQuery.trim() || tagFilter || hasDateRangeFilter
                      ? t.emptySearchTitle
                      : isCompletedView
                        ? t.emptyCompletedTitle
                        : t.emptyListTitle}
                  </h2>
                  <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
                    {searchQuery.trim() || tagFilter || hasDateRangeFilter
                      ? t.emptySearchDesc
                      : isCompletedView
                        ? t.emptyCompletedDesc
                        : t.emptyListDesc}
                  </p>
                  {searchQuery.trim() || tagFilter || hasDateRangeFilter ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchDateFrom('');
                        setSearchDateTo('');
                        setIsDateFilterOpen(false);
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
                      onContextMenu={handleOpenTodoContextMenu}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
          )}
        </div>

        {/* Right Detail Inspector Panel */}
        {!isSettingsOpen && selectedTodo && (
          <>
            <button
              type="button"
              aria-label={t.closeMenu}
              onClick={handleCloseDetail}
              className="animate-fade-in fixed inset-0 z-20 bg-black/35 lg:hidden"
            />
            <TodoDetailPanel
              todo={selectedTodo}
              categories={categories}
              todayStr={todayStr}
              onClose={handleCloseDetail}
              onUpdate={handleUpdateTodo}
              onToggleComplete={handleToggleTodoComplete}
              onDelete={handleDeleteTodo}
              onAddSubtask={handleAddSubtask}
              onToggleSubtask={handleToggleSubtask}
              onRenameSubtask={handleRenameSubtask}
              onDeleteSubtask={handleDeleteSubtask}
            />
          </>
        )}

        {todoContextMenu && (
          <ContextMenu
            testId="todo-context-menu"
            x={todoContextMenu.x}
            y={todoContextMenu.y}
            onClose={handleCloseTodoContextMenu}
            items={[
              {
                id: 'open-details',
                label: t.ctxOpenDetails,
                icon: <Eye className="h-3.5 w-3.5" />,
                onSelect: () => setSelectedTodoId(todoContextMenu.todo.id),
              },
              {
                id: 'toggle-complete',
                label: todoContextMenu.todo.completed ? t.markCompletedDone : t.markComplete,
                icon: <Check className="h-3.5 w-3.5" />,
                onSelect: () =>
                  handleToggleTodoComplete(
                    todoContextMenu.todo.id,
                    !todoContextMenu.todo.completed,
                  ),
              },
              {
                id: 'toggle-pin',
                label: todoContextMenu.todo.pinned ? t.unpinLabel : t.pinLabel,
                icon: <Pin className="h-3.5 w-3.5" />,
                onSelect: () =>
                  handleToggleTodoPin(todoContextMenu.todo.id, !todoContextMenu.todo.pinned),
              },
              {
                id: 'toggle-important',
                label: todoContextMenu.todo.important ? t.ctxRemoveImportant : t.ctxMarkImportant,
                icon: <Star className="h-3.5 w-3.5" />,
                onSelect: () =>
                  handleToggleTodoImportant(
                    todoContextMenu.todo.id,
                    !todoContextMenu.todo.important,
                  ),
              },
              { id: 'div-schedule', divider: true },
              {
                id: 'schedule-today',
                label: t.ctxSetToday,
                icon: <Sun className="h-3.5 w-3.5" />,
                onSelect: () =>
                  void handleUpdateTodo(todoContextMenu.todo.id, {
                    startDate: null,
                    dueDate: todayStr,
                  }),
              },
              {
                id: 'schedule-tomorrow',
                label: t.ctxSetTomorrow,
                icon: <CalendarIcon className="h-3.5 w-3.5" />,
                onSelect: () =>
                  void handleUpdateTodo(todoContextMenu.todo.id, {
                    startDate: null,
                    dueDate: addDaysToDateString(todayStr, 1),
                  }),
              },
              ...(todoContextMenu.todo.dueDate || todoContextMenu.todo.startDate
                ? [
                    {
                      id: 'schedule-clear',
                      label: t.ctxClearSchedule,
                      icon: <X className="h-3.5 w-3.5" />,
                      onSelect: () =>
                        void handleUpdateTodo(todoContextMenu.todo.id, {
                          startDate: null,
                          dueDate: null,
                          dueTime: null,
                        }),
                    },
                  ]
                : []),
              { id: 'div-actions', divider: true },
              {
                id: 'copy-title',
                label: t.ctxCopyTitle,
                icon: <Copy className="h-3.5 w-3.5" />,
                onSelect: () => {
                  void navigator.clipboard
                    ?.writeText?.(todoContextMenu.todo.title)
                    .then(() => showInfoToast(tRef.current.ctxCopiedToast, 'info'))
                    .catch(() => {});
                },
              },
              {
                id: 'delete-todo',
                label: t.deleteToTrashButton,
                icon: <Trash2 className="h-3.5 w-3.5" />,
                danger: true,
                onSelect: () => handleDeleteTodo(todoContextMenu.todo.id),
              },
            ]}
          />
        )}

        {dayContextMenu && (
          <ContextMenu
            testId="calendar-day-context-menu"
            x={dayContextMenu.x}
            y={dayContextMenu.y}
            onClose={handleCloseDayContextMenu}
            items={[
              {
                id: 'add-task-on-day',
                label: `${t.ctxAddTaskHere} (${dayContextMenu.dateStr})`,
                icon: <CalendarPlus className="h-3.5 w-3.5" />,
                onSelect: () => {
                  const categoryId = activeView.type === 'category' ? activeView.id : null;
                  void handleAddTodo({
                    title: t.addFirstTaskButton,
                    priority: 'normal',
                    startDate: null,
                    dueDate: dayContextMenu.dateStr,
                    dueTime: null,
                    categoryId,
                    important: false,
                  })
                    .then((created) => {
                      if (created) setSelectedTodoId(created.id);
                    })
                    .catch(() => {
                      // Error toast already handled inside handleAddTodo
                    });
                },
              },
            ]}
          />
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
            appIconId={appIconId}
            customIconColor={customIconColor}
            onChangeMode={handleModeChange}
            onChangeTheme={handleThemeChange}
            onChangeCustomThemeColor={handleCustomThemeColorChange}
            onChangeAppIcon={handleAppIconChange}
            onChangeCustomIconColor={handleCustomIconColorChange}
            onComplete={handleCompleteWelcome}
          />
        )}

        <OfflineIndicator />

        <div className="app-no-drag fixed top-2 end-2.5 z-[60]">
          <WindowControls onNotify={handleWindowNotify} />
        </div>
      </div>
    </I18nProvider>
  );
}
