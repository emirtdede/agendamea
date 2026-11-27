import { Calendar, Clock, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { Category, Priority, Todo, TodoPatch } from '../../types';
import { SelectField } from '../SelectField';

interface TodoScheduleSectionProps {
  todo: Todo;
  categories: Category[];
  todayStr: string;
  tomorrowStr: string;
  onUpdate: (id: string, patch: TodoPatch, options?: { keepalive?: boolean }) => Promise<boolean>;
}

export function TodoScheduleSection({
  todo,
  categories,
  todayStr,
  tomorrowStr,
  onUpdate,
}: TodoScheduleSectionProps) {
  const { t } = useI18n();
  const priorities: Array<{ value: Priority; label: string }> = [
    { value: 'low', label: t.priorityLow },
    { value: 'normal', label: t.priorityNormal },
    { value: 'high', label: t.priorityHigh },
  ];
  const hasAnyDate = Boolean(todo.startDate || todo.dueDate || todo.dueTime);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label
          htmlFor="detail-category-select"
          className="block font-display text-xs font-semibold text-[var(--text-muted)]"
        >
          {t.categories}
        </label>
        <SelectField
          id="detail-category-select"
          value={todo.categoryId ?? ''}
          onChange={(e) => void onUpdate(todo.id, { categoryId: e.target.value || null })}
          wrapperClassName="w-full"
          selectClassName="py-2 text-sm"
        >
          <option value="" className="bg-[var(--surface)]">
            {t.uncategorized}
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id} className="bg-[var(--surface)]">
              {cat.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="space-y-1.5">
        <p className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.priorityLabel}
        </p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--surface-subtle)] p-1 border border-[var(--border)]">
          {priorities.map(({ value, label }) => {
            const active = todo.priority === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => void onUpdate(todo.id, { priority: value })}
                aria-pressed={active}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.dateButton}
          </span>
          {hasAnyDate && (
            <button
              type="button"
              onClick={() =>
                void onUpdate(todo.id, { startDate: null, dueDate: null, dueTime: null })
              }
              className="rounded-md px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] whitespace-nowrap"
            >
              {t.clearDate}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void onUpdate(todo.id, { startDate: null, dueDate: todayStr })}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              todo.dueDate === todayStr && !todo.startDate
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] ag-hover-card-glow'
            }`}
          >
            {t.today}
          </button>
          <button
            type="button"
            onClick={() => void onUpdate(todo.id, { startDate: null, dueDate: tomorrowStr })}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              todo.dueDate === tomorrowStr && !todo.startDate
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] ag-hover-card-glow'
            }`}
          >
            {t.tomorrow}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="space-y-1">
            <label
              htmlFor="detail-start-date"
              className="block text-[11px] font-medium text-[var(--text-muted)]"
            >
              {t.startDateLabel}
            </label>
            <div className="relative flex items-center">
              <Calendar className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                id="detail-start-date"
                type="date"
                value={todo.startDate ?? ''}
                onChange={(e) => void onUpdate(todo.id, { startDate: e.target.value || null })}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-2 py-1.5 text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="detail-due-date"
              className="block text-[11px] font-medium text-[var(--text-muted)]"
            >
              {t.dueDateLabel}
            </label>
            <div className="relative flex items-center">
              <Calendar className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                id="detail-due-date"
                type="date"
                value={todo.dueDate ?? ''}
                onChange={(e) => void onUpdate(todo.id, { dueDate: e.target.value || null })}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-2 py-1.5 text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="detail-due-time"
            className="block text-[11px] font-medium text-[var(--text-muted)]"
          >
            {t.dueTimeLabel}
          </label>
          <div className="relative flex items-center gap-1.5">
            <div className="relative flex flex-1 items-center">
              <Clock className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                id="detail-due-time"
                type="time"
                value={todo.dueTime ?? ''}
                onChange={(e) => {
                  const nextTime = e.target.value || null;
                  const patch: TodoPatch = { dueTime: nextTime };
                  if (nextTime && !todo.dueDate && !todo.startDate) {
                    patch.dueDate = todayStr;
                  }
                  void onUpdate(todo.id, patch);
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-2 py-1.5 text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
              />
            </div>
            {todo.dueTime && (
              <button
                type="button"
                onClick={() => void onUpdate(todo.id, { dueTime: null })}
                aria-label={t.clearDate}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] ag-hover-card-glow hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] leading-snug text-[var(--text-muted)]">{t.optionalDateHint}</p>
      </div>
    </div>
  );
}
