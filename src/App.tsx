import type React from 'react';
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { api } from './api/client';
import { CloseActionModal } from './components/CloseActionModal';
import { ContextMenu } from './components/ContextMenu';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Sidebar } from './components/Sidebar';
import type { SettingsRuntimeActions } from './components/settings/SettingsTabOutlet';
import { ToastContainer } from './components/ToastContainer';
import { TodoDetailPanel } from './components/TodoDetailPanel';
import { WelcomeModal } from './components/WelcomeModal';
import { WindowControls } from './components/WindowControls';
import { WorkspaceMainContent } from './components/WorkspaceMainContent';
import { useAppUpdater } from './hooks/useAppUpdater';
import { useDelayedFocus } from './hooks/useDelayedFocus';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { useNotificationCenter } from './hooks/useNotificationCenter';
import { useServerSseSync } from './hooks/useServerSseSync';
import { useThemeAndPreferences } from './hooks/useThemeAndPreferences';
import { useToast } from './hooks/useToast';
import { useTodayDate } from './hooks/useTodayDate';
import { useTodoDragReorder } from './hooks/useTodoDragReorder';
import { useTodoWorkspaceData } from './hooks/useTodoWorkspaceData';
import { useWorkspaceContextMenus } from './hooks/useWorkspaceContextMenus';
import { I18nProvider } from './i18n/I18nContext';
import { localizeErrorMessage } from './i18n/translations';
import { preferencesStore, usePreferencesSelector } from './store/preferencesStore';
import { setStoreErrorReporter } from './store/storeErrorBus';
import { workspaceSnapshotStore } from './store/workspaceSnapshotStore';
import { useWorkspaceUiSelector, workspaceUiStore } from './store/workspaceUiStore';
import type { SettingsTabId, Todo } from './types';
import { playCompletionSound } from './utils/soundEffects';
import { computeViewCounts, filterAndSortTodos } from './utils/todoLogic';

const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);

