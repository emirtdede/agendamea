import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Pin,
  Star,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type {
  Category,
  KanbanGroupBy,
  MatrixQuadrant,
  Priority,
  Todo,
  TodoPatch,
} from '../types';
import {
  addDaysToDateString,
  classifyEisenhowerQuadrant,
  formatTodoDateSchedule,
  isTodoOnCalendarDate,
} from '../utils/todoLogic';
import { ColorDot } from './ColorDot';

interface SharedBoardViewProps {
  todos: Todo[];
  categoryMap: Map<string, Category>;
  todayStr: string;
  selectedTodoId: string | null;
  onSelectTodo: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onToggleImportant: (id: string, important: boolean) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onUpdateTodo: (id: string, patch: TodoPatch) => Promise<boolean>;
  onTagClick?: (tag: string) => void;
}

interface CompactBoardCardProps {
  todo: Todo;
  category?: Category;
  todayStr: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: boolean) => void;
  onToggleImportant: (id: string, next: boolean) => void;
  onTogglePin: (id: string, next: boolean) => void;
  onTagClick?: (tag: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
}

const CompactBoardCard = React.memo(function CompactBoardCard({
  todo,
  category,
  todayStr,
  isSelected,
  onSelect,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onTagClick,
  onDragStart,
}: CompactBoardCardProps) {
  const { t, meta } = useI18n();
  const dueInfo = formatTodoDateSchedule(
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
  );

  const completedSubtasks = todo.subtasks.filter((s) => s.completed).length;
  const totalSubtasks = todo.subtasks.length;
  const tags = todo.tags ?? [];

  return (
    <div
      data-testid="board-todo-card"
      data-todo-id={todo.id}
      draggable
      onDragStart={(e) => onDragStart(e, todo.id)}
      className={`group relative flex flex-col gap-2 rounded-xl border p-3 transition-all duration-150 ${
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
          className="flex-1 min-w-0 text-left focus:outline-none"
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
                : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)]'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${todo.important ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {(category || dueInfo || totalSubtasks > 0 || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-[11px] text-[var(--text-muted)]">
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

export const KanbanBoardView = React.memo(function KanbanBoardView({
  todos,
  categoryMap,
  todayStr,
  selectedTodoId,
  onSelectTodo,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onUpdateTodo,
  onTagClick,
}: SharedBoardViewProps) {
  const { t } = useI18n();
  const [groupBy, setGroupBy] = useState<KanbanGroupBy>('priority');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleCardDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/agendamea-kanban-todo', id);
    e.dataTransfer.setData('text/plain', id);
  };

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
    const todoId =
      e.dataTransfer.getData('text/agendamea-kanban-todo') ||
      e.dataTransfer.getData('text/plain');
    if (!todoId) return;

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
            <div
              key={col.id}
              data-testid={`kanban-col-${col.id}`}
              onDragOver={(e) => {
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
                      onSelect={onSelectTodo}
                      onToggleComplete={onToggleComplete}
                      onToggleImportant={onToggleImportant}
                      onTogglePin={onTogglePin}
                      onTagClick={onTagClick}
                      onDragStart={handleCardDragStart}
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

export const EisenhowerMatrixView = React.memo(function EisenhowerMatrixView({
  todos,
  categoryMap,
  todayStr,
  selectedTodoId,
  onSelectTodo,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onUpdateTodo,
  onTagClick,
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
        accentColor: '#d97706',
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

  const handleCardDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/agendamea-matrix-todo', id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleQuadrantDrop = (
    e: React.DragEvent<HTMLDivElement>,
    quadrant: MatrixQuadrant,
  ) => {
    e.preventDefault();
    setDragOverQuadrant(null);
    const todoId =
      e.dataTransfer.getData('text/agendamea-matrix-todo') ||
      e.dataTransfer.getData('text/plain');
    if (!todoId) return;

    if (quadrant === 'q1') {
      void onUpdateTodo(todoId, { important: true, priority: 'high', dueDate: todayStr });
    } else if (quadrant === 'q2') {
      void onUpdateTodo(todoId, { important: true, priority: 'high', dueDate: tomorrowStr });
    } else if (quadrant === 'q3') {
      void onUpdateTodo(todoId, { important: false, priority: 'normal', dueDate: todayStr });
    } else {
      void onUpdateTodo(todoId, { important: false, priority: 'low', dueDate: null, startDate: null });
    }
  };

  return (
    <div data-testid="matrix-view" className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
      {quadrants.map((q) => {
        const isOver = dragOverQuadrant === q.id;
        return (
          <div
            key={q.id}
            data-testid={`matrix-quadrant-${q.id}`}
            onDragOver={(e) => {
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
                    onSelect={onSelectTodo}
                    onToggleComplete={onToggleComplete}
                    onToggleImportant={onToggleImportant}
                    onTogglePin={onTogglePin}
                    onTagClick={onTagClick}
                    onDragStart={handleCardDragStart}
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

interface CalendarDayCell {
  dateStr: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function buildCalendarGrid(
  year: number,
  monthZeroBased: number,
  todayStr: string,
): CalendarDayCell[] {
  const firstDay = new Date(year, monthZeroBased, 1);
  // Monday-first weekday index (0 = Mon ... 6 = Sun)
  const startDow = (firstDay.getDay() + 6) % 7;
  const startCursor = new Date(year, monthZeroBased, 1 - startDow);

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const dt = new Date(
      startCursor.getFullYear(),
      startCursor.getMonth(),
      startCursor.getDate() + i,
    );
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    cells.push({
      dateStr,
      dayNumber: dt.getDate(),
      inCurrentMonth: dt.getMonth() === monthZeroBased,
      isToday: dateStr === todayStr,
    });
  }
  return cells;
}

export const CalendarPlannerView = React.memo(function CalendarPlannerView({
  todos,
  categoryMap,
  todayStr,
  selectedTodoId,
  onSelectTodo,
  onToggleComplete,
  onUpdateTodo,
}: SharedBoardViewProps) {
  const { t, meta } = useI18n();
  const [cursorMonth, setCursorMonth] = useState<{ year: number; month: number }>(() => {
    const [y, m] = todayStr.split('-').map(Number);
    return {
      year: y || new Date().getFullYear(),
      month: (m ? m - 1 : new Date().getMonth()),
    };
  });
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(true);

  const monthHeading = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(meta.intlLocale, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(cursorMonth.year, cursorMonth.month, 1));
    } catch {
      return `${cursorMonth.year}-${String(cursorMonth.month + 1).padStart(2, '0')}`;
    }
  }, [cursorMonth, meta.intlLocale]);

  const weekdayLabels = useMemo(() => {
    const labels: string[] = [];
    // 2026-01-05 is a Monday
    for (let i = 0; i < 7; i += 1) {
      const dt = new Date(2026, 0, 5 + i);
      try {
        labels.push(
          new Intl.DateTimeFormat(meta.intlLocale, { weekday: 'short' }).format(dt),
        );
      } catch {
        labels.push(String(i + 1));
      }
    }
    return labels;
  }, [meta.intlLocale]);

  const gridCells = useMemo(
    () => buildCalendarGrid(cursorMonth.year, cursorMonth.month, todayStr),
    [cursorMonth.year, cursorMonth.month, todayStr],
  );

  const { scheduledTodos, unscheduledTodos } = useMemo(() => {
    const scheduled: Todo[] = [];
    const unscheduled: Todo[] = [];
    for (const item of todos) {
      if (item.startDate || item.dueDate) {
        scheduled.push(item);
      } else {
        unscheduled.push(item);
      }
    }
    return { scheduledTodos: scheduled, unscheduledTodos: unscheduled };
  }, [todos]);

  const handleTaskDragStart = (e: React.DragEvent<HTMLElement>, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/agendamea-cal-todo', id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDayDrop = (e: React.DragEvent<HTMLDivElement>, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const todoId =
      e.dataTransfer.getData('text/agendamea-cal-todo') ||
      e.dataTransfer.getData('text/plain');
    if (!todoId) return;
    void onUpdateTodo(todoId, { dueDate: dateStr });
  };

  const stepMonth = (delta: number) => {
    setCursorMonth((prev) => {
      const dt = new Date(prev.year, prev.month + delta, 1);
      return { year: dt.getFullYear(), month: dt.getMonth() };
    });
  };

  const jumpToToday = () => {
    const [y, m] = todayStr.split('-').map(Number);
    if (y && m) {
      setCursorMonth({ year: y, month: m - 1 });
    }
  };

  return (
    <div data-testid="calendar-view" className="space-y-3">
      {/* Calendar Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-[var(--accent)] shrink-0" />
          <h2 className="font-display text-sm font-bold capitalize text-[var(--text-primary)]">
            {monthHeading}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowUnscheduled((prev) => !prev)}
            aria-pressed={showUnscheduled}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              showUnscheduled
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Inbox className="h-3.5 w-3.5 shrink-0" />
            <span>{t.unscheduledTasksTitle}</span>
            <span className="rounded bg-[var(--surface)] px-1.5 py-0.2 font-mono-tabular text-[11px]">
              {unscheduledTodos.length}
            </span>
          </button>

          <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-0.5">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="-1"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={jumpToToday}
              className="px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-md"
            >
              {t.today}
            </button>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="+1"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Undated Tasks Drawer (Drag onto any Calendar day to schedule) */}
      {showUnscheduled && unscheduledTodos.length > 0 && (
        <div
          data-testid="calendar-unscheduled-drawer"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3 space-y-2"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-display font-semibold text-[var(--text-secondary)]">
              {t.unscheduledTasksTitle} ({unscheduledTodos.length})
            </span>
            <span className="text-[11px]">{t.optionalDateHint}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unscheduledTodos.map((todo) => {
              const cat = todo.categoryId ? categoryMap.get(todo.categoryId) : undefined;
              const selected = selectedTodoId === todo.id;
              return (
                <div
                  key={todo.id}
                  draggable
                  onDragStart={(e) => handleTaskDragStart(e, todo.id)}
                  onClick={() => onSelectTodo(todo.id)}
                  className={`inline-flex max-w-[240px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {cat && <ColorDot color={cat.color} size="xs" />}
                  <span className={`truncate ${todo.completed ? 'line-through text-[var(--text-muted)]' : ''}`}>
                    {todo.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7-Column Calendar Grid (Displays Only Scheduled Tasks) */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-subtle)]">
          {weekdayLabels.map((lbl, idx) => (
            <div
              key={idx}
              className="px-2 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              {lbl}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {gridCells.map((cell) => {
            const dayTodos = scheduledTodos.filter((item) =>
              isTodoOnCalendarDate(item, cell.dateStr),
            );
            const isOver = dragOverDate === cell.dateStr;

            return (
              <div
                key={cell.dateStr}
                data-testid={`calendar-day-${cell.dateStr}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverDate !== cell.dateStr) setDragOverDate(cell.dateStr);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  if (dragOverDate === cell.dateStr) setDragOverDate(null);
                }}
                onDrop={(e) => handleDayDrop(e, cell.dateStr)}
                className={`min-h-[96px] border-b border-r border-[var(--border)] p-1.5 transition-colors ${
                  isOver
                    ? 'bg-[var(--accent-soft)]/45'
                    : !cell.inCurrentMonth
                      ? 'bg-[var(--surface-subtle)]/35'
                      : 'bg-[var(--surface)]'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 font-mono-tabular text-[11px] font-medium ${
                      cell.isToday
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-bold'
                        : cell.inCurrentMonth
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)]/60'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                </div>

                <div className="space-y-1">
                  {dayTodos.slice(0, 4).map((todo) => {
                    const cat = todo.categoryId ? categoryMap.get(todo.categoryId) : undefined;
                    const selected = selectedTodoId === todo.id;
                    return (
                      <div
                        key={todo.id}
                        draggable
                        onDragStart={(e) => handleTaskDragStart(e, todo.id)}
                        onClick={() => onSelectTodo(todo.id)}
                        className={`group flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                            : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleComplete(todo.id, !todo.completed);
                          }}
                          aria-label={todo.title}
                          className="h-2.5 w-2.5 shrink-0 rounded-full border"
                          style={
                            todo.completed
                              ? {
                                  backgroundColor: 'var(--accent)',
                                  borderColor: 'var(--accent)',
                                }
                              : {
                                  borderColor: cat ? cat.color : 'var(--border-strong)',
                                }
                          }
                        />
                        {todo.dueTime && (
                          <span className="shrink-0 font-mono-tabular text-[10px] text-[var(--accent)]">
                            {todo.dueTime}
                          </span>
                        )}
                        <span
                          className={`truncate ${
                            todo.completed ? 'line-through text-[var(--text-muted)]' : ''
                          }`}
                        >
                          {todo.title}
                        </span>
                      </div>
                    );
                  })}
                  {dayTodos.length > 4 && (
                    <div className="px-1 font-mono-tabular text-[10px] text-[var(--text-muted)]">
                      +{dayTodos.length - 4}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
