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
  onOpenCommandPalette: () => void;
  onSelectView: (view: ActiveView) => void;
  onSmartViewContextMenu?: (e: React.MouseEvent, id: SmartView) => void;
}

export function SidebarBrandAndSearch({
  compact,
  searchQuery,
  searchInputRef,
  onToggleCollapse,
  onCloseMobile,
  onSearchChange,
  onOpenCommandPalette,
}: Pick<
  SidebarSearchHeaderProps,
  | 'compact'
  | 'searchQuery'
  | 'searchInputRef'
  | 'onToggleCollapse'
  | 'onCloseMobile'
  | 'onSearchChange'
  | 'onOpenCommandPalette'
>) {
  const { t } = useI18n();

  return (
    <>
      {compact ? (
        <div className="app-drag-region flex h-14 shrink-0 items-center justify-center border-b border-[var(--border)]">
          <button
            type="button"
            data-testid="sidebar-minimal-logo-toggle"
            onClick={onToggleCollapse}
            aria-label={t.expandSidebar}
            title={`Agendamea - ${t.expandSidebar}`}
            className="app-no-drag group relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-primary)] ag-hover-glow"
          >
            <span className="flex items-center justify-center transition-all duration-180 group-hover:opacity-0 group-hover:scale-75 group-focus-visible:opacity-0 group-focus-visible:scale-75">
              <BrandMark className="h-6 w-6" />
            </span>
            <PanelLeftOpen
              aria-hidden="true"
              className="pointer-events-none absolute h-[18px] w-[18px] text-[var(--text-primary)] opacity-0 scale-75 transition-all duration-180 group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:scale-100"
            />
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
              data-testid="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={t.collapseSidebar}
              title={t.collapseSidebar}
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] ag-hover-glow"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label={t.closeMenu}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] ag-hover-glow md:hidden"
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
            data-testid="sidebar-search-trigger"
            onClick={onOpenCommandPalette}
            aria-label={t.cmdPaletteTriggerLabel}
            title={`${t.cmdPaletteTriggerLabel} (Ctrl+K)`}
            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ag-hover-glow ${
              searchQuery ? 'ag-minimal-active' : 'text-[var(--text-muted)]'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
        ) : (
          <div className="relative flex items-center">
            <button
              type="button"
              data-testid="sidebar-search-trigger"
              onClick={onOpenCommandPalette}
              aria-label={t.cmdPaletteTriggerLabel}
              title={`${t.cmdPaletteTriggerLabel} (Ctrl+K)`}
              className="absolute start-1.5 flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] ag-hover-glow"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
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
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-14 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t.clearSearch}
                className="absolute end-1.5 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] ag-hover-glow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="sidebar-cmdk-badge"
                onClick={onOpenCommandPalette}
                aria-label={t.cmdPaletteAriaLabel}
                title={`${t.cmdPaletteTriggerLabel} (Ctrl+K)`}
                className="absolute end-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[var(--text-muted)] ag-hover-card-glow"
              >
                Ctrl+K
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
  onSmartViewContextMenu,
}: Pick<
  SidebarSearchHeaderProps,
  | 'compact'
  | 'activeView'
  | 'isSettingsOpen'
  | 'smartCounts'
  | 'onSelectView'
  | 'onSmartViewContextMenu'
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
              data-testid={`sidebar-smart-${id}`}
              onClick={() => onSelectView({ type: 'smart', id })}
              onContextMenu={(e) => {
                if (!onSmartViewContextMenu) return;
                e.preventDefault();
                e.stopPropagation();
                onSmartViewContextMenu(e, id);
              }}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              title={`${label} (${count})`}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ag-hover-glow ${
                isActive ? 'ag-minimal-active' : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
            </button>
          );
        }

        return (
          <button
            key={id}
            type="button"
            data-testid={`sidebar-smart-${id}`}
            onClick={() => onSelectView({ type: 'smart', id })}
            onContextMenu={(e) => {
              if (!onSmartViewContextMenu) return;
              e.preventDefault();
              e.stopPropagation();
              onSmartViewContextMenu(e, id);
            }}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-[14px] font-medium transition-colors duration-150 ${
              isActive
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]'
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
