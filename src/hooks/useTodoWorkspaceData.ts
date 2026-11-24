import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { UiDictionary } from '../i18n/translations';
import { preferencesStore } from '../store/preferencesStore';
import { shortcutStore } from '../store/shortcutStore';
import { updaterStore } from '../store/updaterStore';
import { webhookStore } from '../store/webhookStore';
import { workspaceUiStore } from '../store/workspaceUiStore';
import type {
  BootstrapPayload,
  Category,
  OneDriveStatus,
  Priority,
  Todo,
  TodoPatch,
} from '../types';
import { sortCategoriesWithPin } from '../utils/todoLogic';
import { useCategoryAndSubtaskActions } from './useCategoryAndSubtaskActions';

interface UseTodoWorkspaceDataOptions {
  tRef: RefObject<UiDictionary>;
  launchViewOverriddenRef?: RefObject<boolean>;
  formatUiError: (err: unknown, fallback?: string) => string;
  showInfoToast: (message: string, variant?: 'info' | 'error') => void;
  showUndoToast: (kind: 'todo' | 'category', id: string, message: string) => void;
  clearUndoToast: () => void;
  undoToast: { kind: 'todo' | 'category'; id: string } | null;
  hydrateNotificationSettings: (settings: BootstrapPayload['settings']) => void;
  clearPersistedSentReminders: () => void;
  dispatchCloudSyncNotification: (payload: {
    title: string;
    body?: string;
    variant?: 'info' | 'error';
  }) => void;
}

/**
 * Owns workspace todos, categories, trash, bootstrap loading, OneDrive recovery prompt,
 * and optimistic CRUD mutations with monotonic sequence barriers against stale responses.
 */
