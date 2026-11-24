import {
  CheckCircle2,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Star,
  Sun,
  X,
} from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { ActiveView, SmartView } from '../../types';
import { BrandMark } from '../BrandMark';

interface SidebarSearchHeaderProps {
  compact: boolean;
  activeView: ActiveView;
  isSettingsOpen: boolean;
  smartCounts: Record<SmartView, number>;
  searchQuery: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onSearchChange: (value: string) => void;
  onCollapsedSearchClick: () => void;
  onSelectView: (view: ActiveView) => void;
}

export function SidebarBrandAndSearch({
  compact,
  searchQuery,
  searchInputRef,
  onToggleCollapse,
  onCloseMobile,
  onSearchChange,
  onCollapsedSearchClick,
}: Pick<
  SidebarSearchHeaderProps,
  | 'compact'
  | 'searchQuery'
  | 'searchInputRef'
  | 'onToggleCollapse'
  | 'onCloseMobile'
  | 'onSearchChange'
  | 'onCollapsedSearchClick'
>) {
  const { t } = useI18n();

  return (
    <>
      {compact ? (
        <div className="app-drag-region flex flex-col items-center gap-2 border-b border-[var(--border)] py-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t.expandSidebar}
            title={`Agendamea - ${t.expandSidebar}`}
            className="app-no-drag flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
          >
            <BrandMark className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t.expandSidebar}
            title={t.expandSidebar}
            className="app-no-drag flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="app-drag-region flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark className="h-6 w-6" />
            <span className="font-display text-[16px] font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
              Agendamea
            </span>
          </div>
          <div className="app-no-drag flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={t.collapseSidebar}
              title={t.collapseSidebar}
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label={t.closeMenu}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className={compact ? 'px-2 pt-3 pb-1' : 'px-3 pt-3 pb-1'}>
        {compact ? (
          <button
            type="button"
            onClick={onCollapsedSearchClick}
            aria-label={t.searchPlaceholder}
            title={
              searchQuery
                ? `${t.searchPlaceholder} ${searchQuery}`
                : `${t.searchPlaceholder} (Ctrl+K)`
            }
            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              searchQuery
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
        ) : (
          <div className="relative flex items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && searchQuery) {
                  e.preventDefault();
                  onSearchChange('');
                }
              }}
              aria-label={t.searchPlaceholder}
              placeholder={t.searchPlaceholder}
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-7 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t.clearSearch}
                className="absolute end-1.5 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function SidebarSmartViewsNav({
  compact,
  activeView,
  isSettingsOpen,
  smartCounts,
  onSelectView,
}: Pick<
  SidebarSearchHeaderProps,
  'compact' | 'activeView' | 'isSettingsOpen' | 'smartCounts' | 'onSelectView'
>) {
  const { t } = useI18n();
  const smartItems: Array<{
    id: SmartView;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = useMemo(
    () => [
      { id: 'all', label: t.allTasks, Icon: Inbox },
      { id: 'today', label: t.today, Icon: Sun },
      { id: 'important', label: t.important, Icon: Star },
      { id: 'completed', label: t.completed, Icon: CheckCircle2 },
    ],
    [t.allTasks, t.today, t.important, t.completed],
  );

  return (
    <nav aria-label={t.allTasks} className="space-y-0.5">
      {smartItems.map(({ id, label, Icon }) => {
        const isActive = !isSettingsOpen && activeView.type === 'smart' && activeView.id === id;
        const count = smartCounts[id];

        if (compact) {
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectView({ type: 'smart', id })}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              title={`${label} (${count})`}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${
                isActive
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
            </button>
          );
        }

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelectView({ type: 'smart', id })}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-[14px] font-medium transition-colors duration-150 ${
              isActive
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                }`}
              />
              <span className="truncate whitespace-nowrap">{label}</span>
            </span>
            <span
              className={`font-mono-tabular text-xs shrink-0 ${
                isActive ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-muted)]'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
