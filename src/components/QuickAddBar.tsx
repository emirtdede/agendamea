import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CalendarRange, Check, ChevronDown, Clock, Flag, Folder, Plus, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { Category, Priority } from '../types';
import { createClientId } from '../utils/id';
import {
  addDaysToDateString,
  formatTodoDateSchedule,
  normalizeDateRange,
} from '../utils/todoLogic';
import { ColorDot } from './ColorDot';

interface QuickAddBarProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  categories: Category[];
  todayStr: string;
  defaultCategoryId: string | null;
  defaultImportant: boolean;
  defaultDueDate: string | null;
  onAdd: (payload: {
    id?: string;
    title: string;
    priority: Priority;
    startDate?: string | null;
    dueDate: string | null;
    dueTime?: string | null;
    categoryId: string | null;
    important: boolean;
  }) => Promise<void>;
}

const PRIORITY_CYCLE: Priority[] = ['normal', 'high', 'low'];

export const QuickAddBar = React.memo(function QuickAddBar({
  inputRef,
  categories,
  todayStr,
  defaultCategoryId,
  defaultImportant,
  defaultDueDate,
  onAdd,
}: QuickAddBarProps) {
  const { t, meta } = useI18n();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDateOverride, setDueDateOverride] = useState<string | null | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [categoryOverride, setCategoryOverride] = useState<string | null | undefined>(undefined);
  const [isCatMenuOpen, setIsCatMenuOpen] = useState(false);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catMenuRef = useRef<HTMLDivElement>(null);
  const datePopoverRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);
  const pendingTodoIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset manual overrides when switching views so defaults match the newly opened list
  useEffect(() => {
    setCategoryOverride(undefined);
  }, [defaultCategoryId]);

  useEffect(() => {
    setDueDateOverride(undefined);
    setStartDate(null);
    setDueTime(null);
  }, [defaultDueDate]);

  const effectiveCategoryId =
    categoryOverride !== undefined ? categoryOverride : defaultCategoryId;
  const effectiveDueDate =
    dueDateOverride !== undefined ? dueDateOverride : defaultDueDate;

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === effectiveCategoryId) ?? null,
    [categories, effectiveCategoryId],
  );

  useEffect(() => {
    if (!isCatMenuOpen && !isDatePopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (isCatMenuOpen && catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) {
        setIsCatMenuOpen(false);
      }
      if (
        isDatePopoverOpen &&
        datePopoverRef.current &&
        !datePopoverRef.current.contains(e.target as Node)
      ) {
        setIsDatePopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsCatMenuOpen(false);
        setIsDatePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isCatMenuOpen, isDatePopoverOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

    const trimmed = title.trim();
    if (!trimmed) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const id = pendingTodoIdRef.current ?? createClientId('todo');
    pendingTodoIdRef.current = id;

    const normalizedDates = normalizeDateRange(startDate, effectiveDueDate);

    try {
      await onAdd({
        id,
        title: trimmed,
        priority,
        startDate: normalizedDates.startDate,
        dueDate: normalizedDates.dueDate,
        dueTime,
        categoryId: effectiveCategoryId,
        important: defaultImportant,
      });
      if (!isMountedRef.current) return;
      setTitle('');
      setPriority('normal');
      setStartDate(null);
      setDueDateOverride(undefined);
      setDueTime(null);
      setCategoryOverride(undefined);
      setIsDatePopoverOpen(false);
      pendingTodoIdRef.current = null;
    } catch {
      // Keep title and pendingTodoIdRef for safe idempotent retry
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(priority);
    setPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
  };

  const tomorrowStr = useMemo(() => addDaysToDateString(todayStr, 1), [todayStr]);

  const cycleQuickDate = () => {
    if (!effectiveDueDate && !startDate) {
      setDueDateOverride(todayStr);
    } else if (effectiveDueDate === todayStr && !startDate) {
      setDueDateOverride(tomorrowStr);
    } else {
      setStartDate(null);
      setDueDateOverride(null);
    }
  };

  const scheduleInfo = useMemo(
    () =>
      formatTodoDateSchedule(
        startDate,
        effectiveDueDate,
        todayStr,
        meta.intlLocale,
        {
          today: t.today,
          tomorrow: t.tomorrow,
          yesterday: t.yesterday,
        },
        dueTime,
      ),
    [startDate, effectiveDueDate, dueTime, todayStr, meta.intlLocale, t.today, t.tomorrow, t.yesterday],
  );

  const dateLabel = scheduleInfo ? scheduleInfo.label : t.dateButton;
  const hasAnyDate = Boolean(startDate || effectiveDueDate);

  const priorityText =
    priority === 'high'
      ? t.priorityHigh
      : priority === 'low'
        ? t.priorityLow
        : t.priorityNormal;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors duration-150 focus-within:border-[var(--border-strong)]"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Plus className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          placeholder={t.addTaskPlaceholder}
          aria-label={t.addTaskPlaceholder}
          className="flex-1 min-w-0 bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className="rounded-lg px-4 py-1.5 text-sm font-medium transition-opacity disabled:opacity-35 whitespace-nowrap shrink-0"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {t.addButton}
        </button>
      </div>

      {/* Subtle compact quick options bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] bg-[var(--surface-subtle)]/60 px-4 py-2 text-xs rounded-b-xl">
        {/* Quick Date Cycle + Optional Start/End Date Popover */}
        <div ref={datePopoverRef} className="relative inline-flex items-center gap-1">
          <button
            type="button"
            onClick={cycleQuickDate}
            aria-label={`${t.dateButton}: ${dateLabel}`}
            className={`inline-flex items-center gap-1.5 py-0.5 font-medium transition-colors whitespace-nowrap ${
              hasAnyDate
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{dateLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDatePopoverOpen((prev) => !prev)}
            aria-expanded={isDatePopoverOpen}
            aria-label={`${t.startDateLabel} - ${t.dueDateLabel}`}
            title={`${t.startDateLabel} / ${t.dueDateLabel}`}
            className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
              isDatePopoverOpen || (startDate && effectiveDueDate)
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" />
          </button>

          {isDatePopoverOpen && (
            <div
              role="dialog"
              aria-label={`${t.startDateLabel} - ${t.dueDateLabel}`}
              className="absolute left-0 top-7 z-30 w-64 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-lg space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-semibold text-[var(--text-primary)]">
                  {t.dateButton}
                </span>
                <button
                  type="button"
                  onClick={() => setIsDatePopoverOpen(false)}
                  aria-label={t.closeMenu}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(null);
                    setDueDateOverride(todayStr);
                  }}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    !startDate && effectiveDueDate === todayStr
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {t.today}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(null);
                    setDueDateOverride(tomorrowStr);
                  }}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    !startDate && effectiveDueDate === tomorrowStr
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {t.tomorrow}
                </button>
                {hasAnyDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(null);
                      setDueDateOverride(null);
                      setDueTime(null);
                    }}
                    className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    {t.clearDate}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
                    {t.startDateLabel}
                  </label>
                  <input
                    type="date"
                    value={startDate ?? ''}
                    onChange={(e) => setStartDate(e.target.value || null)}
                    aria-label={t.startDateLabel}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
                    {t.dueDateLabel}
                  </label>
                  <input
                    type="date"
                    value={effectiveDueDate ?? ''}
                    onChange={(e) => setDueDateOverride(e.target.value || null)}
                    aria-label={t.dueDateLabel}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)]">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{t.dueTimeLabel}</span>
                  </label>
                  <input
                    type="time"
                    value={dueTime ?? ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      setDueTime(val);
                      if (val && !effectiveDueDate && !startDate) {
                        setDueDateOverride(todayStr);
                      }
                    }}
                    aria-label={t.dueTimeLabel}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                {t.optionalDateHint}
              </p>
            </div>
          )}
        </div>

        {/* Quick Priority */}
        <button
          type="button"
          onClick={cyclePriority}
          aria-label={`${t.priorityLabel}: ${priorityText}`}
          className={`inline-flex items-center gap-1.5 py-0.5 font-medium transition-colors whitespace-nowrap ${
            priority === 'high'
              ? 'text-red-600 dark:text-red-400'
              : priority === 'low'
                ? 'text-[var(--text-muted)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Flag className="h-3.5 w-3.5 shrink-0" />
          <span>
            {t.priorityLabel}: {priorityText}
          </span>
        </button>

        {/* Clean Custom Category Dropdown */}
        {categories.length > 0 && (
          <div ref={catMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsCatMenuOpen((prev) => !prev)}
              aria-expanded={isCatMenuOpen}
              aria-haspopup="listbox"
              aria-label={`${t.categories}: ${selectedCategory?.name ?? t.uncategorized}`}
              className="inline-flex items-center gap-1.5 py-0.5 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
            >
              {selectedCategory ? (
                <ColorDot color={selectedCategory.color} size="xs" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              )}
              <span className="max-w-[120px] truncate">
                {selectedCategory?.name ?? t.uncategorized}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            </button>

            {isCatMenuOpen && (
              <div
                role="listbox"
                aria-label={t.categories}
                className="animate-modal-pop absolute left-0 top-7 z-30 min-w-[176px] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={effectiveCategoryId === null}
                  onClick={() => {
                    setCategoryOverride(null);
                    setIsCatMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                    effectiveCategoryId === null
                      ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{t.uncategorized}</span>
                  {effectiveCategoryId === null && (
                    <Check className="h-3 w-3 text-[var(--accent)]" />
                  )}
                </button>
                {categories.map((cat) => {
                  const selected = effectiveCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setCategoryOverride(cat.id);
                        setIsCatMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <ColorDot color={cat.color} size="xs" />
                        <span className="truncate">{cat.name}</span>
                      </span>
                      {selected && (
                        <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <span className="ml-auto hidden sm:inline text-[11px] text-[var(--text-muted)]">
          {t.instantSaveBadge}
        </span>
      </div>
    </form>
  );
});
