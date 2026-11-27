import {
  Calendar,
  Columns3,
  LayoutGrid,
  List,
  Menu,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import React, { lazy, Suspense, useCallback, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { type WorkspaceUiState, workspaceUiStore } from '../store/workspaceUiStore';
import type { Category, OneDriveStatus, Priority, Todo, TodoPatch } from '../types';
import { ColorDot } from './ColorDot';
import { ContextMenu } from './ContextMenu';
import { OneDriveRecoveryBanner } from './OneDriveRecoveryBanner';
import { QuickAddBar } from './QuickAddBar';
import { VirtualizedTodoList } from './VirtualizedTodoList';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { WorkspaceSkeletons } from './WorkspaceSkeletons';
import { WorkspaceToolbar } from './WorkspaceToolbar';

const CalendarPlannerView = lazy(() =>
  import('./boards/CalendarPlannerView').then((m) => ({ default: m.CalendarPlannerView })),
);
const KanbanBoardView = lazy(() =>
  import('./boards/KanbanBoardView').then((m) => ({ default: m.KanbanBoardView })),
);
const EisenhowerMatrixView = lazy(() =>
  import('./boards/EisenhowerMatrixView').then((m) => ({ default: m.EisenhowerMatrixView })),
);

interface WorkspaceMainContentProps {
  ui: WorkspaceUiState;
  activeCategory: Category | null | undefined;
  categories: Category[];
  categoryMap: Map<string, Category>;
  visibleTodos: Todo[];
  viewTitle: string | undefined;
  todayStr: string;
  todayFormatted: string;
  activeCountInView: number;
  completedCountInView: number;
  isCompletedView: boolean;
  hasDateRangeFilter: boolean;
  showDateRangeBar: boolean;
  dragLocked: boolean;
  canDragTodos: boolean;
  isLoading: boolean;
  loadError: string | null;
  oneDrivePrompt: OneDriveStatus | null;
  isRestoringOneDrivePrompt: boolean;
  quickAddRef: React.RefObject<HTMLInputElement | null>;
  draggedTodoId: string | null;
  todoDropTarget: { id: string; position: 'before' | 'after' } | null;
  onRetryLoad: () => void;
  onDismissLoadError: () => void;
  onOpenAiSetup?: () => void;
  onNotifyInfo?: (message: string, variant?: 'info' | 'error') => void;
  onAddTodo: (payload: {
    id?: string;
    title: string;
    priority: Priority;
    startDate?: string | null;
    dueDate: string | null;
    dueTime?: string | null;
    categoryId: string | null;
    important: boolean;
  }) => Promise<unknown>;
  onClearCompleted: () => void;
  onRestoreOneDrive: () => void;
  onDismissOneDrive: () => void;
  onOpenOneDriveFolder: () => void;
  onSelectTodo: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onToggleImportant: (id: string, important: boolean) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onUpdateTodo: (id: string, patch: TodoPatch, opts?: { keepalive?: boolean }) => Promise<boolean>;
  onDeleteTodo: (id: string) => void;
  onTagClick: (tag: string) => void;
  onTodoContextMenu: (e: React.MouseEvent, todo: Todo) => void;
  onDayContextMenu: (e: React.MouseEvent, dateStr: string) => void;
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
  onTodoDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onTodoDragOver: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onTodoDragLeave: (id: string) => void;
  onTodoDrop: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onTodoDragEnd: () => void;
}

export const WorkspaceMainContent = React.memo(function WorkspaceMainContent({
  ui,
  activeCategory,
  categories,
  categoryMap,
  visibleTodos,
  viewTitle,
  todayStr,
  todayFormatted,
  activeCountInView,
  completedCountInView,
  isCompletedView,
  hasDateRangeFilter,
  showDateRangeBar,
  dragLocked,
  canDragTodos,
  isLoading,
  loadError,
  oneDrivePrompt,
  isRestoringOneDrivePrompt,
  quickAddRef,
  draggedTodoId,
  todoDropTarget,
  onRetryLoad,
  onDismissLoadError,
  onOpenAiSetup,
  onNotifyInfo,
  onAddTodo,
  onClearCompleted,
  onRestoreOneDrive,
  onDismissOneDrive,
  onOpenOneDriveFolder,
  onSelectTodo,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onUpdateTodo,
  onDeleteTodo,
  onTagClick,
  onTodoContextMenu,
  onDayContextMenu,
  onOpenCommandPalette,
  onOpenSettings,
  onTodoDragStart,
  onTodoDragOver,
  onTodoDragLeave,
  onTodoDrop,
  onTodoDragEnd,
}: WorkspaceMainContentProps) {
  const { t } = useI18n();
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleQuickCreateInBoard = useCallback(
    (preset: { priority?: Priority; dueDate?: string | null; important?: boolean }) => {
      const categoryId = ui.activeView.type === 'category' ? ui.activeView.id : null;
      void onAddTodo({
        title: t.addFirstTaskButton,
        priority: preset.priority ?? 'normal',
        startDate: null,
        dueDate: preset.dueDate ?? null,
        dueTime: null,
        categoryId,
        important: Boolean(preset.important),
      })
        .then((created) => {
          if (
            created &&
            typeof created === 'object' &&
            'id' in created &&
            typeof created.id === 'string'
          ) {
            onSelectTodo(created.id);
          }
        })
        .catch(() => {
          // Error toast already handled by onAddTodo
        });
    },
    [onAddTodo, onSelectTodo, t.addFirstTaskButton, ui.activeView],
  );

  return (
    <main
      onContextMenu={(e) => {
        if (e.defaultPrevented) return;
        const targetEl = e.target as HTMLElement | null;
        if (
          targetEl?.closest(
            'input, textarea, select, button, a, [data-todo-id], [data-testid="board-todo-card"]',
          )
        ) {
          return;
        }
        e.preventDefault();
        setCanvasCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      className="flex-1 overflow-y-auto px-4 pt-11 pb-8 sm:px-8 sm:pt-10"
    >
      <div className="mx-auto w-full max-w-[820px] space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-3 pe-28 md:pe-0">
            <button
              type="button"
              onClick={() => workspaceUiStore.setIsMobileSidebarOpen(true)}
              aria-label={t.openMenu}
              className="app-no-drag flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)] md:hidden shrink-0"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {activeCategory && <ColorDot color={activeCategory.color} size="md" />}
              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">
                {viewTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-[var(--text-muted)] capitalize">{todayFormatted}</p>
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

        {loadError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 animate-fade-in"
          >
            <span className="min-w-0 flex-1 break-words leading-snug">{loadError}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onRetryLoad}
                className="rounded-md border border-current px-3 py-1 text-xs font-medium whitespace-nowrap ag-hover-danger-glow transition-colors"
              >
                {t.retry}
              </button>
              <button
                type="button"
                onClick={onDismissLoadError}
                aria-label={t.closeMenu}
                className="rounded-md p-1 opacity-75 hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {!isCompletedView && (
          <QuickAddBar
            inputRef={quickAddRef}
            categories={categories}
            todayStr={todayStr}
            defaultCategoryId={ui.activeView.type === 'category' ? ui.activeView.id : null}
            defaultImportant={ui.activeView.type === 'smart' && ui.activeView.id === 'important'}
            defaultDueDate={
              ui.activeView.type === 'smart' && ui.activeView.id === 'today' ? todayStr : null
            }
            onAdd={onAddTodo}
            onOpenAiSetup={onOpenAiSetup}
            onNotifyInfo={onNotifyInfo}
          />
        )}

        <WorkspaceToolbar
          isCompletedView={isCompletedView}
          statusFilter={ui.statusFilter}
          layoutMode={ui.layoutMode}
          tagFilter={ui.tagFilter}
          completedCountInView={completedCountInView}
          searchQuery={ui.searchQuery}
          searchDateFrom={ui.searchDateFrom}
          searchDateTo={ui.searchDateTo}
          isDateFilterOpen={ui.isDateFilterOpen}
          hasDateRangeFilter={hasDateRangeFilter}
          showDateRangeBar={showDateRangeBar}
          sortBy={ui.sortBy}
          onChangeStatusFilter={workspaceUiStore.setStatusFilter}
          onChangeLayoutMode={workspaceUiStore.setLayoutMode}
          onClearTagFilter={() => workspaceUiStore.setTagFilter(null)}
          onClearCompleted={onClearCompleted}
          onToggleDateFilter={() => workspaceUiStore.setIsDateFilterOpen((prev) => !prev)}
          onChangeDateFrom={workspaceUiStore.setSearchDateFrom}
          onChangeDateTo={workspaceUiStore.setSearchDateTo}
          onClearDateRange={() =>
            workspaceUiStore.patchState({ searchDateFrom: '', searchDateTo: '' })
          }
          onCloseDateRangeBar={() =>
            workspaceUiStore.patchState({
              isDateFilterOpen: false,
              searchDateFrom: '',
              searchDateTo: '',
            })
          }
          onChangeSortBy={workspaceUiStore.setSortBy}
        />

        {oneDrivePrompt && (
          <OneDriveRecoveryBanner
            prompt={oneDrivePrompt}
            isRestoring={isRestoringOneDrivePrompt}
            onRestore={onRestoreOneDrive}
            onDismiss={onDismissOneDrive}
            onOpenFolder={onOpenOneDriveFolder}
          />
        )}

        {isLoading ? (
          <WorkspaceSkeletons layoutMode={ui.layoutMode} />
        ) : ui.layoutMode === 'calendar' ? (
          <div key="view-calendar" className="animate-tab-enter">
            <Suspense fallback={<WorkspaceSkeletons layoutMode="calendar" />}>
              <CalendarPlannerView
                todos={visibleTodos}
                categoryMap={categoryMap}
                todayStr={todayStr}
                selectedTodoId={ui.selectedTodoId}
                dragLocked={dragLocked}
                onSelectTodo={onSelectTodo}
                onToggleComplete={onToggleComplete}
                onToggleImportant={onToggleImportant}
                onTogglePin={onTogglePin}
                onUpdateTodo={onUpdateTodo}
                onTagClick={onTagClick}
                onTodoContextMenu={onTodoContextMenu}
                onDayContextMenu={onDayContextMenu}
              />
            </Suspense>
          </div>
        ) : ui.layoutMode === 'kanban' ? (
          <div key="view-kanban" className="animate-tab-enter">
            <Suspense fallback={<WorkspaceSkeletons layoutMode="kanban" />}>
              <KanbanBoardView
                todos={visibleTodos}
                categoryMap={categoryMap}
                todayStr={todayStr}
                selectedTodoId={ui.selectedTodoId}
                dragLocked={dragLocked}
                onSelectTodo={onSelectTodo}
                onToggleComplete={onToggleComplete}
                onToggleImportant={onToggleImportant}
                onTogglePin={onTogglePin}
                onUpdateTodo={onUpdateTodo}
                onTagClick={onTagClick}
                onTodoContextMenu={onTodoContextMenu}
                onQuickCreateInBoard={handleQuickCreateInBoard}
              />
            </Suspense>
          </div>
        ) : ui.layoutMode === 'matrix' ? (
          <div key="view-matrix" className="animate-tab-enter">
            <Suspense fallback={<WorkspaceSkeletons layoutMode="matrix" />}>
              <EisenhowerMatrixView
                todos={visibleTodos}
                categoryMap={categoryMap}
                todayStr={todayStr}
                selectedTodoId={ui.selectedTodoId}
                dragLocked={dragLocked}
                onSelectTodo={onSelectTodo}
                onToggleComplete={onToggleComplete}
                onToggleImportant={onToggleImportant}
                onTogglePin={onTogglePin}
                onUpdateTodo={onUpdateTodo}
                onTagClick={onTagClick}
                onTodoContextMenu={onTodoContextMenu}
                onQuickCreateInBoard={handleQuickCreateInBoard}
              />
            </Suspense>
          </div>
        ) : visibleTodos.length === 0 ? (
          <WorkspaceEmptyState
            activeView={ui.activeView}
            hasActiveSearchOrFilter={Boolean(
              ui.searchQuery.trim() || ui.tagFilter || hasDateRangeFilter,
            )}
            isCompletedView={isCompletedView}
            onClearSearchAndFilters={workspaceUiStore.clearSearchAndFilters}
            onFocusQuickAdd={() => quickAddRef.current?.focus()}
          />
        ) : (
          <VirtualizedTodoList
            todos={visibleTodos}
            categoryMap={categoryMap}
            todayStr={todayStr}
            selectedTodoId={ui.selectedTodoId}
            canDrag={canDragTodos}
            draggedTodoId={draggedTodoId}
            todoDropTarget={todoDropTarget}
            onSelect={onSelectTodo}
            onToggleComplete={onToggleComplete}
            onToggleImportant={onToggleImportant}
            onTogglePin={onTogglePin}
            onDelete={onDeleteTodo}
            onDragStart={onTodoDragStart}
            onDragOver={onTodoDragOver}
            onDragLeave={onTodoDragLeave}
            onDrop={onTodoDrop}
            onDragEnd={onTodoDragEnd}
            onTagClick={onTagClick}
            onContextMenu={onTodoContextMenu}
          />
        )}
      </div>

      {canvasCtxMenu && (
        <ContextMenu
          testId="workspace-canvas-context-menu"
          x={canvasCtxMenu.x}
          y={canvasCtxMenu.y}
          onClose={() => setCanvasCtxMenu(null)}
          items={[
            ...(!isCompletedView
              ? [
                  {
                    id: 'canvas-new-task',
                    label: t.shortcutNewTask,
                    icon: <Plus className="h-3.5 w-3.5" />,
                    onSelect: () => quickAddRef.current?.focus(),
                  },
                ]
              : []),
            ...(onOpenCommandPalette
              ? [
                  {
                    id: 'canvas-cmdk',
                    label: `${t.cmdPaletteTriggerLabel} (Ctrl+K)`,
                    icon: <Search className="h-3.5 w-3.5" />,
                    onSelect: () => onOpenCommandPalette(),
                  },
                ]
              : []),
            { id: 'div-layouts', divider: true },
            {
              id: 'layout-list',
              label: t.viewList,
              icon: <List className="h-3.5 w-3.5" />,
              disabled: ui.layoutMode === 'list',
              onSelect: () => workspaceUiStore.setLayoutMode('list'),
            },
            {
              id: 'layout-kanban',
              label: t.viewKanban,
              icon: <Columns3 className="h-3.5 w-3.5" />,
              disabled: ui.layoutMode === 'kanban',
              onSelect: () => workspaceUiStore.setLayoutMode('kanban'),
            },
            {
              id: 'layout-calendar',
              label: t.viewCalendar,
              icon: <Calendar className="h-3.5 w-3.5" />,
              disabled: ui.layoutMode === 'calendar',
              onSelect: () => workspaceUiStore.setLayoutMode('calendar'),
            },
            {
              id: 'layout-matrix',
              label: t.viewMatrix,
              icon: <LayoutGrid className="h-3.5 w-3.5" />,
              disabled: ui.layoutMode === 'matrix',
              onSelect: () => workspaceUiStore.setLayoutMode('matrix'),
            },
            ...(onOpenSettings
              ? [
                  { id: 'div-settings', divider: true as const },
                  {
                    id: 'canvas-settings',
                    label: t.settings,
                    icon: <Settings className="h-3.5 w-3.5" />,
                    onSelect: () => onOpenSettings(),
                  },
                ]
              : []),
          ]}
        />
      )}
    </main>
  );
});
