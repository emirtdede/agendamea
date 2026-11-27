import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Columns3,
  Grid2x2,
  Hash,
  List,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { LayoutMode, SortOption, StatusFilter } from '../types';

interface WorkspaceToolbarProps {
  isCompletedView: boolean;
  statusFilter: StatusFilter;
  layoutMode: LayoutMode;
  tagFilter: string | null;
  completedCountInView: number;
  searchQuery: string;
  searchDateFrom: string;
  searchDateTo: string;
  isDateFilterOpen: boolean;
  hasDateRangeFilter: boolean;
  showDateRangeBar: boolean;
  sortBy: SortOption;
  onChangeStatusFilter: (next: StatusFilter) => void;
  onChangeLayoutMode: (next: LayoutMode) => void;
  onClearTagFilter: () => void;
  onClearCompleted: () => void;
  onToggleDateFilter: () => void;
  onChangeDateFrom: (val: string) => void;
  onChangeDateTo: (val: string) => void;
  onClearDateRange: () => void;
  onCloseDateRangeBar: () => void;
  onChangeSortBy: (next: SortOption) => void;
}

export const WorkspaceToolbar = React.memo(function WorkspaceToolbar({
  isCompletedView,
  statusFilter,
  layoutMode,
  tagFilter,
  completedCountInView,
  searchQuery,
  searchDateFrom,
  searchDateTo,
  isDateFilterOpen,
  hasDateRangeFilter,
  showDateRangeBar,
  sortBy,
  onChangeStatusFilter,
  onChangeLayoutMode,
  onClearTagFilter,
  onClearCompleted,
  onToggleDateFilter,
  onChangeDateFrom,
  onChangeDateTo,
  onClearDateRange,
  onCloseDateRangeBar,
  onChangeSortBy,
}: WorkspaceToolbarProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        event.target instanceof Node &&
        !menuContainerRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMenuOpen(false);
        triggerBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menuOpen]);

  const sortOptions: ReadonlyArray<{ id: SortOption; label: string }> = [
    { id: 'manual', label: t.sortCustom },
    { id: 'priority', label: t.sortPriority },
    { id: 'dueDate', label: t.sortDueDate },
    { id: 'newest', label: t.sortNewest },
  ];

  const statusOptions: ReadonlyArray<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: t.filterAll },
    { id: 'active', label: t.filterActive },
    { id: 'completed', label: t.filterCompleted },
  ];

  const activeStatusLabel =
    statusFilter === 'active'
      ? t.filterActive
      : statusFilter === 'completed'
        ? t.filterCompleted
        : t.filterAll;
  const activeSortLabel = sortOptions.find((opt) => opt.id === sortBy)?.label ?? t.sortCustom;
  const hasCustomFilterOrSort = (!isCompletedView && statusFilter !== 'all') || sortBy !== 'manual';

  // Localized compact trigger label: shows active status (or active sort in Completed view / custom sort)
  const triggerLabel = isCompletedView
    ? activeSortLabel
    : statusFilter !== 'all'
      ? activeStatusLabel
      : sortBy !== 'manual'
        ? activeSortLabel
        : t.filterAll;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pt-0.5">
        {/* Left: Boxless Hairline-Underline 4-Way Layout Switcher */}
        <div
          role="tablist"
          aria-label={t.viewList}
          data-testid="layout-mode-switcher"
          className="flex min-w-0 items-center gap-3.5 sm:gap-5"
        >
          {(
            [
              { id: 'list', label: t.viewList, Icon: List },
              { id: 'kanban', label: t.viewKanban, Icon: Columns3 },
              { id: 'calendar', label: t.viewCalendar, Icon: CalendarIcon },
              { id: 'matrix', label: t.viewMatrix, Icon: Grid2x2 },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = layoutMode === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                title={label}
                aria-label={label}
                data-testid={`layout-tab-${id}`}
                aria-selected={active}
                onClick={() => onChangeLayoutMode(id)}
                className={`relative inline-flex items-center gap-1.5 pb-2.5 pt-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className={active ? 'inline' : 'hidden sm:inline'}>{label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-px h-[1.5px] bg-[var(--text-primary)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Single-Row Minimal Controls (Optional #tag + Date Range Icon + Unified Filter/Sort Popover) */}
        <div className="flex shrink-0 items-center gap-1.5 pb-1.5">
          {tagFilter && (
            <button
              type="button"
              onClick={onClearTagFilter}
              title={`#${tagFilter}`}
              className="inline-flex h-7 max-w-[116px] items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 text-xs font-medium text-[var(--text-primary)] transition-colors"
            >
              <Hash className="h-3 w-3 shrink-0 text-[var(--accent)]" />
              <span className="truncate">{tagFilter}</span>
              <X className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
            </button>
          )}

          <button
            type="button"
            data-testid="tasks-date-range-toggle"
            aria-pressed={showDateRangeBar}
            aria-label={t.taskDateRangeFilterButton}
            onClick={onToggleDateFilter}
            title={t.taskDateRangeFilterButton}
            className={`relative inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
              hasDateRangeFilter || isDateFilterOpen
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            {hasDateRangeFilter && (
              <span
                aria-hidden="true"
                className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
              />
            )}
          </button>

          <div ref={menuContainerRef} className="relative">
            <button
              ref={triggerBtnRef}
              type="button"
              data-testid="workspace-display-menu-toggle"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-controls={popoverId}
              title={`${activeStatusLabel} · ${activeSortLabel}`}
              onClick={() => setMenuOpen((prev) => !prev)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                menuOpen || hasCustomFilterOrSort
                  ? 'border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--surface)]/75 text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)]'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <span className="max-w-[104px] truncate">{triggerLabel}</span>
              {hasCustomFilterOrSort && (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                />
              )}
              <ChevronDown
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${
                  menuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {menuOpen && (
              <div
                id={popoverId}
                role="menu"
                data-testid="workspace-display-popover"
                className="animate-tab-enter absolute end-0 top-full z-40 mt-1.5 w-60 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-2.5 shadow-2xl space-y-2.5"
              >
                {!isCompletedView && (
                  <div
                    role="tablist"
                    aria-label={t.filterAll}
                    className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-0.5"
                  >
                    {statusOptions.map((tab) => {
                      const active = statusFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          data-testid={`status-filter-${tab.id}`}
                          aria-selected={active}
                          onClick={() => onChangeStatusFilter(tab.id)}
                          className={`rounded-md px-1.5 py-1 text-[11.5px] font-medium transition-colors truncate ${
                            active
                              ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)] font-semibold shadow-xs'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div
                  className={`space-y-0.5 ${!isCompletedView ? 'border-t border-[var(--border)]/70 pt-2' : ''}`}
                >
                  {sortOptions.map((opt) => {
                    const selected = sortBy === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        data-testid={`sort-option-${opt.id}`}
                        onClick={() => {
                          onChangeSortBy(opt.id);
                          setMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs transition-colors ${
                          selected
                            ? 'bg-[var(--surface-subtle)] font-medium text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]/60 hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {completedCountInView > 0 && (
                  <div className="border-t border-[var(--border)]/70 pt-2">
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="toolbar-clear-completed-btn"
                      onClick={() => {
                        setMenuOpen(false);
                        onClearCompleted();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {t.clearCompleted} ({completedCountInView})
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search / All-Tasks Date Range Filter Bar */}
      {showDateRangeBar && (
        <div
          data-testid="tasks-date-range-bar"
          className="animate-tab-enter flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <CalendarIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>{t.taskDateRangeFilterButton}</span>
            </span>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span>{t.trashDateFrom}</span>
              <input
                type="date"
                data-testid="tasks-date-from"
                value={searchDateFrom}
                onChange={(e) => onChangeDateFrom(e.target.value)}
                aria-label={t.trashDateFrom}
                className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 font-mono-tabular text-[11px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span>{t.trashDateTo}</span>
              <input
                type="date"
                data-testid="tasks-date-to"
                value={searchDateTo}
                onChange={(e) => onChangeDateTo(e.target.value)}
                aria-label={t.trashDateTo}
                className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 font-mono-tabular text-[11px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            {hasDateRangeFilter && (
              <button
                type="button"
                data-testid="tasks-date-clear"
                onClick={onClearDateRange}
                className="h-7 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                {t.clearDate}
              </button>
            )}
            {!searchQuery.trim() && (
              <button
                type="button"
                onClick={onCloseDateRangeBar}
                aria-label={t.closeMenu}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
});
