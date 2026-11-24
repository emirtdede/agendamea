import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { KanbanGroupBy, Priority } from '../../types';
import { CompactBoardCard, type SharedBoardViewProps } from './CompactBoardCard';

export const KanbanBoardView = React.memo(function KanbanBoardView({
  todos,
  categoryMap,
  todayStr,
  selectedTodoId,
  dragLocked = false,
  onSelectTodo,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onUpdateTodo,
  onTagClick,
  onTodoContextMenu,
}: SharedBoardViewProps) {
  const { t } = useI18n();
  const [groupBy, setGroupBy] = useState<KanbanGroupBy>('priority');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleCardDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      if (dragLocked) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/agendamea-kanban-todo', id);
      e.dataTransfer.setData('text/plain', id);
    },
    [dragLocked],
  );

  const columns = useMemo(() => {
    if (groupBy === 'status') {
      return [
        {
          id: 'active',
          title: t.filterActive,
          dotColor: '#2563eb',
          items: todos.filter((item) => !item.completed),
        },
        {
          id: 'completed',
          title: t.filterCompleted,
          dotColor: '#16a34a',
          items: todos.filter((item) => item.completed),
        },
      ];
    }
    return [
      {
        id: 'high',
        title: t.priorityHigh,
        dotColor: '#dc2626',
        items: todos.filter((item) => item.priority === 'high'),
      },
      {
        id: 'normal',
        title: t.priorityNormal,
        dotColor: '#2563eb',
        items: todos.filter((item) => item.priority === 'normal'),
      },
      {
        id: 'low',
        title: t.priorityLow,
        dotColor: '#71717a',
        items: todos.filter((item) => item.priority === 'low'),
      },
    ];
  }, [groupBy, todos, t]);

  const handleColumnDrop = (e: React.DragEvent<HTMLDivElement>, colId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (dragLocked) return;
    const todoId =
      e.dataTransfer.getData('text/agendamea-kanban-todo') || e.dataTransfer.getData('text/plain');
    if (!todoId || !todos.some((item) => item.id === todoId)) return;

    if (groupBy === 'status') {
      const nextCompleted = colId === 'completed';
      void onUpdateTodo(todoId, { completed: nextCompleted });
    } else if (colId === 'high' || colId === 'normal' || colId === 'low') {
      void onUpdateTodo(todoId, { priority: colId as Priority });
    }
  };

  return (
    <div data-testid="kanban-view" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label={t.viewKanban}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={groupBy === 'priority'}
            onClick={() => setGroupBy('priority')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              groupBy === 'priority'
                ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.kanbanGroupByPriority}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={groupBy === 'status'}
            onClick={() => setGroupBy('status')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              groupBy === 'status'
                ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.kanbanGroupByStatus}
          </button>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 gap-3 ${
          columns.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
        }`}
      >
        {columns.map((col) => {
          const isOver = dragOverColumn === col.id;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 kanban column drop-zone container
            <div
              key={col.id}
              data-testid={`kanban-col-${col.id}`}
              onDragOver={(e) => {
                if (dragLocked) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverColumn !== col.id) setDragOverColumn(col.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                if (dragOverColumn === col.id) setDragOverColumn(null);
              }}
              onDrop={(e) => handleColumnDrop(e, col.id)}
              className={`flex min-h-[280px] flex-col rounded-xl border p-3 transition-colors ${
                isOver
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]/30'
                  : 'border-[var(--border)] bg-[var(--surface-subtle)]/50'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: col.dotColor }}
                  />
                  <h3 className="font-display text-xs font-semibold text-[var(--text-primary)] truncate">
                    {col.title}
                  </h3>
                </div>
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {col.items.length}
                </span>
              </div>

              <div className="flex-1 space-y-2">
                {col.items.length === 0 ? (
                  <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-[var(--border)] px-3 text-center text-xs text-[var(--text-muted)]">
                    {t.emptyListTitle}
                  </div>
                ) : (
                  col.items.map((todo) => (
                    <CompactBoardCard
                      key={todo.id}
                      todo={todo}
                      category={todo.categoryId ? categoryMap.get(todo.categoryId) : undefined}
                      todayStr={todayStr}
                      isSelected={selectedTodoId === todo.id}
                      dragLocked={dragLocked}
                      onSelect={onSelectTodo}
                      onToggleComplete={onToggleComplete}
                      onToggleImportant={onToggleImportant}
                      onTogglePin={onTogglePin}
                      onTagClick={onTagClick}
                      onDragStart={handleCardDragStart}
                      onContextMenu={onTodoContextMenu}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
