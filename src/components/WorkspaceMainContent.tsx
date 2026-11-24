import { Menu, X } from 'lucide-react';
import React from 'react';
import { useI18n } from '../i18n/I18nContext';
import { type WorkspaceUiState, workspaceUiStore } from '../store/workspaceUiStore';
import type { Category, OneDriveStatus, Priority, Todo, TodoPatch } from '../types';
import { ColorDot } from './ColorDot';
import { OneDriveRecoveryBanner } from './OneDriveRecoveryBanner';
import { QuickAddBar } from './QuickAddBar';
import { CalendarPlannerView, EisenhowerMatrixView, KanbanBoardView } from './TaskBoardViews';
import { VirtualizedTodoList } from './VirtualizedTodoList';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { WorkspaceSkeletons } from './WorkspaceSkeletons';
import { WorkspaceToolbar } from './WorkspaceToolbar';

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
  onTodoDragStart,
  onTodoDragOver,
  onTodoDragLeave,
  onTodoDrop,
  onTodoDragEnd,
}: WorkspaceMainContentProps) {
  const { t } = useI18n();

  return (
    <main className="flex-1 overflow-y-auto px-4 pt-11 pb-8 sm:px-8 sm:pt-10">
      <div className="mx-auto w-full max-w-[820px] space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-3 pe-28 md:pe-0">
            <button
              type="button"
              onClick={() => workspaceUiStore.setIsMobileSidebarOpen(true)}
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
                className="rounded-md border border-current px-3 py-1 text-xs font-medium whitespace-nowrap hover:bg-red-500/10 transition-colors"
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
          </div>
        ) : ui.layoutMode === 'kanban' ? (
          <div key="view-kanban" className="animate-tab-enter">
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
            />
          </div>
        ) : ui.layoutMode === 'matrix' ? (
          <div key="view-matrix" className="animate-tab-enter">
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
            />
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
    </main>
  );
});
