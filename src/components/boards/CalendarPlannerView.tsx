import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { usePreferencesSelector } from '../../store/preferencesStore';
import type { Todo, WeekStartDay } from '../../types';
import { getCachedDateTimeFormatter } from '../../utils/intlCache';
import {
  addDaysToDateString,
  formatDueTimeDisplay,
  normalizeDateRange,
} from '../../utils/todoLogic';
import { ColorDot } from '../ColorDot';
import type { SharedBoardViewProps } from './CompactBoardCard';

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
  weekStartsOn: WeekStartDay = 'monday',
): CalendarDayCell[] {
  const firstDay = new Date(year, monthZeroBased, 1);
  const firstDowJs = firstDay.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const startOffset = weekStartsOn === 'sunday' ? 0 : weekStartsOn === 'saturday' ? 6 : 1;
  const startDow = (firstDowJs - startOffset + 7) % 7;
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

function getMonthHeadingFormatter(locale: string): Intl.DateTimeFormat {
  return getCachedDateTimeFormatter(locale, 'calendar-month-year', {
    month: 'long',
    year: 'numeric',
  });
}

function getWeekdayFormatter(locale: string): Intl.DateTimeFormat {
  return getCachedDateTimeFormatter(locale, 'calendar-weekday-short', {
    weekday: 'short',
  });
}

export const CalendarPlannerView = React.memo(function CalendarPlannerView({
  todos,
  categoryMap,
  todayStr,
  selectedTodoId,
  dragLocked = false,
  onSelectTodo,
  onToggleComplete,
  onUpdateTodo,
  onTodoContextMenu,
  onDayContextMenu,
}: SharedBoardViewProps) {
  const { t, meta } = useI18n();
  const weekStartsOn = usePreferencesSelector((s) => s.weekStartsOn, Object.is);
  const timeFormat = usePreferencesSelector((s) => s.timeFormat, Object.is);
  const [cursorMonth, setCursorMonth] = useState<{ year: number; month: number }>(() => {
    const [y, m] = todayStr.split('-').map(Number);
    return {
      year: y || new Date().getFullYear(),
      month: m ? m - 1 : new Date().getMonth(),
    };
  });
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set());

  const toggleExpandDate = (dateStr: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const monthHeading = useMemo(() => {
    try {
      return getMonthHeadingFormatter(meta.intlLocale).format(
        new Date(cursorMonth.year, cursorMonth.month, 1),
      );
    } catch {
      return `${cursorMonth.year}-${String(cursorMonth.month + 1).padStart(2, '0')}`;
    }
  }, [cursorMonth, meta.intlLocale]);

  const weekdayLabels = useMemo(() => {
    const labels: string[] = [];
    let fmt: Intl.DateTimeFormat | null = null;
    try {
      fmt = getWeekdayFormatter(meta.intlLocale);
    } catch {
      fmt = null;
    }
    // 2026-01-04 is Sunday, 2026-01-05 is Monday, 2026-01-03 is Saturday
    const baseDay = weekStartsOn === 'sunday' ? 4 : weekStartsOn === 'saturday' ? 3 : 5;
    for (let i = 0; i < 7; i += 1) {
      const dt = new Date(2026, 0, baseDay + i);
      labels.push(fmt ? fmt.format(dt) : String(i + 1));
    }
    return labels;
  }, [meta.intlLocale, weekStartsOn]);

  const gridCells = useMemo(
    () => buildCalendarGrid(cursorMonth.year, cursorMonth.month, todayStr, weekStartsOn),
    [cursorMonth.year, cursorMonth.month, todayStr, weekStartsOn],
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

  const todosByDateMap = useMemo(() => {
    const map = new Map<string, Todo[]>();
    const firstDate = gridCells[0]?.dateStr;
    const lastDate = gridCells[gridCells.length - 1]?.dateStr;
    for (const cell of gridCells) {
      map.set(cell.dateStr, []);
    }
    if (!firstDate || !lastDate) return map;

    for (const item of scheduledTodos) {
      const { startDate, dueDate } = normalizeDateRange(item.startDate, item.dueDate);
      const s = startDate ?? dueDate;
      const e = dueDate ?? startDate;
      if (!s || !e || e < firstDate || s > lastDate) continue;
      if (s === e) {
        map.get(s)?.push(item);
      } else {
        for (const cell of gridCells) {
          if (cell.dateStr >= s && cell.dateStr <= e) {
            map.get(cell.dateStr)?.push(item);
          }
        }
      }
    }

    for (const matching of map.values()) {
      if (matching.length > 1) {
        matching.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          const timeA = a.dueTime || '99:99';
          const timeB = b.dueTime || '99:99';
          if (timeA !== timeB) return timeA < timeB ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });
      }
    }
    return map;
  }, [gridCells, scheduledTodos]);

  const handleTaskDragStart = (e: React.DragEvent<HTMLElement>, id: string) => {
    if (dragLocked) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/agendamea-cal-todo', id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDayDrop = (e: React.DragEvent<HTMLDivElement>, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    if (dragLocked) return;
    const todoId =
      e.dataTransfer.getData('text/agendamea-cal-todo') || e.dataTransfer.getData('text/plain');
    if (!todoId) return;

    const dragged = todos.find((item) => item.id === todoId);
    if (!dragged) return;
    if (dragged.startDate && dragged.dueDate && dragged.startDate !== dragged.dueDate) {
      const spanDays = Math.max(
        0,
        Math.round((Date.parse(dragged.dueDate) - Date.parse(dragged.startDate)) / 86_400_000),
      );
      void onUpdateTodo(todoId, {
        startDate: dateStr,
        dueDate: addDaysToDateString(dateStr, spanDays),
      });
    } else {
      void onUpdateTodo(todoId, { startDate: null, dueDate: dateStr });
    }
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
            <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[11px]">
              {unscheduledTodos.length}
            </span>
          </button>

          <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-0.5">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label={t.calendarPrevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={jumpToToday}
              className="px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] ag-hover-glow rounded-md"
            >
              {t.today}
            </button>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label={t.calendarNextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </div>

      {showUnscheduled && unscheduledTodos.length > 0 && (
        <div
          data-testid="calendar-unscheduled-drawer"
          className="animate-accordion rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3 space-y-2"
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
                <button
                  key={todo.id}
                  type="button"
                  draggable={!dragLocked}
                  onDragStart={(e) => handleTaskDragStart(e, todo.id)}
                  onClick={() => onSelectTodo(todo.id)}
                  onContextMenu={(e) => {
                    if (!onTodoContextMenu) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onTodoContextMenu(e, todo);
                  }}
                  className={`inline-flex max-w-[240px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {cat && <ColorDot color={cat.color} size="xs" />}
                  <span
                    className={`truncate ${todo.completed ? 'line-through text-[var(--text-muted)]' : ''}`}
                  >
                    {todo.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-subtle)]">
            {weekdayLabels.map((lbl) => (
              <div
                key={`weekday-${lbl}`}
                className="px-2 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                {lbl}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridCells.map((cell) => {
              const dayTodos = todosByDateMap.get(cell.dateStr) ?? [];
              const isOver = dragOverDate === cell.dateStr;
              const isDayExpanded = expandedDates.has(cell.dateStr);
              const visibleDayTodos = isDayExpanded ? dayTodos : dayTodos.slice(0, 4);

              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 calendar day drop-zone & context-menu container
                <div
                  key={cell.dateStr}
                  data-testid={`calendar-day-${cell.dateStr}`}
                  onDragOver={(e) => {
                    if (dragLocked) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverDate !== cell.dateStr) setDragOverDate(cell.dateStr);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                    if (dragOverDate === cell.dateStr) setDragOverDate(null);
                  }}
                  onDrop={(e) => handleDayDrop(e, cell.dateStr)}
                  onContextMenu={(e) => {
                    if (!onDayContextMenu) return;
                    e.preventDefault();
                    onDayContextMenu(e, cell.dateStr);
                  }}
                  className={`min-h-[96px] border-b border-e border-[var(--border)] [&:nth-child(7n)]:border-e-0 [&:nth-last-child(-n+7)]:border-b-0 p-1.5 transition-colors ${
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
                    {visibleDayTodos.map((todo) => {
                      const cat = todo.categoryId ? categoryMap.get(todo.categoryId) : undefined;
                      const selected = selectedTodoId === todo.id;
                      return (
                        // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 draggable calendar pill container; actions exposed via inner buttons
                        <div
                          key={todo.id}
                          draggable={!dragLocked}
                          onDragStart={(e) => handleTaskDragStart(e, todo.id)}
                          onContextMenu={(e) => {
                            if (!onTodoContextMenu) return;
                            e.preventDefault();
                            e.stopPropagation();
                            onTodoContextMenu(e, todo);
                          }}
                          className={`group flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
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
                          <button
                            type="button"
                            onClick={() => onSelectTodo(todo.id)}
                            className="flex min-w-0 flex-1 items-center gap-1 text-start focus:outline-none"
                          >
                            {todo.dueTime && (
                              <span className="shrink-0 font-mono-tabular text-[10px] text-[var(--accent)]">
                                {formatDueTimeDisplay(todo.dueTime, timeFormat) ?? todo.dueTime}
                              </span>
                            )}
                            <span
                              className={`truncate ${
                                todo.completed ? 'line-through text-[var(--text-muted)]' : ''
                              }`}
                            >
                              {todo.title}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                    {dayTodos.length > 4 && (
                      <button
                        type="button"
                        onClick={() => toggleExpandDate(cell.dateStr)}
                        aria-expanded={isDayExpanded}
                        className="w-full rounded px-1 py-0.5 text-start font-mono-tabular text-[10px] font-medium text-[var(--accent)] ag-hover-glow transition-colors"
                      >
                        {isDayExpanded ? '-' : `+${dayTodos.length - 4}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