export function useTodoWorkspaceData({
  tRef,
  launchViewOverriddenRef,
  formatUiError,
  showInfoToast,
  showUndoToast,
  clearUndoToast,
  undoToast,
  hydrateNotificationSettings,
  clearPersistedSentReminders,
  dispatchCloudSyncNotification,
}: UseTodoWorkspaceDataOptions) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [trashedCategories, setTrashedCategories] = useState<Category[]>([]);
  const [trashedTodos, setTrashedTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [oneDrivePrompt, setOneDrivePrompt] = useState<OneDriveStatus | null>(null);
  const [isRestoringOneDrivePrompt, setIsRestoringOneDrivePrompt] = useState(false);

  const welcomeCheckedRef = useRef(false);
  const startupPrefsAppliedRef = useRef(false);
  const isMountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const mutationSeqCounterRef = useRef(0);
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const hydrateDomainStores = useCallback(
    (
      settings: BootstrapPayload['settings'],
      options?: { fallbackShortcuts?: boolean; syncElectron?: boolean },
    ) => {
      updaterStore.hydrateAutoUpdateCheck(
        settings.autoUpdateCheck === undefined ? true : Boolean(settings.autoUpdateCheck),
      );
      webhookStore.hydrate(settings);
      shortcutStore.hydrate(settings, {
        fallbackDefaults: options?.fallbackShortcuts,
        syncElectron: options?.syncElectron,
      });
      hydrateNotificationSettings(settings);
    },
    [hydrateNotificationSettings],
  );

  const loadData = useCallback(
    async (silent = false, fromExternalSse = false) => {
      const seq = ++loadSeqRef.current;
      if (!silent) {
        setIsLoading(true);
        setLoadError(null);
      }
      try {
        const data = await api.bootstrap();
        if (!isMountedRef.current || seq !== loadSeqRef.current) return;
        setCategories(sortCategoriesWithPin(data.categories));
        setTodos(data.todos);
        setTrashedCategories(data.trashedCategories);
        setTrashedTodos(data.trashedTodos);
        hydrateDomainStores(data.settings, { syncElectron: true });
        await preferencesStore.syncFromBootstrap(data.settings, { fromExternalSse });
        if (!startupPrefsAppliedRef.current) {
          startupPrefsAppliedRef.current = true;
          const startView = data.settings.defaultStartupView;
          const isLaunchViewOverridden = launchViewOverriddenRef
            ? launchViewOverriddenRef.current
            : false;
          if (
            !isLaunchViewOverridden &&
            (startView === 'today' || startView === 'important' || startView === 'all')
          ) {
            workspaceUiStore.setActiveView({ type: 'smart', id: startView });
          }
          const startLayout = data.settings.defaultLayoutMode;
          if (
            startLayout === 'list' ||
            startLayout === 'kanban' ||
            startLayout === 'calendar' ||
            startLayout === 'matrix'
          ) {
            workspaceUiStore.setLayoutMode(startLayout);
          }
        }
        if (!isMountedRef.current || seq !== loadSeqRef.current) return;
        setLoadError(null);

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
              workspaceUiStore.setIsWelcomeOpen(true);
            } else {
              try {
                localStorage.setItem('agendamea-onboarding-completed', 'true');
              } catch {
                // Ignore storage write errors
              }
              void api.updateSettings({ onboardingCompleted: true }).catch(() => {
                /* ignore */
              });
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
                if (!isMountedRef.current || seq !== loadSeqRef.current) return;
                if (
                  todosRef.current.length === 0 &&
                  st.hasRemoteBackup &&
                  ((st.remoteTodoCount ?? 0) > 0 || (st.remoteCategoryCount ?? 0) > 0)
                ) {
                  setOneDrivePrompt(st);
                }
              })
              .catch(() => {
                /* ignore */
              });
          }
        } else {
          setOneDrivePrompt(null);
        }
      } catch (err) {
        if (!isMountedRef.current || seq !== loadSeqRef.current) return;
        if (!silent) {
          setLoadError(formatUiError(err, tRef.current.loadFailedError));
        }
      } finally {
        if (isMountedRef.current && seq === loadSeqRef.current && !silent) {
          setIsLoading(false);
        }
      }
    },
    [formatUiError, hydrateDomainStores, launchViewOverriddenRef, tRef],
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const {
    handleCreateCategory,
    handleUpdateCategory,
    handleTogglePinCategory,
    handleDeleteCategory,
    handleRestoreCategory,
    handlePermanentDeleteCategory,
    handleReorderCategories,
    handleAddSubtask,
    handleToggleSubtask,
    handleRenameSubtask,
    handleDeleteSubtask,
  } = useCategoryAndSubtaskActions({
    tRef,
    formatUiError,
    showInfoToast,
    showUndoToast,
    loadData,
    setCategories,
    setTrashedCategories,
    setTodos,
    setTrashedTodos,
    categoryUpdateSeqRef,
    subtaskUpdateSeqRef,
    reorderCatSeqRef,
    pendingSubtaskDeletesRef,
    pendingTrashOpsRef,
  });

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
    async (id: string, patch: TodoPatch, options?: { keepalive?: boolean }): Promise<boolean> => {
      if (pendingDeletesRef.current.has(id) || !todosRef.current.some((tItem) => tItem.id === id)) {
        return false;
      }

      const seq = ++mutationSeqCounterRef.current;
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
      if (
        preferencesStore.getState().confirmBeforeDelete &&
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function'
      ) {
        const confirmed = window.confirm(`${tRef.current.deleteToTrashButton}: "${target.title}"?`);
        if (!confirmed) return;
      }

      todoUpdateSeqRef.current.set(id, ++mutationSeqCounterRef.current);
      const deletedAt = new Date().toISOString();
      setTodos((prev) => prev.filter((tItem) => tItem.id !== id));
      setTrashedTodos((prev) => [
        { ...target, deletedAt },
        ...prev.filter((tItem) => tItem.id !== id),
      ]);
      workspaceUiStore.setSelectedTodoId((prev) => (prev === id ? null : prev));

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
    [showUndoToast, clearUndoToast, showInfoToast, loadData, formatUiError, tRef],
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
        todoUpdateSeqRef.current.set(id, ++mutationSeqCounterRef.current);
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
      const currentView = workspaceUiStore.getState().activeView;
      const scopeCatId =
        scopeCategoryId !== undefined
          ? scopeCategoryId
          : currentView.type === 'category'
            ? currentView.id
            : null;

      try {
        const { trashedTodos: newlyTrashed } = await api.clearCompleted(scopeCatId);
        if (newlyTrashed.length === 0) return;

        const trashedIds = new Set(newlyTrashed.map((tItem) => tItem.id));
        for (const tid of trashedIds) {
          todoUpdateSeqRef.current.delete(tid);
        }
        setTodos((prev) => prev.filter((tItem) => !trashedIds.has(tItem.id)));
        setTrashedTodos((prev) => [
          ...newlyTrashed,
          ...prev.filter((tItem) => !trashedIds.has(tItem.id)),
        ]);
        workspaceUiStore.setSelectedTodoId((prev) => (prev && trashedIds.has(prev) ? null : prev));
      } catch (err) {
        showInfoToast(formatUiError(err), 'error');
        void loadData(true);
      }
    },
    [showInfoToast, loadData, formatUiError],
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
      clearPersistedSentReminders();
      todoUpdateSeqRef.current.clear();
      categoryUpdateSeqRef.current.clear();
      subtaskUpdateSeqRef.current.clear();
      setCategories(sortCategoriesWithPin(restored.categories));
      setTodos(restored.todos);
      setTrashedCategories(restored.trashedCategories);
      setTrashedTodos(restored.trashedTodos);
      preferencesStore.applyRestored(restored.settings);
      hydrateDomainStores(restored.settings, { fallbackShortcuts: true, syncElectron: true });
      workspaceUiStore.resetNavigationForRestore();
      setOneDrivePrompt(null);
      showInfoToast(tRef.current.backupRestoredToast);
    },
    [clearUndoToast, clearPersistedSentReminders, hydrateDomainStores, showInfoToast, tRef],
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
      workspaceUiStore.resetNavigationForRestore();
      setOneDrivePrompt(null);
      clearUndoToast();
      clearPersistedSentReminders();
      todoUpdateSeqRef.current.clear();
      categoryUpdateSeqRef.current.clear();
      subtaskUpdateSeqRef.current.clear();
      setCategories(fresh.categories);
      setTodos(fresh.todos);
      setTrashedCategories(fresh.trashedCategories);
      setTrashedTodos(fresh.trashedTodos);
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
        preferencesStore.applyRestored(fresh.settings);
        hydrateDomainStores(fresh.settings, { fallbackShortcuts: true, syncElectron: true });
      }
      showInfoToast(tRef.current.resetDataDoneToast, 'info');
    },
    [clearUndoToast, clearPersistedSentReminders, hydrateDomainStores, showInfoToast, tRef],
  );

  const handleRestoreOneDriveFromBanner = useCallback(async () => {
    if (isRestoringOneDrivePrompt) return;
    setIsRestoringOneDrivePrompt(true);
    try {
      const { bootstrap } = await api.syncOneDrivePull();
      setOneDrivePrompt(null);
      workspaceUiStore.setIsWelcomeOpen(false);
      try {
        localStorage.setItem('agendamea-onedrive-prompt-dismissed', 'true');
        localStorage.setItem('agendamea-onboarding-completed', 'true');
      } catch {
        // Ignore storage error
      }
      void api.updateSettings({ onboardingCompleted: true }).catch(() => {
        /* ignore */
      });
      handleApplyRestoredBootstrap(bootstrap);
      dispatchCloudSyncNotification({
        title: tRef.current.onedriveSyncedToast,
      });
    } catch (err) {
      showInfoToast(formatUiError(err), 'error');
    } finally {
      setIsRestoringOneDrivePrompt(false);
    }
  }, [
    dispatchCloudSyncNotification,
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

  const handleRestoreAllTrash = useCallback(async () => {
    try {
      const res = await api.restoreAllTrash();
      if (res.bootstrap) {
        setCategories(sortCategoriesWithPin(res.bootstrap.categories));
        setTodos(res.bootstrap.todos);
        setTrashedCategories(res.bootstrap.trashedCategories);
        setTrashedTodos(res.bootstrap.trashedTodos);
      }
      showInfoToast(tRef.current.trashRestoredAllToast, 'info');
    } catch (err) {
      showInfoToast(formatUiError(err), 'error');
      void loadData(true);
    }
  }, [formatUiError, loadData, showInfoToast, tRef]);

  const handleOpenOneDriveFolderFromBanner = useCallback(() => {
    void api.openOneDriveFolder(oneDrivePrompt?.folderPath).catch(() => {
      /* ignore */
    });
  }, [oneDrivePrompt]);

  return {
    categories,
    todos,
    setTodos,
    todosRef,
    trashedCategories,
    trashedTodos,
    isLoading,
    loadError,
    setLoadError,
    oneDrivePrompt,
    isRestoringOneDrivePrompt,
    loadData,
    handleCreateCategory,
    handleUpdateCategory,
    handleTogglePinCategory,
    handleDeleteCategory,
    handleRestoreCategory,
    handlePermanentDeleteCategory,
    handleReorderCategories,
    handleAddTodo,
    handleUpdateTodo,
    handleDeleteTodo,
    handleRestoreTodo,
    handlePermanentDeleteTodo,
    handleUndoSoftDelete,
    handleClearCompleted,
    handleEmptyTrash,
    handleRestoreAllTrash,
    handleApplyRestoredBootstrap,
    handleImportBackup,
    handleResetAllData,
    handleAddSubtask,
    handleToggleSubtask,
    handleRenameSubtask,
    handleDeleteSubtask,
    handleRestoreOneDriveFromBanner,
    handleDismissOneDriveBanner,
    handleOpenOneDriveFolderFromBanner,
  };
}