export default function App() {
  const { language, sidebarCollapsed, dragLocked, langMeta, t, langRef, tRef } =
    useThemeAndPreferences();

  const ui = useWorkspaceUiSelector((s) => s);
  const deferredSearchQuery = useDeferredValue(ui.searchQuery);

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
  const keyboardReorderRef = useRef<((direction: 'up' | 'down') => void) | null>(null);
  const launchViewOverriddenRef = useRef(false);
  const scheduleFocus = useDelayedFocus();

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

  useEffect(() => {
    setStoreErrorReporter((err, fallback) => {
      showInfoToast(formatUiError(err, fallback), 'error');
    });
    return () => {
      setStoreErrorReporter(null);
    };
  }, [formatUiError, showInfoToast]);

  const focusTodoFromNotification = useCallback((todoId: string) => {
    if (typeof todoId === 'string' && todoId.trim()) {
      workspaceUiStore.dismissModals();
      workspaceUiStore.setActiveView({ type: 'smart', id: 'all' });
      workspaceUiStore.setSelectedTodoId(todoId);
    }
  }, []);

  const hydrateNotifRef = useRef<
    (settings: Parameters<typeof hydrateNotificationSettings>[0]) => void
  >(() => {
    /* noop */
  });
  const clearRemindersRef = useRef<() => void>(() => {
    /* noop */
  });
  const dispatchCloudSyncRef = useRef<
    (payload: { title: string; body?: string; variant?: 'info' | 'error' }) => void
  >(() => {
    /* noop */
  });

  const stableHydrateNotif = useCallback(
    (settings: Parameters<typeof hydrateNotificationSettings>[0]) => {
      hydrateNotifRef.current(settings);
    },
    [],
  );
  const stableClearReminders = useCallback(() => {
    clearRemindersRef.current();
  }, []);
  const stableDispatchCloudSync = useCallback(
    (payload: { title: string; body?: string; variant?: 'info' | 'error' }) => {
      dispatchCloudSyncRef.current(payload);
    },
    [],
  );

  const workspace = useTodoWorkspaceData({
    tRef,
    formatUiError,
    showInfoToast,
    showUndoToast,
    clearUndoToast,
    undoToast,
    launchViewOverriddenRef,
    hydrateNotificationSettings: stableHydrateNotif,
    clearPersistedSentReminders: stableClearReminders,
    dispatchCloudSyncNotification: stableDispatchCloudSync,
  });

  const {
    hydrateNotificationSettings,
    dispatchNotification,
    sendTestNotification,
    clearPersistedSentReminders,
  } = useNotificationCenter({
    todos: workspace.todos,
    tRef,
    showInfoToast,
    onFocusTodo: focusTodoFromNotification,
  });
  hydrateNotifRef.current = hydrateNotificationSettings;
  clearRemindersRef.current = clearPersistedSentReminders;

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
  dispatchCloudSyncRef.current = dispatchCloudSyncNotification;

  const {
    handleManualCheckForUpdates,
    handleDownloadAndInstallUpdate,
    handleCancelUpdateDownload,
    handleQuitAndInstallUpdate,
  } = useAppUpdater({ tRef, showInfoToast, formatUiError, dispatchUpdateNotification });

  useServerSseSync({
    tRef,
    quickAddRef,
    scheduleFocus,
    launchViewOverriddenRef,
    focusTodoFromNotification,
    dispatchVoiceNotification,
    loadData: workspace.loadData,
  });

  const focusSidebarSearch = useCallback(() => {
    if (window.innerWidth < 768) {
      workspaceUiStore.setIsMobileSidebarOpen(true);
      scheduleFocus(() => searchInputRef.current?.focus(), 80);
      return;
    }
    if (preferencesStore.expandSidebarIfCollapsed()) {
      scheduleFocus(() => searchInputRef.current?.focus(), 80);
      return;
    }
    searchInputRef.current?.focus();
  }, [scheduleFocus]);

  useGlobalHotkeys({ quickAddRef, focusSidebarSearch, keyboardReorderRef });

  const categoryMap = useMemo(
    () => new Map(workspace.categories.map((c) => [c.id, c])),
    [workspace.categories],
  );
  const counts = useMemo(
    () => computeViewCounts(workspace.todos, workspace.categories, todayStr),
    [workspace.todos, workspace.categories, todayStr],
  );
  const completedTaskBehavior = usePreferencesSelector((s) => s.completedTaskBehavior, Object.is);
  const visibleTodos = useMemo(
    () =>
      filterAndSortTodos({
        todos: workspace.todos,
        activeView: ui.activeView,
        statusFilter: ui.statusFilter,
        searchQuery: deferredSearchQuery,
        sortBy: ui.sortBy,
        todayStr,
        tagFilter: ui.tagFilter,
        dateFrom: ui.searchDateFrom,
        dateTo: ui.searchDateTo,
        completedBehavior: completedTaskBehavior,
      }),
    [
      workspace.todos,
      ui.activeView,
      ui.statusFilter,
      deferredSearchQuery,
      ui.sortBy,
      todayStr,
      ui.tagFilter,
      ui.searchDateFrom,
      ui.searchDateTo,
      completedTaskBehavior,
    ],
  );

  const hasDateRangeFilter = Boolean(ui.searchDateFrom || ui.searchDateTo);
  const showDateRangeBar =
    ui.searchQuery.trim().length > 0 || ui.isDateFilterOpen || hasDateRangeFilter;

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
    () => workspace.todos.find((tItem) => tItem.id === ui.selectedTodoId) ?? null,
    [workspace.todos, ui.selectedTodoId],
  );

  const isCompletedView = ui.activeView.type === 'smart' && ui.activeView.id === 'completed';
  const canDragTodos =
    !dragLocked &&
    !deferredSearchQuery.trim() &&
    !ui.tagFilter &&
    !hasDateRangeFilter &&
    visibleTodos.length > 1;

  const dragReorder = useTodoDragReorder({
    visibleTodos,
    todosRef: workspace.todosRef,
    setTodos: workspace.setTodos,
    dragLocked,
    canDragTodos,
    sortBy: ui.sortBy,
    setSortBy: workspaceUiStore.setSortBy,
    showInfoToast,
    formatUiError,
    loadData: workspace.loadData,
  });

  keyboardReorderRef.current = (direction: 'up' | 'down') => {
    if (!canDragTodos || !ui.selectedTodoId) return;
    const idx = visibleTodos.findIndex((tItem) => tItem.id === ui.selectedTodoId);
    if (idx === -1) return;
    const neighbor = visibleTodos[direction === 'up' ? idx - 1 : idx + 1];
    if (!neighbor) return;
    dragReorder.handleDropTodo(
      ui.selectedTodoId,
      neighbor.id,
      direction === 'up' ? 'before' : 'after',
    );
  };

  const {
    loadData: workspaceLoadData,
    todosRef: workspaceTodosRef,
    handleUpdateTodo: workspaceHandleUpdateTodo,
    handleClearCompleted: workspaceHandleClearCompleted,
    handleImportBackup: workspaceHandleImportBackup,
    handleApplyRestoredBootstrap: workspaceHandleApplyRestoredBootstrap,
    handleResetAllData: workspaceHandleResetAllData,
    handleRestoreTodo: workspaceHandleRestoreTodo,
    handlePermanentDeleteTodo: workspaceHandlePermanentDeleteTodo,
    handleRestoreCategory: workspaceHandleRestoreCategory,
    handlePermanentDeleteCategory: workspaceHandlePermanentDeleteCategory,
    handleEmptyTrash: workspaceHandleEmptyTrash,
    handleRestoreAllTrash: workspaceHandleRestoreAllTrash,
    handleUndoSoftDelete: workspaceHandleUndoSoftDelete,
    setLoadError: workspaceSetLoadError,
    handleRestoreOneDriveFromBanner: workspaceHandleRestoreOneDriveFromBanner,
  } = workspace;
  const { clearDragState } = dragReorder;

  const handleToggleDragLock = useCallback(
    (locked: boolean) => {
      if (locked) clearDragState();
      preferencesStore.setDragLocked(locked, () => {
        void workspaceLoadData(true);
      });
    },
    [clearDragState, workspaceLoadData],
  );

  const handleToggleTodoComplete = useCallback(
    (id: string, completed: boolean) => {
      const target = workspaceTodosRef.current.find((item) => item.id === id);
      if (completed) {
        playCompletionSound(preferencesStore.getState().completionSound);
      }
      void workspaceHandleUpdateTodo(id, { completed }).then((ok) => {
        if (ok && completed && target) {
          dispatchNotification('taskCompleted', {
            title: tRef.current.markCompletedDone,
            body: target.title,
            todoId: target.id,
          });
        }
      });
    },
    [dispatchNotification, workspaceTodosRef, workspaceHandleUpdateTodo, tRef],
  );

  const handleSelectTodo = useCallback((id: string) => {
    workspaceUiStore.setSelectedTodoId((prev) => (prev === id ? null : id));
  }, []);
  const handleToggleTodoImportant = useCallback(
    (id: string, important: boolean) => {
      void workspaceHandleUpdateTodo(id, { important });
    },
    [workspaceHandleUpdateTodo],
  );
  const handleToggleTodoPin = useCallback(
    (id: string, pinned: boolean) => {
      void workspaceHandleUpdateTodo(id, { pinned });
    },
    [workspaceHandleUpdateTodo],
  );
  const handleOpenTodoContextMenu = useCallback((e: React.MouseEvent, todo: Todo) => {
    workspaceUiStore.setDayContextMenu(null);
    workspaceUiStore.setTodoContextMenu({ x: e.clientX, y: e.clientY, todo });
  }, []);
  const handleOpenDayContextMenu = useCallback((e: React.MouseEvent, dateStr: string) => {
    workspaceUiStore.setTodoContextMenu(null);
    workspaceUiStore.setDayContextMenu({ x: e.clientX, y: e.clientY, dateStr });
  }, []);
  const handleSearchChange = useCallback((value: string) => {
    workspaceUiStore.setSearchQuery(value);
    if (value.trim().length > 0) workspaceUiStore.setIsSettingsOpen(false);
  }, []);
  const handleTagClick = useCallback((tag: string) => {
    workspaceUiStore.setTagFilter((prev) =>
      prev && prev.toLowerCase() === tag.toLowerCase() ? null : tag,
    );
  }, []);
  const handleCloseModalSelectAction = useCallback(
    async (action: 'tray' | 'quit', rememberChoice: boolean) => {
      workspaceUiStore.setIsCloseModalOpen(false);
      if (rememberChoice) await preferencesStore.setCloseBehavior(action);
      await window.agendameaWindow?.performCloseAction?.(action);
    },
    [],
  );
  const handleCompleteWelcome = useCallback(
    (openSettingsTarget?: boolean | SettingsTabId) => {
      workspaceUiStore.setIsWelcomeOpen(false);
      try {
        localStorage.setItem('agendamea-onboarding-completed', 'true');
      } catch {
        // Ignore storage errors
      }
      void api.updateSettings({ onboardingCompleted: true }).catch(() => {
        /* ignore */
      });
      if (openSettingsTarget) {
        workspaceUiStore.openSettings(
          typeof openSettingsTarget === 'string' ? openSettingsTarget : 'data',
        );
      } else {
        scheduleFocus(() => quickAddRef.current?.focus(), 60);
      }
    },
    [scheduleFocus],
  );

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
    ui.activeView.type === 'category' ? categoryMap.get(ui.activeView.id) : undefined;
  const viewTitle =
    ui.activeView.type === 'smart'
      ? smartViewTitles[ui.activeView.id]
      : (activeCategory?.name ?? t.categories);

  const { todoContextMenuItems, dayContextMenuItems } = useWorkspaceContextMenus({
    todoContextMenu: ui.todoContextMenu,
    dayContextMenu: ui.dayContextMenu,
    activeView: ui.activeView,
    todayStr,
    intlLocale: langMeta.intlLocale,
    t,
    tRef,
    onSelectTodoId: workspaceUiStore.setSelectedTodoId,
    onToggleTodoComplete: handleToggleTodoComplete,
    onToggleTodoPin: handleToggleTodoPin,
    onToggleTodoImportant: handleToggleTodoImportant,
    onUpdateTodo: workspaceHandleUpdateTodo,
    onDeleteTodo: workspace.handleDeleteTodo,
    onAddTodo: workspace.handleAddTodo,
    onShowInfoToast: showInfoToast,
  });

  useEffect(() => {
    workspaceSnapshotStore.syncCounts(workspace.todos.length, counts.smart.completed);
  }, [workspace.todos.length, counts.smart.completed]);

  useEffect(() => {
    workspaceSnapshotStore.syncTrash(workspace.trashedCategories, workspace.trashedTodos);
  }, [workspace.trashedCategories, workspace.trashedTodos]);

  const settingsRuntimeActions = useMemo<SettingsRuntimeActions>(
    () => ({
      onToggleDragLock: handleToggleDragLock,
      onSendTestNotification: sendTestNotification,
      onNotifyVoice: dispatchVoiceNotification,
      onNotifyCloudSync: dispatchCloudSyncNotification,
      onCheckForUpdates: handleManualCheckForUpdates,
      onDownloadAndInstall: handleDownloadAndInstallUpdate,
      onCancelUpdateDownload: handleCancelUpdateDownload,
      onQuitAndInstallUpdate: handleQuitAndInstallUpdate,
      onClearAllCompleted: () => workspaceHandleClearCompleted(null),
      onImportBackup: workspaceHandleImportBackup,
      onApplyRestoredBootstrap: workspaceHandleApplyRestoredBootstrap,
      onResetAllData: workspaceHandleResetAllData,
      onRestoreTodo: workspaceHandleRestoreTodo,
      onPermanentDeleteTodo: workspaceHandlePermanentDeleteTodo,
      onRestoreCategory: workspaceHandleRestoreCategory,
      onPermanentDeleteCategory: workspaceHandlePermanentDeleteCategory,
      onEmptyTrash: workspaceHandleEmptyTrash,
      onRestoreAllTrash: workspaceHandleRestoreAllTrash,
    }),
    [
      handleToggleDragLock,
      sendTestNotification,
      dispatchVoiceNotification,
      dispatchCloudSyncNotification,
      handleManualCheckForUpdates,
      handleDownloadAndInstallUpdate,
      handleCancelUpdateDownload,
      handleQuitAndInstallUpdate,
      workspaceHandleClearCompleted,
      workspaceHandleImportBackup,
      workspaceHandleApplyRestoredBootstrap,
      workspaceHandleResetAllData,
      workspaceHandleRestoreTodo,
      workspaceHandlePermanentDeleteTodo,
      workspaceHandleRestoreCategory,
      workspaceHandlePermanentDeleteCategory,
      workspaceHandleEmptyTrash,
      workspaceHandleRestoreAllTrash,
    ],
  );

  const handleWindowNotify = useCallback(
    (msg: string) => showInfoToast(msg, 'info'),
    [showInfoToast],
  );
  const handleOpenSettings = useCallback(() => {
    workspaceUiStore.openSettings('appearance');
  }, []);
  const handleCloseMobileSidebar = useCallback(() => {
    workspaceUiStore.setIsMobileSidebarOpen(false);
  }, []);
  const handleOpenMobileSidebar = useCallback(() => {
    workspaceUiStore.setIsMobileSidebarOpen(true);
  }, []);
  const handleOpenWelcomeGuide = useCallback(() => {
    workspaceUiStore.setIsSettingsOpen(false);
    workspaceUiStore.setIsWelcomeOpen(true);
  }, []);
  const handleRetryLoad = useCallback(() => {
    void workspaceLoadData();
  }, [workspaceLoadData]);
  const handleDismissLoadError = useCallback(() => {
    workspaceSetLoadError(null);
  }, [workspaceSetLoadError]);
  const handleClearCompletedView = useCallback(() => {
    void workspaceHandleClearCompleted();
  }, [workspaceHandleClearCompleted]);
  const handleRestoreOneDriveBanner = useCallback(() => {
    void workspaceHandleRestoreOneDriveFromBanner();
  }, [workspaceHandleRestoreOneDriveFromBanner]);
  const handleCloseDetailPanel = useCallback(() => {
    workspaceUiStore.setSelectedTodoId(null);
  }, []);
  const handleCloseTodoContextMenu = useCallback(() => {
    workspaceUiStore.setTodoContextMenu(null);
  }, []);
  const handleCloseDayContextMenu = useCallback(() => {
    workspaceUiStore.setDayContextMenu(null);
  }, []);
  const handleUndoToastAction = useCallback(() => {
    void workspaceHandleUndoSoftDelete();
  }, [workspaceHandleUndoSoftDelete]);
  const handleCloseModalCancel = useCallback(() => {
    workspaceUiStore.setIsCloseModalOpen(false);
  }, []);
  const handleCloseModalSelectActionSync = useCallback(
    (action: 'tray' | 'quit', remember: boolean) => {
      void handleCloseModalSelectAction(action, remember);
    },
    [handleCloseModalSelectAction],
  );

  return (
    <I18nProvider lang={language} onChangeLanguage={preferencesStore.setLanguage}>
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
        <OfflineIndicator />
        <div className="relative flex min-h-0 flex-1 w-full overflow-hidden">
          <Sidebar
            activeView={ui.activeView}
            onSelectView={workspaceUiStore.selectView}
            categories={workspace.categories}
            counts={counts}
            dragLocked={dragLocked}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={preferencesStore.toggleSidebarCollapsed}
            searchQuery={ui.searchQuery}
            onSearchChange={handleSearchChange}
            searchInputRef={searchInputRef}
            isSettingsOpen={ui.isSettingsOpen}
            onOpenSettings={handleOpenSettings}
            onCreateCategory={workspace.handleCreateCategory}
            onUpdateCategory={workspace.handleUpdateCategory}
            onTogglePinCategory={workspace.handleTogglePinCategory}
            onDeleteCategory={workspace.handleDeleteCategory}
            onReorderCategories={workspace.handleReorderCategories}
            isOpenMobile={ui.isMobileSidebarOpen}
            onCloseMobile={handleCloseMobileSidebar}
          />

          <div className="relative flex flex-1 min-w-0 flex-col h-full overflow-hidden">
            {!ui.isSettingsOpen && (
              <div
                aria-hidden="true"
                className="app-drag-region absolute start-0 end-36 top-0 z-10 h-9 select-none"
              />
            )}

            {ui.isSettingsOpen ? (
              <Suspense fallback={null}>
                <SettingsModal
                  onClose={workspaceUiStore.closeSettings}
                  initialTab={ui.settingsInitialTab}
                  onOpenMobileSidebar={handleOpenMobileSidebar}
                  onOpenWelcomeGuide={handleOpenWelcomeGuide}
                  actions={settingsRuntimeActions}
                />
              </Suspense>
            ) : (
              <WorkspaceMainContent
                ui={ui}
                activeCategory={activeCategory}
                categories={workspace.categories}
                categoryMap={categoryMap}
                visibleTodos={visibleTodos}
                viewTitle={viewTitle}
                todayStr={todayStr}
                todayFormatted={todayFormatted}
                activeCountInView={activeCountInView}
                completedCountInView={completedCountInView}
                isCompletedView={isCompletedView}
                hasDateRangeFilter={hasDateRangeFilter}
                showDateRangeBar={showDateRangeBar}
                dragLocked={dragLocked}
                canDragTodos={canDragTodos}
                isLoading={workspace.isLoading}
                loadError={workspace.loadError}
                oneDrivePrompt={workspace.oneDrivePrompt}
                isRestoringOneDrivePrompt={workspace.isRestoringOneDrivePrompt}
                quickAddRef={quickAddRef}
                draggedTodoId={dragReorder.draggedTodoId}
                todoDropTarget={dragReorder.todoDropTarget}
                onRetryLoad={handleRetryLoad}
                onDismissLoadError={handleDismissLoadError}
                onAddTodo={workspace.handleAddTodo}
                onClearCompleted={handleClearCompletedView}
                onRestoreOneDrive={handleRestoreOneDriveBanner}
                onDismissOneDrive={workspace.handleDismissOneDriveBanner}
                onOpenOneDriveFolder={workspace.handleOpenOneDriveFolderFromBanner}
                onSelectTodo={handleSelectTodo}
                onToggleComplete={handleToggleTodoComplete}
                onToggleImportant={handleToggleTodoImportant}
                onTogglePin={handleToggleTodoPin}
                onUpdateTodo={workspaceHandleUpdateTodo}
                onDeleteTodo={workspace.handleDeleteTodo}
                onTagClick={handleTagClick}
                onTodoContextMenu={handleOpenTodoContextMenu}
                onDayContextMenu={handleOpenDayContextMenu}
                onTodoDragStart={dragReorder.handleTodoDragStart}
                onTodoDragOver={dragReorder.handleTodoDragOver}
                onTodoDragLeave={dragReorder.handleTodoDragLeave}
                onTodoDrop={dragReorder.handleTodoDrop}
                onTodoDragEnd={dragReorder.handleTodoDragEnd}
              />
            )}
          </div>

          {!ui.isSettingsOpen && selectedTodo && (
            <>
              <button
                type="button"
                aria-label={t.closeMenu}
                onClick={handleCloseDetailPanel}
                className="animate-fade-in fixed inset-0 z-20 bg-black/35 lg:hidden"
              />
              <TodoDetailPanel
                todo={selectedTodo}
                categories={workspace.categories}
                todayStr={todayStr}
                onClose={handleCloseDetailPanel}
                onUpdate={workspaceHandleUpdateTodo}
                onToggleComplete={handleToggleTodoComplete}
                onDelete={workspace.handleDeleteTodo}
                onAddSubtask={workspace.handleAddSubtask}
                onToggleSubtask={workspace.handleToggleSubtask}
                onRenameSubtask={workspace.handleRenameSubtask}
                onDeleteSubtask={workspace.handleDeleteSubtask}
              />
            </>
          )}

          {ui.todoContextMenu && (
            <ContextMenu
              testId="todo-context-menu"
              x={ui.todoContextMenu.x}
              y={ui.todoContextMenu.y}
              onClose={handleCloseTodoContextMenu}
              items={todoContextMenuItems}
            />
          )}

          {ui.dayContextMenu && (
            <ContextMenu
              testId="calendar-day-context-menu"
              x={ui.dayContextMenu.x}
              y={ui.dayContextMenu.y}
              onClose={handleCloseDayContextMenu}
              items={dayContextMenuItems}
            />
          )}

          <ToastContainer
            undoToast={undoToast}
            infoToast={infoToast}
            onUndo={handleUndoToastAction}
            onClearUndo={clearUndoToast}
            onPauseUndo={pauseUndoToast}
            onResumeUndo={resumeUndoToast}
            onClearInfo={clearInfoToast}
          />

          {ui.isCloseModalOpen && (
            <CloseActionModal
              onSelectAction={handleCloseModalSelectActionSync}
              onCancel={handleCloseModalCancel}
            />
          )}

          {ui.isWelcomeOpen && !workspace.oneDrivePrompt && !ui.isSettingsOpen && (
            <WelcomeModal onComplete={handleCompleteWelcome} />
          )}
        </div>

        <div className="app-no-drag fixed top-2 end-2.5 z-[50]">
          <WindowControls onNotify={handleWindowNotify} />
        </div>
      </div>
    </I18nProvider>
  );
}
