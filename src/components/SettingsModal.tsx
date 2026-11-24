import {
  ArrowLeft,
  Bell,
  BookOpen,
  Cloud,
  Keyboard,
  Menu,
  Mic,
  Palette,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import type { LegalDocId } from '../i18n/translations';
import { useUpdaterSelector } from '../store/updaterStore';
import { useWorkspaceSnapshotSelector } from '../store/workspaceSnapshotStore';
import type { OneDriveStatus, SettingsTabId } from '../types';
import { getCachedDateTimeFormatter } from '../utils/intlCache';
import { matchesLocaleQuery } from '../utils/todoLogic';
import { LegalDocumentView } from './LegalDocumentView';
import type { PendingImportState } from './settings/DataBackupSettingsTab';
import {
  type SettingsNavigationSignal,
  type SettingsRuntimeActions,
  SettingsTabOutlet,
} from './settings/SettingsTabOutlet';
import { SETTINGS_SEARCH_INDEX, type SettingsSearchEntry } from './settings/settingsSearchIndex';

interface SettingsModalProps {
  onClose: () => void;
  initialTab?: SettingsTabId;
  onOpenMobileSidebar?: () => void;
  onOpenWelcomeGuide?: () => void;
  actions: SettingsRuntimeActions;
}

interface NavItemDef {
  id: SettingsTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  hasDot?: boolean;
}

interface CanonicalTabTarget {
  tab: SettingsTabId;
  subTab?: string;
  scrollTarget?: string;
  expandSectionId?: string;
}

export function resolveCanonicalSettingsTab(tab: SettingsTabId): CanonicalTabTarget {
  if (tab === 'webhooks') {
    return { tab: 'docs', subTab: 'webhooks', scrollTarget: 'webhooks-main' };
  }
  if (tab === 'legal') {
    return { tab: 'about', subTab: 'about', scrollTarget: 'about-legal' };
  }
  return { tab };
}

export function SettingsModal({
  onClose,
  initialTab = 'appearance',
  onOpenMobileSidebar,
  onOpenWelcomeGuide,
  actions,
}: SettingsModalProps) {
  const { t, meta } = useI18n();
  const trashCount = useWorkspaceSnapshotSelector(
    (s) => s.trashedTodos.length + s.trashedCategories.length,
    Object.is,
  );
  const hasAppUpdate = useUpdaterSelector(
    (s) => s.updateState.status === 'available' || s.updateState.status === 'downloaded',
    Object.is,
  );

  const navSeqRef = useRef(1);
  const initialCanonical = resolveCanonicalSettingsTab(initialTab);

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialCanonical.tab);
  const [navSignal, setNavSignal] = useState<SettingsNavigationSignal | null>(() =>
    initialCanonical.subTab || initialCanonical.expandSectionId
      ? {
          subTab: initialCanonical.subTab,
          expandSectionId: initialCanonical.expandSectionId,
          seq: 1,
        }
      : null,
  );
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocId | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);
  const [oneDriveStatus, setOneDriveStatus] = useState<OneDriveStatus | null>(null);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{
    id: string;
    seq: number;
  } | null>(() =>
    initialCanonical.scrollTarget ? { id: initialCanonical.scrollTarget, seq: 1 } : null,
  );
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    setIsDesktopViewport(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  // Keep modal synchronized both on mount and whenever initialTab changes while already open
  useEffect(() => {
    const resolved = resolveCanonicalSettingsTab(initialTab);
    navSeqRef.current += 1;
    const seq = navSeqRef.current;
    setActiveTab(resolved.tab);
    setActiveLegalDoc(null);
    if (resolved.subTab || resolved.expandSectionId) {
      setNavSignal({
        subTab: resolved.subTab,
        expandSectionId: resolved.expandSectionId,
        seq,
      });
    } else {
      setNavSignal(null);
    }
    if (resolved.scrollTarget) {
      setPendingScrollTarget({ id: resolved.scrollTarget, seq });
    } else {
      setPendingScrollTarget(null);
    }
  }, [initialTab]);

  useEffect(() => {
    if (activeTab !== 'data' && activeTab !== 'about') return;
    let active = true;
    void api
      .getOneDriveStatus()
      .then((status) => {
        if (active) setOneDriveStatus(status);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      active = false;
    };
  }, [activeTab]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === 'Escape') {
        if (isImporting) return;
        if (settingsSearch) {
          setSettingsSearch('');
        } else if (activeLegalDoc) {
          setActiveLegalDoc(null);
        } else if (pendingImport) {
          setPendingImport(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, activeLegalDoc, pendingImport, isImporting, settingsSearch]);

  // Smooth scroll & pulse highlight when jumping from Deep Settings Search or alias route
  useEffect(() => {
    if (!pendingScrollTarget) return;
    const targetId = pendingScrollTarget.id;
    let highlightTimer: number | null = null;
    let retryTimer: number | null = null;
    let rafId: number | null = null;

    const tryFocusTarget = (): boolean => {
      const container = contentScrollRef.current;
      const el = container?.querySelector<HTMLElement>(`[data-setting-id="${targetId}"]`);
      if (!el) return false;
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      el.classList.remove('ag-setting-highlight');
      void el.offsetWidth;
      el.classList.add('ag-setting-highlight');
      highlightTimer = window.setTimeout(() => {
        el.classList.remove('ag-setting-highlight');
        highlightTimer = null;
      }, 2000);
      return true;
    };

    const timer = window.setTimeout(() => {
      if (tryFocusTarget()) {
        setPendingScrollTarget(null);
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        retryTimer = window.setTimeout(() => {
          tryFocusTarget();
          setPendingScrollTarget(null);
        }, 100);
      });
    }, 60);

    return () => {
      window.clearTimeout(timer);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (highlightTimer !== null) window.clearTimeout(highlightTimer);
    };
  }, [pendingScrollTarget]);

  const handleSelectTab = useCallback((nextTab: SettingsTabId) => {
    const resolved = resolveCanonicalSettingsTab(nextTab);
    setActiveTab(resolved.tab);
    setActiveLegalDoc(null);
    if (resolved.subTab || resolved.expandSectionId) {
      navSeqRef.current += 1;
      setNavSignal({
        subTab: resolved.subTab,
        expandSectionId: resolved.expandSectionId,
        seq: navSeqRef.current,
      });
    } else {
      setNavSignal(null);
    }
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, []);

  const safeClose = useCallback(() => {
    if (isImporting) return;
    onClose();
  }, [isImporting, onClose]);

  const formatTimestamp = useCallback(
    (iso: string | null) => {
      if (!iso) return '';
      try {
        return getCachedDateTimeFormatter(meta.intlLocale, 'settings-timestamp', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(iso));
      } catch {
        return iso;
      }
    },
    [meta.intlLocale],
  );

  const navGroups = useMemo<Array<{ groupTitle: string; items: NavItemDef[] }>>(
    () => [
      {
        groupTitle: t.settingsNavGroupPersonalization,
        items: [
          { id: 'appearance', label: t.settingsTabAppearance, icon: Palette },
          { id: 'accessibility', label: t.accessibilitySectionTitle, icon: ZoomIn },
        ],
      },
      {
        groupTitle: t.settingsNavGroupWorkspace,
        items: [
          { id: 'general', label: t.settingsTabGeneral, icon: SlidersHorizontal },
          { id: 'notifications', label: t.settingsTabNotifications, icon: Bell },
          { id: 'shortcuts', label: t.keyboardShortcutsTitle, icon: Keyboard },
          { id: 'ai', label: t.settingsTabAi, icon: Mic },
          { id: 'data', label: t.dataAndBackupTitle, icon: Cloud },
          {
            id: 'trash',
            label: t.tabTrash,
            icon: Trash2,
            badge: trashCount > 0 ? trashCount : undefined,
          },
        ],
      },
      {
        groupTitle: t.settingsNavGroupSystem,
        items: [
          { id: 'docs', label: t.settingsTabAutomation, icon: BookOpen },
          {
            id: 'about',
            label: t.settingsTabAbout,
            icon: Shield,
            hasDot: hasAppUpdate,
          },
        ],
      },
    ],
    [
      t.settingsNavGroupPersonalization,
      t.settingsTabAppearance,
      t.accessibilitySectionTitle,
      t.settingsNavGroupWorkspace,
      t.settingsTabGeneral,
      t.settingsTabNotifications,
      t.keyboardShortcutsTitle,
      t.settingsTabAi,
      t.dataAndBackupTitle,
      t.tabTrash,
      t.settingsNavGroupSystem,
      t.settingsTabAutomation,
      t.settingsTabAbout,
      trashCount,
      hasAppUpdate,
    ],
  );

  const navItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);

  const tabLabelById = useMemo(
    () => new Map(navItems.map((item) => [item.id, item.label])),
    [navItems],
  );

  const searchResults = useMemo(() => {
    const q = settingsSearch.trim();
    if (!q) return [];
    return SETTINGS_SEARCH_INDEX.filter((entry) => {
      const label = String(t[entry.labelKey] ?? '');
      const canonicalTab = resolveCanonicalSettingsTab(entry.tab).tab;
      const tabName = tabLabelById.get(canonicalTab) ?? '';
      if (
        matchesLocaleQuery(label, q) ||
        matchesLocaleQuery(tabName, q) ||
        matchesLocaleQuery(entry.keywords, q)
      ) {
        return true;
      }
      if (entry.descKeys) {
        return entry.descKeys.some((dk) => matchesLocaleQuery(String(t[dk] ?? ''), q));
      }
      return false;
    }).slice(0, 8);
  }, [settingsSearch, t, tabLabelById]);

  const handleSelectSearchResult = (entry: SettingsSearchEntry) => {
    const resolved = resolveCanonicalSettingsTab(entry.tab);
    navSeqRef.current += 1;
    const seq = navSeqRef.current;
    setActiveTab(resolved.tab);
    setActiveLegalDoc(null);
    setSettingsSearch('');
    const subTab = entry.subTab ?? resolved.subTab;
    const expandSectionId = entry.expandSectionId ?? resolved.expandSectionId;
    if (subTab || expandSectionId) {
      setNavSignal({ subTab, expandSectionId, seq });
    } else {
      setNavSignal(null);
    }
    setPendingScrollTarget({ id: entry.settingId, seq });
  };

  const handleTabListKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const idx = navItems.findIndex((item) => item.id === activeTab);
    if (idx < 0) return;
    let nextIdx = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % navItems.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + navItems.length) % navItems.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = navItems.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      const target = navItems[nextIdx];
      if (target) {
        handleSelectTab(target.id);
        tabButtonRefs.current[target.id]?.focus();
      }
    }
  };

  const activeNavMeta = navItems.find((item) => item.id === activeTab) ?? navItems[0];
  const ActiveTabIcon = activeNavMeta?.icon ?? Palette;

  const renderSearchBox = () => (
    <div className="relative">
      <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        ref={searchInputRef}
        type="text"
        data-testid="settings-deep-search-input"
        value={settingsSearch}
        onChange={(e) => setSettingsSearch(e.target.value)}
        placeholder={t.settingsSearchPlaceholder}
        aria-label={t.settingsSearchPlaceholder}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] py-1.5 ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
      />
      {settingsSearch && (
        <button
          type="button"
          onClick={() => setSettingsSearch('')}
          aria-label={t.clearSearch}
          className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  const renderSearchResults = () => (
    <div
      data-testid="settings-search-results"
      className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-1.5"
    >
      {searchResults.length === 0 ? (
        <p className="px-2 py-2 text-xs text-[var(--text-muted)]">{t.settingsSearchNoResults}</p>
      ) : (
        searchResults.map((entry) => {
          const canonicalTab = resolveCanonicalSettingsTab(entry.tab).tab;
          return (
            <button
              key={entry.id}
              type="button"
              data-testid={`settings-search-hit-${entry.id}`}
              onClick={() => handleSelectSearchResult(entry)}
              className="flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-start hover:bg-[var(--surface-hover)] transition-colors"
            >
              <span className="text-xs font-medium text-[var(--text-primary)]">
                {String(t[entry.labelKey] ?? '')}
              </span>
              <span className="text-[10.5px] text-[var(--text-muted)]">
                {tabLabelById.get(canonicalTab)}
              </span>
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <section
      data-testid="settings-page"
      aria-labelledby="settings-page-title"
      className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row bg-[var(--canvas)] overflow-hidden"
    >
      {isDesktopViewport ? (
        /* Left Split Navigation Rail (Desktop >= 1024px) */
        <aside
          aria-label={t.settings}
          className="flex w-[244px] shrink-0 flex-col border-e border-[var(--border)] bg-[var(--surface)] select-none"
        >
          <div className="app-drag-region flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-4">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Settings className="h-3.5 w-3.5" />
            </div>
            <h1
              id="settings-page-title"
              className="font-display text-[14.5px] font-bold tracking-tight text-[var(--text-primary)] truncate"
            >
              {t.settings}
            </h1>
          </div>

          <div className="px-3 pt-3 pb-1">{renderSearchBox()}</div>

          {settingsSearch.trim().length > 0 ? (
            <div className="flex-1 overflow-y-auto px-3 py-2">{renderSearchResults()}</div>
          ) : (
            <nav aria-label={t.settings} className="flex-1 overflow-y-auto px-3 py-2.5">
              <div
                role="tablist"
                aria-orientation="vertical"
                aria-label={t.settings}
                onKeyDown={handleTabListKeyDown}
                className="space-y-3.5"
              >
                {navGroups.map((group, groupIdx) => (
                  <div key={group.groupTitle} className="space-y-0.5">
                    <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      {group.groupTitle}
                    </p>
                    {group.items.map(({ id, label, icon: Icon, badge, hasDot }) => {
                      const active = activeTab === id && !activeLegalDoc;
                      return (
                        <button
                          key={id}
                          ref={(el) => {
                            tabButtonRefs.current[id] = el;
                          }}
                          type="button"
                          role="tab"
                          id={`settings-tab-${id}`}
                          aria-controls={`settings-tabpanel-${id}`}
                          data-testid={`settings-tab-${id}`}
                          aria-selected={active}
                          tabIndex={active ? 0 : -1}
                          onClick={() => handleSelectTab(id)}
                          className={`group flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-[7px] text-start text-[13px] transition-colors ${
                            active
                              ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                              : 'font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                active
                                  ? 'text-[var(--accent)]'
                                  : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                              }`}
                            />
                            <span className="truncate">{label}</span>
                          </span>
                          {badge !== undefined && (
                            <span
                              className={`rounded-md px-1.5 py-0.5 font-mono-tabular text-[11px] shrink-0 ${
                                active
                                  ? 'bg-[var(--surface)] text-[var(--accent)] font-semibold'
                                  : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                              }`}
                            >
                              {badge}
                            </span>
                          )}
                          {hasDot && (
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: 'var(--accent)' }}
                            />
                          )}
                        </button>
                      );
                    })}

                    {groupIdx === navGroups.length - 1 && onOpenWelcomeGuide && (
                      <button
                        type="button"
                        data-testid="settings-sidebar-welcome-guide"
                        onClick={onOpenWelcomeGuide}
                        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-start text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <Sparkles className="h-4 w-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                        <span className="truncate">{t.welcomeReplayButton}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </nav>
          )}

          {/* Back to All Tasks (Pinned bottom of Settings rail) */}
          <div className="border-t border-[var(--border)] px-3 py-2.5">
            <button
              type="button"
              data-testid="settings-back-button"
              disabled={isImporting}
              onClick={safeClose}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] rtl:rotate-180 transition-colors" />
              <span className="truncate">{t.settingsBackToTasks}</span>
            </button>
          </div>
        </aside>
      ) : (
        /* Compact / Responsive Top Bar + Horizontal Pill Tabs (< 1024px) */
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] select-none">
          <div className="app-drag-region flex items-center justify-between gap-2 ps-4 pe-32 pt-3 pb-2">
            <div className="app-no-drag flex items-center gap-2 min-w-0">
              {onOpenMobileSidebar && (
                <button
                  type="button"
                  onClick={onOpenMobileSidebar}
                  aria-label={t.openMenu}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:hidden shrink-0"
                >
                  <Menu className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                data-testid="settings-back-button-compact"
                disabled={isImporting}
                onClick={safeClose}
                aria-label={t.settingsBackToTasks}
                title={t.settingsBackToTasks}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 shrink-0 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </button>
              <h1
                id="settings-page-title"
                className="font-display text-sm font-bold tracking-tight text-[var(--text-primary)] truncate"
              >
                {t.settings}
              </h1>
            </div>
          </div>

          <div className="px-4 pb-2.5">{renderSearchBox()}</div>

          {settingsSearch.trim().length > 0 ? (
            <div className="px-4 pb-3">{renderSearchResults()}</div>
          ) : (
            <div
              role="tablist"
              aria-orientation="horizontal"
              aria-label={t.settings}
              onKeyDown={handleTabListKeyDown}
              className="flex flex-wrap items-center gap-1.5 px-4 pb-3"
            >
              {navItems.map(({ id, label, icon: Icon, badge, hasDot }) => {
                const active = activeTab === id && !activeLegalDoc;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      tabButtonRefs.current[id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`settings-tab-${id}`}
                    aria-controls={`settings-tabpanel-${id}`}
                    data-testid={`settings-compact-tab-${id}`}
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => handleSelectTab(id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                        : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}
                    />
                    <span>{label}</span>
                    {badge !== undefined && (
                      <span className="font-mono-tabular text-[10.5px] opacity-80">{badge}</span>
                    )}
                    {hasDot && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Right Spacious Content Pane */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
        {/* Unified Single-Row Top Bar (aligned with Left Sidebar & Settings Rail h-14) */}
        <header className="app-drag-region hidden lg:flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--canvas)] px-7 pe-36 select-none">
          <div className="app-no-drag flex items-center gap-2.5 min-w-0">
            {activeLegalDoc ? (
              <button
                type="button"
                onClick={() => setActiveLegalDoc(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                <span>{t.backToSettingsButton}</span>
              </button>
            ) : (
              <>
                <ActiveTabIcon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <h2 className="font-display text-[14.5px] font-bold tracking-tight text-[var(--text-primary)] truncate">
                  {activeNavMeta?.label}
                </h2>
                <span className="hidden xl:inline text-xs text-[var(--text-muted)] truncate">
                  · {t.instantSaveBadge}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Scrollable Tab Content */}
        <div
          ref={contentScrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6 sm:py-7"
        >
          <div className="mx-auto w-full max-w-[680px]">
            {activeLegalDoc ? (
              <LegalDocumentView docId={activeLegalDoc} onBack={() => setActiveLegalDoc(null)} />
            ) : (
              <div
                role="tabpanel"
                id={`settings-tabpanel-${activeTab}`}
                aria-labelledby={`settings-tab-${activeTab}`}
              >
                <SettingsTabOutlet
                  activeTab={activeTab}
                  navSignal={navSignal}
                  oneDriveStatus={oneDriveStatus}
                  onOneDriveStatusChange={setOneDriveStatus}
                  isImporting={isImporting}
                  onImportingChange={setIsImporting}
                  pendingImport={pendingImport}
                  onPendingImportChange={setPendingImport}
                  formatTimestamp={formatTimestamp}
                  onOpenLegalDoc={(doc) => {
                    setActiveTab('about');
                    setActiveLegalDoc(doc);
                  }}
                  actions={actions}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
