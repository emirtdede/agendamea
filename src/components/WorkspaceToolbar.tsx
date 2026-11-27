import {
  Calendar as CalendarIcon,
  Columns3,
  Grid2x2,
  Hash,
  List,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import React from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { LayoutMode, SortOption, StatusFilter } from '../types';
import { SelectField } from './SelectField';

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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {!isCompletedView && (
            <div
              role="tablist"
              aria-label={t.filterAll}
              className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
            >
              {(
                [
                  { id: 'all', label: t.filterAll },
                  { id: 'active', label: t.filterActive },
                  { id: 'completed', label: t.filterCompleted },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onChangeStatusFilter(tab.id)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 4-Way Layout Switcher (List | Kanban | Calendar | Matrix) */}
          <div
            role="tablist"
            aria-label={t.viewList}
            data-testid="layout-mode-switcher"
            className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
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
                  data-testid={`layout-tab-${id}`}
                  aria-selected={active}
                  onClick={() => onChangeLayoutMode(id)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {tagFilter && (
            <button
              type="button"
              onClick={onClearTagFilter}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors"
            >
              <Hash className="h-3 w-3 text-[var(--accent)]" />
              <span>{tagFilter}</span>
              <X className="h-3 w-3 text-[var(--text-muted)]" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ms-auto">
          {completedCountInView > 0 && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap"
            >
              {t.clearCompleted}
            </button>
          )}

          <button
            type="button"
            data-testid="tasks-date-range-toggle"
            aria-pressed={showDateRangeBar}
            onClick={onToggleDateFilter}
            title={t.taskDateRangeFilterButton}
            className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              hasDateRangeFilter || isDateFilterOpen
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)]'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span className="hidden sm:inline">{t.taskDateRangeFilterButton}</span>
          </button>

          <div className="relative inline-flex items-center">
            <SlidersHorizontal
              aria-hidden="true"
              className="pointer-events-none absolute start-2.5 z-10 h-3.5 w-3.5 text-[var(--text-muted)]"
            />
            <SelectField
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as SortOption)}
              aria-label={t.sortCustom}
              selectClassName="h-[30px] bg-[var(--surface)] ps-8 pe-8 font-medium ag-hover-glow cursor-pointer"
            >
              <option value="manual">{t.sortCustom}</option>
              <option value="priority">{t.sortPriority}</option>
              <option value="dueDate">{t.sortDueDate}</option>
              <option value="newest">{t.sortNewest}</option>
            </SelectField>
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
