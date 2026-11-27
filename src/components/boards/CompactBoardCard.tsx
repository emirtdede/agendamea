import { Check, Clock, Pin, Star } from 'lucide-react';
import React, { useMemo } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { usePreferencesSelector } from '../../store/preferencesStore';
import type { Category, Priority, Todo, TodoPatch } from '../../types';
import { formatTodoDateSchedule } from '../../utils/todoLogic';
import { ColorDot } from '../ColorDot';

export interface SharedBoardViewProps {
  todos: Todo[];
  categoryMap: Map<string, Category>;
  todayStr: string;
  selectedTodoId: string | null;
  dragLocked?: boolean;
  onSelectTodo: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onToggleImportant: (id: string, important: boolean) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onUpdateTodo: (id: string, patch: TodoPatch) => Promise<boolean>;
  onTagClick?: (tag: string) => void;
  onTodoContextMenu?: (e: React.MouseEvent, todo: Todo) => void;
  onDayContextMenu?: (e: React.MouseEvent, dateStr: string) => void;
  onQuickCreateInBoard?: (preset: {
    priority?: Priority;
    dueDate?: string | null;
    important?: boolean;
  }) => void;
}

export interface CompactBoardCardProps {
  todo: Todo;
  category?: Category;
  todayStr: string;
  isSelected: boolean;
  dragLocked?: boolean;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: boolean) => void;
  onToggleImportant: (id: string, next: boolean) => void;
  onTogglePin: (id: string, next: boolean) => void;
  onTagClick?: (tag: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onContextMenu?: (e: React.MouseEvent, todo: Todo) => void;
}

export const CompactBoardCard = React.memo(function CompactBoardCard({
  todo,
  category,
  todayStr,
  isSelected,
  dragLocked = false,
  onSelect,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onTagClick,
  onDragStart,
  onContextMenu,
}: CompactBoardCardProps) {
  const { t, meta } = useI18n();
  const timeFormat = usePreferencesSelector((s) => s.timeFormat, Object.is);
  const dueInfo = useMemo(
    () =>
      formatTodoDateSchedule(
        todo.startDate,
        todo.dueDate,
        todayStr,
        meta.intlLocale,
        {
          today: t.today,
          tomorrow: t.tomorrow,
          yesterday: t.yesterday,
        },
        todo.dueTime,
        timeFormat,
      ),
    [
      todo.startDate,
      todo.dueDate,
      todo.dueTime,
      timeFormat,
      todayStr,
      meta.intlLocale,
      t.today,
      t.tomorrow,
      t.yesterday,
    ],
  );

  let completedSubtasks = 0;
  for (const sub of todo.subtasks) {
    if (sub.completed) completedSubtasks += 1;
  }
  const totalSubtasks = todo.subtasks.length;
  const tags = todo.tags ?? [];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 draggable board card container; actions exposed via inner buttons
    <div
      data-testid="board-todo-card"
      data-todo-id={todo.id}
      draggable={!dragLocked}
      onDragStart={(e) => {
        if (dragLocked) {
          e.preventDefault();
          return;
        }
        onDragStart(e, todo.id);
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, todo);
      }}
      className={`group relative flex flex-col gap-2 rounded-xl border p-3 transition-colors duration-150 ${
        isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => onToggleComplete(todo.id, !todo.completed)}
          aria-label={
            todo.completed
              ? `${t.markCompletedDone}: ${todo.title}`
              : `${t.markComplete}: ${todo.title}`
          }
          aria-pressed={todo.completed}
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
          style={
            todo.completed
              ? {
                  backgroundColor: 'var(--accent)',
                  borderColor: 'var(--accent)',
                  color: 'var(--accent-fg)',
                }
              : {
                  borderColor: 'var(--border-strong)',
                  backgroundColor: 'transparent',
                }
          }
        >
          {todo.completed && <Check className="h-2.5 w-2.5 stroke-[3]" />}
        </button>

        <button
          type="button"
          onClick={() => onSelect(todo.id)}
          className="flex-1 min-w-0 text-start focus:outline-none"
        >
          <p
            className={`text-sm leading-snug break-words ${
              todo.completed
                ? 'line-through text-[var(--text-muted)]'
                : 'font-medium text-[var(--text-primary)]'
            }`}
          >
            {todo.title}
          </p>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          {todo.pinned && (
            <button
              type="button"
              onClick={() => onTogglePin(todo.id, !todo.pinned)}
              aria-label={t.unpinLabel}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--accent)]"
            >
              <Pin className="h-3 w-3 fill-current" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleImportant(todo.id, !todo.important)}
            aria-label={t.important}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              todo.important
                ? 'text-amber-500'
                : 'text-[var(--text-muted)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:text-[var(--text-primary)]'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${todo.important ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {(category || dueInfo || totalSubtasks > 0 || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 ps-6 text-[11px] text-[var(--text-muted)]">
          {category && (
            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5">
              <ColorDot color={category.color} size="xs" />
              <span className="max-w-[96px] truncate">{category.name}</span>
            </span>
          )}

          {dueInfo && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                dueInfo.isOverdue && !todo.completed
                  ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-medium'
                  : dueInfo.isToday && !todo.completed
                    ? 'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                    : 'border-[var(--border)] bg-[var(--canvas)]'
              }`}
            >
              <Clock className="h-2.5 w-2.5 shrink-0" />
              <span>{dueInfo.label}</span>
            </span>
          )}

          {totalSubtasks > 0 && (
            <span className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 font-mono-tabular">
              {completedSubtasks}/{totalSubtasks}
            </span>
          )}

          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(tag);
              }}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-0.5 font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
