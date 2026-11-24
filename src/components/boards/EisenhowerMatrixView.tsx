import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { MatrixQuadrant, Todo } from '../../types';
import { addDaysToDateString, classifyEisenhowerQuadrant } from '../../utils/todoLogic';
import { CompactBoardCard, type SharedBoardViewProps } from './CompactBoardCard';

export const EisenhowerMatrixView = React.memo(function EisenhowerMatrixView({
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
  const [dragOverQuadrant, setDragOverQuadrant] = useState<MatrixQuadrant | null>(null);
  const tomorrowStr = useMemo(() => addDaysToDateString(todayStr, 1), [todayStr]);

  const quadrants = useMemo(() => {
    const grouped: Record<MatrixQuadrant, Todo[]> = {
      q1: [],
      q2: [],
      q3: [],
      q4: [],
    };
    for (const todo of todos) {
      const q = classifyEisenhowerQuadrant(todo, todayStr);
      grouped[q].push(todo);
    }
    return [
      {
        id: 'q1' as const,
        badge: 'I',
        title: t.matrixQ1Title,
        accentColor: '#dc2626',
        items: grouped.q1,
      },
      {
        id: 'q2' as const,
        badge: 'II',
        title: t.matrixQ2Title,
        accentColor: '#b45309',
        items: grouped.q2,
      },
      {
        id: 'q3' as const,
        badge: 'III',
        title: t.matrixQ3Title,
        accentColor: '#2563eb',
        items: grouped.q3,
      },
      {
        id: 'q4' as const,
        badge: 'IV',
        title: t.matrixQ4Title,
        accentColor: '#71717a',
        items: grouped.q4,
      },
    ];
  }, [todos, todayStr, t]);

  const handleCardDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      if (dragLocked) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/agendamea-matrix-todo', id);
      e.dataTransfer.setData('text/plain', id);
    },
    [dragLocked],
  );

  const handleQuadrantDrop = (e: React.DragEvent<HTMLDivElement>, quadrant: MatrixQuadrant) => {
    e.preventDefault();
    setDragOverQuadrant(null);
    if (dragLocked) return;
    const todoId =
      e.dataTransfer.getData('text/agendamea-matrix-todo') || e.dataTransfer.getData('text/plain');
    if (!todoId || !todos.some((item) => item.id === todoId)) return;

    if (quadrant === 'q1') {
      void onUpdateTodo(todoId, {
        important: true,
        priority: 'high',
        startDate: null,
        dueDate: todayStr,
      });
    } else if (quadrant === 'q2') {
      void onUpdateTodo(todoId, {
        important: true,
        priority: 'high',
        startDate: null,
        dueDate: tomorrowStr,
      });
    } else if (quadrant === 'q3') {
      void onUpdateTodo(todoId, {
        important: false,
        priority: 'normal',
        startDate: null,
        dueDate: todayStr,
      });
    } else {
      void onUpdateTodo(todoId, {
        important: false,
        priority: 'low',
        startDate: null,
        dueDate: null,
      });
    }
  };

  return (
    <div data-testid="matrix-view" className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
      {quadrants.map((q) => {
        const isOver = dragOverQuadrant === q.id;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 matrix quadrant drop-zone container
          <div
            key={q.id}
            data-testid={`matrix-quadrant-${q.id}`}
            onDragOver={(e) => {
              if (dragLocked) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverQuadrant !== q.id) setDragOverQuadrant(q.id);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (dragOverQuadrant === q.id) setDragOverQuadrant(null);
            }}
            onDrop={(e) => handleQuadrantDrop(e, q.id)}
            className={`flex min-h-[230px] flex-col rounded-xl border p-3.5 transition-colors ${
              isOver
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]/30'
                : 'border-[var(--border)] bg-[var(--surface-subtle)]/50'
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                  style={{ backgroundColor: q.accentColor }}
                >
                  {q.badge}
                </span>
                <h3 className="font-display text-xs font-semibold text-[var(--text-primary)] truncate">
                  {q.title}
                </h3>
              </div>
              <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                {q.items.length}
              </span>
            </div>

            <div className="flex-1 space-y-2">
              {q.items.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-[var(--border)] px-3 text-center text-xs text-[var(--text-muted)]">
                  {t.emptyListTitle}
                </div>
              ) : (
                q.items.map((todo) => (
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
  );
});
