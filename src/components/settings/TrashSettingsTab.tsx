import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { Category, Todo } from '../../types';
import {
  filterAndSortTrash,
  type TrashSortOption,
  type TrashTypeFilter,
} from '../../utils/todoLogic';
import { ColorDot } from '../ColorDot';

export interface TrashSettingsTabProps {
  trashedCategories: Category[];
  trashedTodos: Todo[];
  onRestoreTodo: (id: string) => Promise<void>;
  onPermanentDeleteTodo: (id: string) => Promise<void>;
  onRestoreCategory: (id: string) => Promise<void>;
  onPermanentDeleteCategory: (id: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  formatTimestamp: (iso: string | null) => string;
}

export const TrashSettingsTab = React.memo(function TrashSettingsTab({
  trashedCategories,
  trashedTodos,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onRestoreCategory,
  onPermanentDeleteCategory,
  onEmptyTrash,
  formatTimestamp,
}: TrashSettingsTabProps) {
  const { t, meta } = useI18n();
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [busyTrashIds, setBusyTrashIds] = useState<Set<string>>(() => new Set());
  const [trashSearchQuery, setTrashSearchQuery] = useState('');
  const [trashTypeFilter, setTrashTypeFilter] = useState<TrashTypeFilter>('all');
  const [trashSortBy, setTrashSortBy] = useState<TrashSortOption>('newest');
  const [trashDateFrom, setTrashDateFrom] = useState('');
  const [trashDateTo, setTrashDateTo] = useState('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const trashCount = trashedCategories.length + trashedTodos.length;

  const filteredTrash = useMemo(
    () =>
      filterAndSortTrash(trashedCategories, trashedTodos, {
        query: trashSearchQuery,
        typeFilter: trashTypeFilter,
        sortBy: trashSortBy,
        dateFrom: trashDateFrom,
        dateTo: trashDateTo,
        locale: meta.intlLocale,
      }),
    [
      trashedCategories,
      trashedTodos,
      trashSearchQuery,
      trashTypeFilter,
      trashSortBy,
      trashDateFrom,
      trashDateTo,
      meta.intlLocale,
    ],
  );

  const hasTrashFilters =
    trashSearchQuery.trim().length > 0 ||
    trashTypeFilter !== 'all' ||
    trashDateFrom.length > 0 ||
    trashDateTo.length > 0;

  const filteredTrashCount = filteredTrash.categories.length + filteredTrash.todos.length;

  const clearFilters = () => {
    setTrashSearchQuery('');
    setTrashTypeFilter('all');
    setTrashDateFrom('');
    setTrashDateTo('');
  };

  const runTrashItemOp = useCallback(async (key: string, op: () => Promise<void>) => {
    setBusyTrashIds((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      await op();
    } finally {
      if (isMountedRef.current) {
        setBusyTrashIds((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">{t.trashIntroDesc}</p>

        {trashCount > 0 &&
          (confirmEmptyTrash ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isEmptyingTrash}
                onClick={() => setConfirmEmptyTrash(false)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 whitespace-nowrap"
              >
                {t.cancelButton}
              </button>
              <button
                type="button"
                disabled={isEmptyingTrash}
                onClick={async () => {
                  if (isEmptyingTrash) return;
                  setIsEmptyingTrash(true);
                  try {
                    await onEmptyTrash();
                    if (isMountedRef.current) setConfirmEmptyTrash(false);
                  } finally {
                    if (isMountedRef.current) setIsEmptyingTrash(false);
                  }
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {isEmptyingTrash ? t.deletingButton : t.confirmDeleteAllPermanent}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEmptyTrash(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t.emptyTrashButton}</span>
            </button>
          ))}
      </div>

      {trashCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
          <Trash2 className="mb-2.5 h-6 w-6 text-[var(--text-muted)]" />
          <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
            {t.trashEmptyTitle}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t.trashEmptyDesc}</p>
        </div>
      ) : (
        <>
          <div
            data-testid="trash-filter-toolbar"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex flex-1 min-w-[200px] items-center">
                <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  data-testid="trash-search-input"
                  value={trashSearchQuery}
                  onChange={(e) => setTrashSearchQuery(e.target.value)}
                  placeholder={t.trashSearchPlaceholder}
                  aria-label={t.trashSearchPlaceholder}
                  className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] pl-8 pr-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
                />
                {trashSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTrashSearchQuery('')}
                    aria-label={t.clearSearch}
                    className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="relative inline-flex items-center">
                <select
                  data-testid="trash-sort-select"
                  value={trashSortBy}
                  onChange={(e) => setTrashSortBy(e.target.value as TrashSortOption)}
                  aria-label={t.trashSortNewest}
                  className="h-8 appearance-none rounded-lg border border-[var(--border)] bg-[var(--canvas)] pl-2.5 pr-7 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:border-[var(--border-strong)] focus:outline-none cursor-pointer transition-colors"
                >
                  <option value="newest">{t.trashSortNewest}</option>
                  <option value="oldest">{t.trashSortOldest}</option>
                  <option value="az">{t.trashSortAZ}</option>
                  <option value="za">{t.trashSortZA}</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-[var(--text-muted)]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label={t.tabTrash}
                className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-0.5"
              >
                {(
                  [
                    { id: 'all' as TrashTypeFilter, label: t.trashFilterAll },
                    { id: 'todos' as TrashTypeFilter, label: t.trashFilterTodos },
                    { id: 'categories' as TrashTypeFilter, label: t.trashFilterCategories },
                  ] as const
                ).map((opt) => {
                  const active = trashTypeFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      data-testid={`trash-filter-${opt.id}`}
                      aria-selected={active}
                      onClick={() => setTrashTypeFilter(opt.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <label className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <span>{t.trashDateFrom}</span>
                  <input
                    type="date"
                    data-testid="trash-date-from"
                    value={trashDateFrom}
                    onChange={(e) => setTrashDateFrom(e.target.value)}
                    aria-label={t.trashDateFrom}
                    className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 font-mono-tabular text-[11px] text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <span>{t.trashDateTo}</span>
                  <input
                    type="date"
                    data-testid="trash-date-to"
                    value={trashDateTo}
                    onChange={(e) => setTrashDateTo(e.target.value)}
                    aria-label={t.trashDateTo}
                    className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 font-mono-tabular text-[11px] text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </label>
                {hasTrashFilters && (
                  <button
                    type="button"
                    data-testid="trash-clear-filters"
                    onClick={clearFilters}
                    className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
                  >
                    {t.zoomResetButton}
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredTrashCount === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
              <Search className="mb-2 h-5 w-5 text-[var(--text-muted)]" />
              <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                {t.trashNoMatchesTitle}
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                {t.clearSearch}
              </button>
            </div>
          ) : (
            <>
              {filteredTrash.categories.length > 0 && (
                <section aria-label={t.categories} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                      {t.categories}
                    </h3>
                    <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                      {filteredTrash.categories.length}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    {filteredTrash.categories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <ColorDot color={cat.color} size="sm" />
                            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                              {cat.name}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)] font-mono-tabular">
                            {t.deletedPrefix}: {formatTimestamp(cat.deletedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isEmptyingTrash || busyTrashIds.has(`cat:${cat.id}`)}
                            onClick={() =>
                              void runTrashItemOp(`cat:${cat.id}`, () => onRestoreCategory(cat.id))
                            }
                            aria-label={`${t.restoreItemButton}: ${cat.name}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>{t.restoreItemButton}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isEmptyingTrash || busyTrashIds.has(`cat:${cat.id}`)}
                            onClick={() =>
                              void runTrashItemOp(`cat:${cat.id}`, () =>
                                onPermanentDeleteCategory(cat.id),
                              )
                            }
                            aria-label={`${t.permanentDeleteTitle}: ${cat.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                            title={t.permanentDeleteTitle}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {filteredTrash.todos.length > 0 && (
                <section aria-label={t.tasksTitle} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                      {t.tasksTitle}
                    </h3>
                    <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                      {filteredTrash.todos.length}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    {filteredTrash.todos.map((todo) => (
                      <div
                        key={todo.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-medium ${
                              todo.completed
                                ? 'line-through text-[var(--text-muted)]'
                                : 'text-[var(--text-primary)]'
                            }`}
                          >
                            {todo.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)] font-mono-tabular">
                            {t.deletedPrefix}: {formatTimestamp(todo.deletedAt)}
                            {todo.subtasks.length > 0
                              ? ` · ${todo.subtasks.length} ${t.subtaskCountUnit}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isEmptyingTrash || busyTrashIds.has(`todo:${todo.id}`)}
                            onClick={() =>
                              void runTrashItemOp(`todo:${todo.id}`, () => onRestoreTodo(todo.id))
                            }
                            aria-label={`${t.restoreItemButton}: ${todo.title}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>{t.restoreItemButton}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isEmptyingTrash || busyTrashIds.has(`todo:${todo.id}`)}
                            onClick={() =>
                              void runTrashItemOp(`todo:${todo.id}`, () =>
                                onPermanentDeleteTodo(todo.id),
                              )
                            }
                            aria-label={`${t.permanentDeleteTitle}: ${todo.title}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                            title={t.permanentDeleteTitle}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
});
