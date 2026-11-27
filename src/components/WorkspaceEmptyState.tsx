import { CheckCheck } from 'lucide-react';
import React from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { ActiveView } from '../types';

interface WorkspaceEmptyStateProps {
  activeView: ActiveView;
  hasActiveSearchOrFilter: boolean;
  isCompletedView: boolean;
  onClearSearchAndFilters: () => void;
  onFocusQuickAdd: () => void;
}

export const WorkspaceEmptyState = React.memo(function WorkspaceEmptyState({
  activeView,
  hasActiveSearchOrFilter,
  isCompletedView,
  onClearSearchAndFilters,
  onFocusQuickAdd,
}: WorkspaceEmptyStateProps) {
  const { t } = useI18n();

  return (
    <div
      key={`empty-${activeView.type}-${activeView.id}`}
      className="animate-tab-enter flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center"
    >
      <div
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        <CheckCheck className="h-5 w-5" />
      </div>
      <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
        {hasActiveSearchOrFilter
          ? t.emptySearchTitle
          : isCompletedView
            ? t.emptyCompletedTitle
            : t.emptyListTitle}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        {hasActiveSearchOrFilter
          ? t.emptySearchDesc
          : isCompletedView
            ? t.emptyCompletedDesc
            : t.emptyListDesc}
      </p>
      {hasActiveSearchOrFilter ? (
        <button
          type="button"
          onClick={onClearSearchAndFilters}
          className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow transition-colors"
        >
          {t.clearSearch}
        </button>
      ) : !isCompletedView ? (
        <button
          type="button"
          onClick={onFocusQuickAdd}
          className="mt-4 rounded-lg px-4 py-2 text-xs font-medium transition-opacity"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {t.addFirstTaskButton}
        </button>
      ) : null}
    </div>
  );
});
