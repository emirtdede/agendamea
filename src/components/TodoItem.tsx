import React, { useMemo } from 'react';
import { Check, Pin, Star, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { Category, Todo } from '../types';
import { formatTodoDateSchedule } from '../utils/todoLogic';
import { ColorDot } from './ColorDot';

interface TodoItemProps {
  todo: Todo;
  category?: Category;
  todayStr: string;
  isSelected: boolean;
  canDrag: boolean;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: boolean) => void;
  onToggleImportant: (id: string, next: boolean) => void;
  onTogglePin: (id: string, next: boolean) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragLeave: (id: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onTagClick?: (tag: string) => void;
  onContextMenu?: (e: React.MouseEvent, todo: Todo) => void;
}

export const TodoItem = React.memo(function TodoItem({
  todo,
  category,
  todayStr,
  isSelected,
  canDrag,
  isDragging,
  dropIndicator,
  onSelect,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onTagClick,
  onContextMenu,
}: TodoItemProps) {
  const { t, meta } = useI18n();
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
      ),
    [
      todo.startDate,
      todo.dueDate,
      todo.dueTime,
      todayStr,
      meta.intlLocale,
      t.today,
      t.tomorrow,
      t.yesterday,
    ],
  );
  let completedSubtasks = 0;
  for (let i = 0; i < todo.subtasks.length; i += 1) {
    if (todo.subtasks[i].completed) completedSubtasks += 1;
  }
  const totalSubtasks = todo.subtasks.length;

  const metadataParts: Array<{ key: string; content: React.ReactNode }> = [];

  if (category) {
    metadataParts.push({
      key: 'category',
      content: (
        <span className="inline-flex items-center gap-1.5">
          <ColorDot color={category.color} size="xs" />
          <span>{category.name}</span>
        </span>
      ),
    });
  }

  if (dueInfo) {
    const overdue = dueInfo.isOverdue && !todo.completed;
    metadataParts.push({
      key: 'due',
      content: (
        <span
          className={
            overdue
              ? 'text-red-600 dark:text-red-400 font-medium'
              : dueInfo.isToday && !todo.completed
                ? 'text-[var(--accent)] font-medium'
                : ''
          }
        >
          {dueInfo.label}
          {overdue ? ` (${t.overdueSuffix})` : ''}
        </span>
      ),
    });
  }

  if (todo.priority !== 'normal') {
    const prioText =
      todo.priority === 'high' ? t.priorityHigh : t.priorityLow;
    metadataParts.push({
      key: 'priority',
      content: (
        <span
          className={
            todo.priority === 'high' && !todo.completed
              ? 'text-red-600 dark:text-red-400 font-medium'
              : ''
          }
        >
          {prioText} {t.prioritySuffix}
        </span>
      ),
    });
  }

  if (totalSubtasks > 0) {
    metadataParts.push({
      key: 'subtasks',
      content: (
        <span className="font-mono-tabular">
          {completedSubtasks}/{totalSubtasks} {t.subtaskCountUnit}
        </span>
      ),
    });
  }

  const tags = todo.tags ?? [];
  if (tags.length > 0) {
    metadataParts.push({
      key: 'tags',
      content: (
        <span className="inline-flex flex-wrap items-center gap-1">
          {tags.map((tg) => (
            <span
              key={tg}
              role={onTagClick ? 'button' : undefined}
              tabIndex={onTagClick ? 0 : undefined}
              onClick={(e) => {
                if (!onTagClick) return;
                e.stopPropagation();
                onTagClick(tg);
              }}
              onKeyDown={(e) => {
                if (!onTagClick) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onTagClick(tg);
                }
              }}
              className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-0.2 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              #{tg}
            </span>
          ))}
        </span>
      ),
    });
  }

  const trimmedNotes = todo.notes.trim();

  return (
    <div
      data-testid="todo-item"
      data-todo-id={todo.id}
      data-pinned={todo.pinned ? 'true' : 'false'}
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) return;
        onDragStart(e, todo.id);
      }}
      onDragOver={(e) => {
        if (!canDrag) return;
        onDragOver(e, todo.id);
      }}
      onDragLeave={(e) => {
        if (!canDrag) return;
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        onDragLeave(todo.id);
      }}
      onDrop={(e) => {
        if (!canDrag) return;
        onDrop(e, todo.id);
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(e, todo);
      }}
      className={`group relative flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0 transition-colors duration-150 ${
        isSelected
          ? 'bg-[var(--accent-soft)]'
          : 'hover:bg-[var(--surface-hover)]/70'
      } ${isDragging ? 'opacity-45' : ''}`}
    >
      {/* Subtle insertion indicator during drag-over (no static icons) */}
      {dropIndicator === 'before' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-0 h-0.5 rounded-full bg-[var(--accent)]"
        />
      )}
      {dropIndicator === 'after' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
        />
      )}

      {/* Check Button */}
      <button
        type="button"
        onClick={() => onToggleComplete(todo.id, !todo.completed)}
        aria-label={
          todo.completed
            ? `${t.markCompletedDone}: ${todo.title}`
            : `${t.markComplete}: ${todo.title}`
        }
        aria-pressed={todo.completed}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-150"
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
        {todo.completed && <Check className="h-3 w-3 stroke-[3] animate-check-pop" />}
      </button>

      {/* Main Clickable Task Area */}
      <button
        type="button"
        onClick={() => onSelect(todo.id)}
        aria-label={todo.title}
        className="flex-1 min-w-0 text-left focus:outline-none"
      >
        <p
          className={`text-[15px] leading-snug break-words transition-colors ${
            todo.completed
              ? 'line-through text-[var(--text-muted)]'
              : 'text-[var(--text-primary)] font-medium'
          }`}
        >
          {todo.title}
        </p>

        {metadataParts.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[var(--text-muted)]">
            {metadataParts.map((part, idx) => (
              <span key={part.key} className="inline-flex items-center gap-2 whitespace-nowrap">
                {idx > 0 && <span aria-hidden="true">·</span>}
                {part.content}
              </span>
            ))}
          </div>
        )}

        {trimmedNotes.length > 0 && (
          <p className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]/85">
            {trimmedNotes}
          </p>
        )}
      </button>

      {/* Right Action Controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onTogglePin(todo.id, !todo.pinned)}
          aria-label={`${todo.pinned ? t.unpinLabel : t.pinLabel}: ${todo.title}`}
          aria-pressed={todo.pinned}
          title={todo.pinned ? t.unpinLabel : t.pinLabel}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            todo.pinned
              ? 'text-[var(--accent)] hover:bg-[var(--surface)]'
              : 'text-[var(--text-muted)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Pin className={`h-3.5 w-3.5 ${todo.pinned ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onToggleImportant(todo.id, !todo.important)}
          aria-label={`${t.important}: ${todo.title}`}
          aria-pressed={todo.important}
          title={t.important}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            todo.important
              ? 'text-amber-500'
              : 'text-[var(--text-muted)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Star className={`h-4 w-4 ${todo.important ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onDelete(todo.id)}
          aria-label={`${t.deleteToTrashButton}: ${todo.title}`}
          title={t.deleteToTrashButton}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-[var(--surface)] hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
