import {
  Accessibility,
  ArrowLeft,
  Bell,
  BookOpen,
  Compass,
  Database,
  Info,
  Keyboard,
  Menu,
  Mic,
  Palette,
  Scale,
  Search,
  Sliders,
  Trash2,
  Webhook,
  X,
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
import { type SettingsRuntimeActions, SettingsTabOutlet } from './settings/SettingsTabOutlet';
import { SETTINGS_SEARCH_INDEX } from './settings/settingsSearchIndex';

interface SettingsModalProps {
  onClose: () => void;
  initialTab?: SettingsTabId;
  onOpenMobileSidebar?: () => void;
  onOpenWelcomeGuide?: () => void;
  actions: SettingsRuntimeActions;
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
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocId | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);
  const [oneDriveStatus, setOneDriveStatus] = useState<OneDriveStatus | null>(null);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    setIsDesktopViewport(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
    setActiveLegalDoc(null);
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
      if (e.key === 'Escape') {
        if (settingsSearch) {
          setSettingsSearch('');
        } else if (activeLegalDoc) {
          setActiveLegalDoc(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, activeLegalDoc, settingsSearch]);

  // Smooth scroll & pulse highlight when jumping from Deep Settings Search
  useEffect(() => {
    if (!pendingScrollTarget) return;
    const targetId = pendingScrollTarget.id;
    let highlightTimer: number | null = null;
    const timer = window.setTimeout(() => {
      const container = contentScrollRef.current;
      const el = container?.querySelector<HTMLElement>(`[data-setting-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('ag-setting-highlight');
        void el.offsetWidth;
        el.classList.add('ag-setting-highlight');
        highlightTimer = window.setTimeout(() => {
          el.classList.remove('ag-setting-highlight');
          highlightTimer = null;
        }, 2000);
      }
      setPendingScrollTarget(null);
    }, 60);
    return () => {
      window.clearTimeout(timer);
      if (highlightTimer !== null) window.clearTimeout(highlightTimer);
    };
  }, [pendingScrollTarget]);

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

  const navItems: Array<{
    id: SettingsTabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = useMemo(
    () => [
      { id: 'appearance', label: t.settingsTabAppearance, icon: Palette },
      { id: 'accessibility', label: t.accessibilitySectionTitle, icon: Accessibility },
      { id: 'general', label: t.settingsTabGeneral, icon: Sliders },
      { id: 'shortcuts', label: t.keyboardShortcutsTitle, icon: Keyboard },
      { id: 'notifications', label: t.settingsTabNotifications, icon: Bell },
      { id: 'ai', label: t.settingsTabAi, icon: Mic },
      { id: 'data', label: t.dataAndBackupTitle, icon: Database },
      {
        id: 'trash',
        label: t.tabTrash,
        icon: Trash2,
        badge: trashCount > 0 ? trashCount : undefined,
      },
      { id: 'docs', label: t.settingsTabDocs, icon: BookOpen },
      { id: 'webhooks', label: t.settingsTabWebhooks, icon: Webhook },
      { id: 'legal', label: t.settingsTabLegal, icon: Scale },
      {
        id: 'about',
        label: t.settingsTabAbout,
        icon: Info,
        badge: hasAppUpdate ? 1 : undefined,
      },
    ],
    [
      t.settingsTabAppearance,
      t.accessibilitySectionTitle,
      t.settingsTabGeneral,
      t.keyboardShortcutsTitle,
      t.settingsTabNotifications,
      t.settingsTabAi,
      t.dataAndBackupTitle,
      t.tabTrash,
      t.settingsTabDocs,
      t.settingsTabWebhooks,
      t.settingsTabLegal,
      t.settingsTabAbout,
      trashCount,
      hasAppUpdate,
    ],
  );

  const tabLabelById = useMemo(
    () => new Map(navItems.map((item) => [item.id, item.label])),
    [navItems],
  );

  const searchResults = useMemo(() => {
    const q = settingsSearch.trim();
    if (!q) return [];
    return SETTINGS_SEARCH_INDEX.filter((entry) => {
      const label = String(t[entry.labelKey] ?? '');
      const tabName = tabLabelById.get(entry.tab) ?? '';
      return (
        matchesLocaleQuery(label, q) ||
        matchesLocaleQuery(tabName, q) ||
        matchesLocaleQuery(entry.keywords, q)
      );
    }).slice(0, 8);
  }, [settingsSearch, t, tabLabelById]);

  const handleSelectSearchResult = (tab: SettingsTabId, settingId: string) => {
    setActiveTab(tab);
    setActiveLegalDoc(null);
    setSettingsSearch('');
    setPendingScrollTarget({ id: settingId, seq: Date.now() });
  };

  const handleTabListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
        setActiveTab(target.id);
        setActiveLegalDoc(null);
        tabButtonRefs.current[target.id]?.focus();
      }
    }
  };

  const activeNavMeta = navItems.find((item) => item.id === activeTab) ?? navItems[0];

  return (
    <section
      aria-label={t.settings}
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]"
    >
      {/* Top Integrated Page Header (Draggable on Electron) */}
      <header className="app-drag-region flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--canvas)] px-4 sm:px-8 py-4 pe-32 sm:pe-36">
        <div className="app-no-drag flex items-center gap-3 min-w-0">
          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              aria-label={t.openMenu}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] md:hidden hover:bg-[var(--surface-hover)] shrink-0"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={activeLegalDoc ? () => setActiveLegalDoc(null) : onClose}
            aria-label={activeLegalDoc ? t.backToSettingsButton : t.settingsBackToTasks}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            <span className="hidden sm:inline">
              {activeLegalDoc ? t.backToSettingsButton : t.settingsBackToTasks}
            </span>
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-[var(--text-primary)] truncate">
              {t.settings}
            </h1>
          </div>
        </div>
      </header>

      {/* Main Split Body: Left Settings Navigation Rail + Right Spacious Content */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Sub-navigation Rail */}
        <nav
          aria-label={t.settings}
          className="shrink-0 border-b lg:border-b-0 lg:border-e border-[var(--border)] bg-[var(--canvas)] px-4 sm:px-6 lg:px-4 py-3 lg:py-6 lg:w-64 overflow-x-auto lg:overflow-y-auto"
        >
          {/* Deep Settings Search Input */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              data-testid="settings-deep-search-input"
              value={settingsSearch}
              onChange={(e) => setSettingsSearch(e.target.value)}
              placeholder={t.settingsSearchPlaceholder}
              aria-label={t.settingsSearchPlaceholder}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
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

          {settingsSearch.trim().length > 0 ? (
            <div
              data-testid="settings-search-results"
              className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5"
            >
              {searchResults.length === 0 ? (
                <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                  {t.settingsSearchNoResults}
                </p>
              ) : (
                searchResults.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    data-testid={`settings-search-hit-${entry.id}`}
                    onClick={() => handleSelectSearchResult(entry.tab, entry.settingId)}
                    className="flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-start hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {String(t[entry.labelKey] ?? '')}
                    </span>
                    <span className="text-[10.5px] text-[var(--text-muted)]">
                      {tabLabelById.get(entry.tab)}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <div
                role="tablist"
                aria-orientation={isDesktopViewport ? 'vertical' : 'horizontal'}
                onKeyDown={handleTabListKeyDown}
                className="flex lg:flex-col gap-1"
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id && !activeLegalDoc;
                  return (
                    <button
                      key={item.id}
                      ref={(el) => {
                        tabButtonRefs.current[item.id] = el;
                      }}
                      type="button"
                      role="tab"
                      id={`settings-tab-${item.id}`}
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      data-testid={
                        isDesktopViewport
                          ? `settings-tab-${item.id}`
                          : `settings-compact-tab-${item.id}`
                      }
                      onClick={() => {
                        setActiveTab(item.id);
                        setActiveLegalDoc(null);
                      }}
                      className={`flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors whitespace-nowrap shrink-0 lg:w-full ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge !== undefined && (
                        <span className="font-mono-tabular rounded-full bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {onOpenWelcomeGuide && (
                <div className="hidden lg:block mt-6 pt-4 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={onOpenWelcomeGuide}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Compass className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.welcomeReplayButton}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Scrollable Content Pane */}
        <div
          ref={contentScrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 lg:px-10 py-6 sm:py-8"
        >
          <div className="mx-auto w-full max-w-3xl">
            {activeLegalDoc ? (
              <LegalDocumentView docId={activeLegalDoc} onBack={() => setActiveLegalDoc(null)} />
            ) : (
              <div
                role="tabpanel"
                aria-labelledby={`settings-tab-${activeTab}`}
                className="space-y-6"
              >
                <div className="border-b border-[var(--border)] pb-4">
                  <h2 className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)]">
                    {activeNavMeta?.label}
                  </h2>
                </div>

                <SettingsTabOutlet
                  activeTab={activeTab}
                  oneDriveStatus={oneDriveStatus}
                  onOneDriveStatusChange={setOneDriveStatus}
                  isImporting={isImporting}
                  onImportingChange={setIsImporting}
                  pendingImport={pendingImport}
                  onPendingImportChange={setPendingImport}
                  formatTimestamp={formatTimestamp}
                  onOpenLegalDoc={(doc) => {
                    setActiveTab('legal');
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
