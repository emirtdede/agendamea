import { Clock, RotateCcw, Search, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { Category, Todo, TrashAutoPurgeDays } from '../../types';
import {
  filterAndSortTrash,
  type TrashSortOption,
  type TrashTypeFilter,
} from '../../utils/todoLogic';
import { ColorDot } from '../ColorDot';
import { ContextMenu } from '../ContextMenu';
import { SelectField } from '../SelectField';

export interface TrashSettingsTabProps {
  trashedCategories: Category[];
  trashedTodos: Todo[];
  completedTodoCount?: number;
  trashAutoPurgeDays?: TrashAutoPurgeDays;
  onChangeTrashAutoPurgeDays?: (days: TrashAutoPurgeDays) => void;
  onClearAllCompleted?: () => Promise<void>;
  onRestoreTodo: (id: string) => Promise<void>;
  onPermanentDeleteTodo: (id: string) => Promise<void>;
  onRestoreCategory: (id: string) => Promise<void>;
  onPermanentDeleteCategory: (id: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  onRestoreAllTrash?: () => Promise<void>;
  formatTimestamp: (iso: string | null) => string;
}

export const TrashSettingsTab = React.memo(function TrashSettingsTab({
  trashedCategories,
  trashedTodos,
  completedTodoCount = 0,
  trashAutoPurgeDays = 30,
  onChangeTrashAutoPurgeDays,
  onClearAllCompleted,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onRestoreCategory,
  onPermanentDeleteCategory,
  onEmptyTrash,
  onRestoreAllTrash,
  formatTimestamp,
}: TrashSettingsTabProps) {
  const { t, meta } = useI18n();
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [busyTrashIds, setBusyTrashIds] = useState<Set<string>>(() => new Set());
  const [trashSearchQuery, setTrashSearchQuery] = useState('');
  const [trashTypeFilter, setTrashTypeFilter] = useState<TrashTypeFilter>('all');
  const [trashSortBy, setTrashSortBy] = useState<TrashSortOption>('newest');
  const [trashDateFrom, setTrashDateFrom] = useState('');
  const [trashDateTo, setTrashDateTo] = useState('');
  const [trashCtxMenu, setTrashCtxMenu] = useState<{
    x: number;
    y: number;
    kind: 'todo' | 'category';
    id: string;
  } | null>(null);
  const isMountedRef = useRef(true);
  const busyTrashRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const validKeys = new Set<string>([
      ...trashedCategories.map((c) => `cat:${c.id}`),
      ...trashedTodos.map((td) => `todo:${td.id}`),
    ]);
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (validKeys.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [trashedCategories, trashedTodos]);

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
    if (busyTrashRef.current.has(key)) return;
    busyTrashRef.current.add(key);
    setBusyTrashIds(new Set(busyTrashRef.current));
    try {
      await op();
    } finally {
      busyTrashRef.current.delete(key);
      if (isMountedRef.current) {
        setBusyTrashIds(new Set(busyTrashRef.current));
      }
    }
  }, []);

  const toggleSelectedKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allFilteredKeys = useMemo(
    () => [
      ...filteredTrash.categories.map((c) => `cat:${c.id}`),
      ...filteredTrash.todos.map((td) => `todo:${td.id}`),
    ],
    [filteredTrash.categories, filteredTrash.todos],
  );

  const handleBulkRestore = async () => {
    if (isBulkBusy || selectedKeys.size === 0) return;
    setIsBulkBusy(true);
    try {
      for (const key of Array.from(selectedKeys)) {
        if (key.startsWith('cat:')) await onRestoreCategory(key.slice(4));
        else if (key.startsWith('todo:')) await onRestoreTodo(key.slice(5));
      }
      if (isMountedRef.current) setSelectedKeys(new Set());
    } finally {
      if (isMountedRef.current) setIsBulkBusy(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (isBulkBusy || selectedKeys.size === 0) return;
    setIsBulkBusy(true);
    try {
      for (const key of Array.from(selectedKeys)) {
        if (key.startsWith('cat:')) await onPermanentDeleteCategory(key.slice(4));
        else if (key.startsWith('todo:')) await onPermanentDeleteTodo(key.slice(5));
      }
      if (isMountedRef.current) setSelectedKeys(new Set());
    } finally {
      if (isMountedRef.current) setIsBulkBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-setting-id="trash-main">
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
                    if (isMountedRef.current) {
                      setConfirmEmptyTrash(false);
                      setSelectedKeys(new Set());
                    }
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
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {onRestoreAllTrash && (
                <button
                  type="button"
                  data-testid="trash-restore-all-btn"
                  disabled={isBulkBusy || isEmptyingTrash}
                  onClick={() => {
                    void (async () => {
                      setIsBulkBusy(true);
                      try {
                        await onRestoreAllTrash();
                        if (isMountedRef.current) setSelectedKeys(new Set());
                      } finally {
                        if (isMountedRef.current) setIsBulkBusy(false);
                      }
                    })();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>{t.trashRestoreAllButton}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmEmptyTrash(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t.emptyTrashButton}</span>
              </button>
            </div>
          ))}
      </div>

      {/* Always-Visible Trash Policy & Maintenance Card (visible even when Trash is empty) */}
      {(onChangeTrashAutoPurgeDays || onClearAllCompleted) && (
        <section
          aria-label={t.generalTrashAutoPurgeTitle}
          data-setting-id="trash-retention"
          data-testid="trash-retention-card"
          className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        >
          {onChangeTrashAutoPurgeDays && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <Clock className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t.generalTrashAutoPurgeTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {t.generalTrashAutoPurgeDesc}
                  </p>
                </div>
              </div>
              <SelectField
                data-testid="general-trash-purge-select"
                value={trashAutoPurgeDays}
                onChange={(e) =>
                  onChangeTrashAutoPurgeDays(Number(e.target.value) as TrashAutoPurgeDays)
                }
                wrapperClassName="min-w-[12.5rem] shrink-0"
              >
                <option value={0}>{t.generalTrashPurgeNever}</option>
                <option value={7}>{t.generalTrashPurge7}</option>
                <option value={30}>{t.generalTrashPurge30}</option>
                <option value={90}>{t.generalTrashPurge90}</option>
              </SelectField>
            </div>
          )}

          {onClearAllCompleted && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t.moveCompletedToTrashTitle}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {completedTodoCount > 0
                    ? `${completedTodoCount} ${t.completedCountLabel}`
                    : t.moveCompletedToTrashEmptyDesc}
                </p>
              </div>
              <button
                type="button"
                data-testid="trash-move-completed-btn"
                disabled={completedTodoCount === 0 || isClearingCompleted}
                onClick={async () => {
                  if (isClearingCompleted) return;
                  setIsClearingCompleted(true);
                  try {
                    await onClearAllCompleted();
                  } finally {
                    if (isMountedRef.current) setIsClearingCompleted(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isClearingCompleted ? t.movingButton : t.moveButton}</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* Bulk Selection Action Bar */}
      {trashCount > 0 && filteredTrashCount > 0 && (
        <div
          data-testid="trash-bulk-bar"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs"
        >
          <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={
                allFilteredKeys.length > 0 && allFilteredKeys.every((k) => selectedKeys.has(k))
              }
              onChange={(e) => {
                if (e.target.checked) setSelectedKeys(new Set(allFilteredKeys));
                else setSelectedKeys(new Set());
              }}
              className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
            />
            <span>
              {t.trashSelectAllLabel} ({selectedKeys.size}/{allFilteredKeys.length})
            </span>
          </label>
          {selectedKeys.size > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="trash-bulk-restore-btn"
                disabled={isBulkBusy}
                onClick={() => void handleBulkRestore()}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" />
                <span>
                  {t.restoreItemButton} ({selectedKeys.size})
                </span>
              </button>
              <button
                type="button"
                data-testid="trash-bulk-delete-btn"
                disabled={isBulkBusy}
                onClick={() => void handleBulkPermanentDelete()}
                className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />
                <span>
                  {t.permanentDeleteTitle} ({selectedKeys.size})
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {trashCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
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
                <Search className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  data-testid="trash-search-input"
                  value={trashSearchQuery}
                  onChange={(e) => setTrashSearchQuery(e.target.value)}
                  placeholder={t.trashSearchPlaceholder}
                  aria-label={t.trashSearchPlaceholder}
                  className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
                />
                {trashSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTrashSearchQuery('')}
                    aria-label={t.clearSearch}
                    className="absolute end-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <SelectField
                data-testid="trash-sort-select"
                value={trashSortBy}
                onChange={(e) => setTrashSortBy(e.target.value as TrashSortOption)}
                aria-label={t.trashSortNewest}
                selectClassName="h-8 font-medium hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <option value="newest">{t.trashSortNewest}</option>
                <option value="oldest">{t.trashSortOldest}</option>
                <option value="az">{t.trashSortAZ}</option>
                <option value="za">{t.trashSortZA}</option>
              </SelectField>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <fieldset
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
                      data-testid={`trash-filter-${opt.id}`}
                      aria-pressed={active}
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
              </fieldset>

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
                    {t.clearDate}
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
                      // biome-ignore lint/a11y/noStaticElementInteractions: Trash category context-menu wrapper; actions exposed via inner buttons
                      <div
                        key={cat.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setTrashCtxMenu({
                            x: e.clientX,
                            y: e.clientY,
                            kind: 'category',
                            id: cat.id,
                          });
                        }}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-hover)]/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(`cat:${cat.id}`)}
                            onChange={() => toggleSelectedKey(`cat:${cat.id}`)}
                            aria-label={cat.name}
                            className="h-3.5 w-3.5 shrink-0 rounded accent-[var(--accent)]"
                          />
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
                      // biome-ignore lint/a11y/noStaticElementInteractions: Trash todo context-menu wrapper; actions exposed via inner buttons
                      <div
                        key={todo.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setTrashCtxMenu({
                            x: e.clientX,
                            y: e.clientY,
                            kind: 'todo',
                            id: todo.id,
                          });
                        }}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-hover)]/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(`todo:${todo.id}`)}
                            onChange={() => toggleSelectedKey(`todo:${todo.id}`)}
                            aria-label={todo.title}
                            className="h-3.5 w-3.5 shrink-0 rounded accent-[var(--accent)]"
                          />
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

      {trashCtxMenu && (
        <ContextMenu
          testId="trash-context-menu"
          x={trashCtxMenu.x}
          y={trashCtxMenu.y}
          onClose={() => setTrashCtxMenu(null)}
          items={[
            {
              id: 'restore',
              label: t.restoreItemButton,
              icon: <RotateCcw className="h-3.5 w-3.5" />,
              disabled:
                isEmptyingTrash ||
                busyTrashIds.has(
                  `${trashCtxMenu.kind === 'category' ? 'cat' : 'todo'}:${trashCtxMenu.id}`,
                ),
              onSelect: () => {
                if (trashCtxMenu.kind === 'category') {
                  void runTrashItemOp(`cat:${trashCtxMenu.id}`, () =>
                    onRestoreCategory(trashCtxMenu.id),
                  );
                } else {
                  void runTrashItemOp(`todo:${trashCtxMenu.id}`, () =>
                    onRestoreTodo(trashCtxMenu.id),
                  );
                }
              },
            },
            { id: 'div-1', divider: true },
            {
              id: 'permanent-delete',
              label: t.permanentDeleteTitle,
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              disabled:
                isEmptyingTrash ||
                busyTrashIds.has(
                  `${trashCtxMenu.kind === 'category' ? 'cat' : 'todo'}:${trashCtxMenu.id}`,
                ),
              onSelect: () => {
                if (trashCtxMenu.kind === 'category') {
                  void runTrashItemOp(`cat:${trashCtxMenu.id}`, () =>
                    onPermanentDeleteCategory(trashCtxMenu.id),
                  );
                } else {
                  void runTrashItemOp(`todo:${trashCtxMenu.id}`, () =>
                    onPermanentDeleteTodo(trashCtxMenu.id),
                  );
                }
              },
            },
          ]}
        />
      )}
    </div>
  );
});
