import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Cloud,
  Menu,
  Palette,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import type { LegalDocId } from '../i18n/translations';
import type {
  AppIconId,
  BootstrapPayload,
  Category,
  CloseBehavior,
  OneDriveStatus,
  SettingsTabId,
  ThemeId,
  ThemeMode,
  Todo,
} from '../types';
import { DocsSettingsSection } from './DocsSettingsSection';
import { LegalDocumentView } from './LegalDocumentView';
import type { AppUpdateState } from './UpdateSettingsSection';
import { AboutLegalSettingsTab } from './settings/AboutLegalSettingsTab';
import { AccessibilitySettingsTab } from './settings/AccessibilitySettingsTab';
import { AppearanceSettingsTab } from './settings/AppearanceSettingsTab';
import {
  DataBackupSettingsTab,
  type PendingImportState,
} from './settings/DataBackupSettingsTab';
import { GeneralSettingsTab } from './settings/GeneralSettingsTab';
import { TrashSettingsTab } from './settings/TrashSettingsTab';

interface SettingsModalProps {
  onClose: () => void;
  initialTab?: SettingsTabId;
  onOpenMobileSidebar?: () => void;
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  appIconId: AppIconId;
  customIconColor: string;
  zoomPercent: number;
  highContrast: boolean;
  reducedMotion: boolean;
  closeBehavior: CloseBehavior;
  launchAtStartup?: boolean;
  globalQuickAddShortcut?: boolean;
  dragLocked: boolean;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeTheme: (id: ThemeId) => void;
  onChangeCustomThemeColor: (hex: string) => void;
  onChangeAppIcon: (id: AppIconId) => void;
  onChangeCustomIconColor: (hex: string) => void;
  onChangeZoomPercent: (zoom: number) => void;
  onToggleHighContrast: (enabled: boolean) => void;
  onToggleReducedMotion: (enabled: boolean) => void;
  onChangeCloseBehavior: (behavior: CloseBehavior) => void;
  onToggleLaunchAtStartup?: (enabled: boolean) => void;
  onToggleGlobalQuickAddShortcut?: (enabled: boolean) => void;
  onToggleDragLock: (locked: boolean) => void;
  autoUpdateCheck: boolean;
  onToggleAutoUpdateCheck: (enabled: boolean) => void;
  updateState: AppUpdateState;
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onQuitAndInstallUpdate?: () => Promise<void>;
  totalTodoCount: number;
  completedTodoCount: number;
  onClearAllCompleted: () => Promise<void>;
  onImportBackup: (payload: unknown) => Promise<void>;
  onApplyRestoredBootstrap?: (restored: BootstrapPayload) => void;
  onResetAllData?: (resetSettings: boolean) => Promise<void>;
  trashedCategories: Category[];
  trashedTodos: Todo[];
  onRestoreTodo: (id: string) => Promise<void>;
  onPermanentDeleteTodo: (id: string) => Promise<void>;
  onRestoreCategory: (id: string) => Promise<void>;
  onPermanentDeleteCategory: (id: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  onOpenWelcomeGuide?: () => void;
  webhookEnabled?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  onSaveWebhook?: (patch: {
    webhookEnabled: boolean;
    webhookUrl: string;
    webhookSecret: string;
  }) => Promise<void>;
}

function formatTimestampForLocale(iso: string | null, intlLocale: string): string {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat(intlLocale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return '';
  }
}

export function SettingsModal({
  onClose,
  initialTab = 'appearance',
  onOpenMobileSidebar,
  themeMode,
  themeId,
  customThemeColor,
  appIconId,
  customIconColor,
  zoomPercent,
  highContrast,
  reducedMotion,
  closeBehavior,
  launchAtStartup = false,
  globalQuickAddShortcut = true,
  dragLocked,
  onChangeMode,
  onChangeTheme,
  onChangeCustomThemeColor,
  onChangeAppIcon,
  onChangeCustomIconColor,
  onChangeZoomPercent,
  onToggleHighContrast,
  onToggleReducedMotion,
  onChangeCloseBehavior,
  onToggleLaunchAtStartup,
  onToggleGlobalQuickAddShortcut,
  onToggleDragLock,
  autoUpdateCheck,
  onToggleAutoUpdateCheck,
  updateState,
  onCheckForUpdates,
  onDownloadAndInstall,
  onQuitAndInstallUpdate,
  totalTodoCount,
  completedTodoCount,
  onClearAllCompleted,
  onImportBackup,
  onApplyRestoredBootstrap,
  onResetAllData,
  trashedCategories,
  trashedTodos,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onRestoreCategory,
  onPermanentDeleteCategory,
  onEmptyTrash,
  onOpenWelcomeGuide,
  webhookEnabled = false,
  webhookUrl = '',
  webhookSecret = '',
  onSaveWebhook,
}: SettingsModalProps) {
  const { t, meta, legalDocs } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocId | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);
  const [oneDriveStatus, setOneDriveStatus] = useState<OneDriveStatus | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let active = true;
    void api
      .getOneDriveStatus()
      .then((st) => {
        if (active) setOneDriveStatus(st);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeLegalDoc && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeLegalDoc]);

  const handleSelectTab = useCallback((nextTab: SettingsTabId) => {
    setActiveTab(nextTab);
    setActiveLegalDoc(null);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, []);

  const safeClose = useCallback(() => {
    if (isImporting) return;
    onClose();
  }, [isImporting, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (isImporting) return;
      if (activeLegalDoc) {
        setActiveLegalDoc(null);
        return;
      }
      if (pendingImport) {
        setPendingImport(null);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isImporting, activeLegalDoc, pendingImport, onClose]);

  const trashCount = trashedCategories.length + trashedTodos.length;

  const formatTimestamp = useCallback(
    (iso: string | null) => formatTimestampForLocale(iso, meta.intlLocale),
    [meta.intlLocale],
  );

  const shortcuts = useMemo(
    () => [
      { keys: 'N', label: t.shortcutNewTask },
      { keys: 'Ctrl + Alt + N', label: t.globalQuickAddTitle },
      { keys: '/ · Ctrl+K', label: t.shortcutSearch },
      { keys: 'Alt + ↑ / ↓', label: t.shortcutReorder },
      { keys: 'Esc', label: t.shortcutEscape },
    ],
    [
      t.shortcutNewTask,
      t.globalQuickAddTitle,
      t.shortcutSearch,
      t.shortcutReorder,
      t.shortcutEscape,
    ],
  );

  const navGroups = useMemo<
    Array<{
      groupTitle: string;
      items: Array<{
        id: SettingsTabId;
        label: string;
        Icon: React.ComponentType<{ className?: string }>;
        badge?: number;
        hasDot?: boolean;
      }>;
    }>
  >(
    () => [
      {
        groupTitle: t.settingsNavGroupPersonalization,
        items: [
          { id: 'appearance', label: t.settingsTabAppearance, Icon: Palette },
          { id: 'accessibility', label: t.accessibilitySectionTitle, Icon: ZoomIn },
        ],
      },
      {
        groupTitle: t.settingsNavGroupWorkspace,
        items: [
          { id: 'general', label: t.settingsTabGeneral, Icon: SlidersHorizontal },
          { id: 'data', label: t.dataAndBackupTitle, Icon: Cloud },
          {
            id: 'trash',
            label: t.tabTrash,
            Icon: Trash2,
            badge: trashCount > 0 ? trashCount : undefined,
          },
        ],
      },
      {
        groupTitle: t.settingsNavGroupSystem,
        items: [
          { id: 'docs', label: t.settingsTabDocs, Icon: BookOpen },
          {
            id: 'about',
            label: t.settingsTabAbout,
            Icon: Shield,
            hasDot: updateState.status === 'available' || updateState.status === 'downloaded',
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
      t.dataAndBackupTitle,
      t.tabTrash,
      t.settingsNavGroupSystem,
      t.settingsTabDocs,
      t.settingsTabAbout,
      trashCount,
      updateState.status,
    ],
  );

  const allNavItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const currentTabMeta = allNavItems.find((item) => item.id === activeTab) ?? allNavItems[0];
  const CurrentTabIcon = currentTabMeta.Icon;

  return (
    <section
      data-testid="settings-page"
      aria-labelledby="settings-page-title"
      className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row bg-[var(--canvas)] overflow-hidden"
    >
      {/* Left Split Navigation Rail (Desktop >= 1024px) */}
      <aside
        aria-label={t.settings}
        className="hidden lg:flex w-[224px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] select-none"
      >
        <div className="app-drag-region flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-4">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Settings className="h-3.5 w-3.5" />
          </div>
          <h2
            id="settings-page-title"
            className="font-display text-[14.5px] font-bold tracking-tight text-[var(--text-primary)] truncate"
          >
            {t.settings}
          </h2>
        </div>

        <nav
          role="tablist"
          aria-orientation="vertical"
          aria-label={t.settings}
          className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
        >
          {navGroups.map((group, groupIdx) => (
            <div key={group.groupTitle} className="space-y-1">
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {group.groupTitle}
              </p>
              {group.items.map(({ id, label, Icon, badge, hasDot }) => {
                const isSelected = activeTab === id && !activeLegalDoc;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    data-testid={`settings-tab-${id}`}
                    aria-selected={isSelected}
                    onClick={() => handleSelectTab(id)}
                    className={`group flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isSelected
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                        }`}
                      />
                      <span className="truncate">{label}</span>
                    </span>
                    {badge !== undefined && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono-tabular text-[11px] shrink-0 ${
                          isSelected
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
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                  <span className="truncate">{t.welcomeReplayButton}</span>
                </button>
              )}
            </div>
          ))}
        </nav>

        {/* Back to All Tasks (Unified sidebar nav button style) */}
        <div className="border-t border-[var(--border)] px-3 py-2.5">
          <button
            type="button"
            data-testid="settings-back-button"
            disabled={isImporting}
            onClick={safeClose}
            className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] rtl:rotate-180 transition-colors" />
            <span className="truncate">{t.settingsBackToTasks}</span>
          </button>
        </div>
      </aside>

      {/* Compact / Responsive Top Bar + Horizontal Pill Tabs (< 1024px) */}
      <div className="lg:hidden shrink-0 border-b border-[var(--border)] bg-[var(--surface)] select-none">
        <div className="app-drag-region flex items-center justify-between gap-2 pl-4 pr-32 pt-3 pb-2">
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
            <h2 className="font-display text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
              {t.settings}
            </h2>
          </div>
        </div>

        <div
          role="tablist"
          aria-label={t.settings}
          className="flex flex-wrap items-center gap-1.5 px-4 pb-3"
        >
          {allNavItems.map(({ id, label, Icon, badge, hasDot }) => {
            const isSelected = activeTab === id && !activeLegalDoc;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                data-testid={`settings-compact-tab-${id}`}
                aria-selected={isSelected}
                onClick={() => handleSelectTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                    : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span>{label}</span>
                {badge !== undefined && (
                  <span className="font-mono-tabular text-[10.5px] opacity-80">({badge})</span>
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
          {onOpenWelcomeGuide && (
            <button
              type="button"
              onClick={onOpenWelcomeGuide}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <span>{t.welcomeReplayButton}</span>
            </button>
          )}
        </div>
      </div>

      {/* Right Scrollable Settings Content Pane */}
      <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--canvas)]">
        <header className="hidden lg:flex app-drag-region h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)]/75 pl-8 pr-36 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <CurrentTabIcon className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <h1 className="font-display text-[15px] font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0">
              {activeLegalDoc ? legalDocs[activeLegalDoc].title : currentTabMeta.label}
            </h1>
            <span className="hidden xl:inline min-w-0 text-xs text-[var(--text-muted)] truncate">
              ·{' '}
              {activeLegalDoc
                ? legalDocs[activeLegalDoc].subtitle
                : activeTab === 'docs'
                  ? t.docsSubtitle
                  : t.settingsSubtitle}
            </span>
          </div>
        </header>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7"
        >
          <div
            key={activeLegalDoc ? `legal-${activeLegalDoc}` : `tab-${activeTab}`}
            className="animate-tab-enter mx-auto w-full max-w-[700px] space-y-6"
          >
            {activeLegalDoc ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
                <LegalDocumentView
                  doc={legalDocs[activeLegalDoc]}
                  backLabel={t.backToSettingsButton}
                  onBack={() => setActiveLegalDoc(null)}
                />
              </div>
            ) : activeTab === 'appearance' ? (
              <AppearanceSettingsTab
                themeMode={themeMode}
                themeId={themeId}
                customThemeColor={customThemeColor}
                appIconId={appIconId}
                customIconColor={customIconColor}
                onChangeMode={onChangeMode}
                onChangeTheme={onChangeTheme}
                onChangeCustomThemeColor={onChangeCustomThemeColor}
                onChangeAppIcon={onChangeAppIcon}
                onChangeCustomIconColor={onChangeCustomIconColor}
              />
            ) : activeTab === 'accessibility' ? (
              <AccessibilitySettingsTab
                zoomPercent={zoomPercent}
                highContrast={highContrast}
                reducedMotion={reducedMotion}
                onChangeZoomPercent={onChangeZoomPercent}
                onToggleHighContrast={onToggleHighContrast}
                onToggleReducedMotion={onToggleReducedMotion}
              />
            ) : activeTab === 'general' ? (
              <GeneralSettingsTab
                closeBehavior={closeBehavior}
                launchAtStartup={launchAtStartup}
                globalQuickAddShortcut={globalQuickAddShortcut}
                dragLocked={dragLocked}
                shortcuts={shortcuts}
                onChangeCloseBehavior={onChangeCloseBehavior}
                onToggleLaunchAtStartup={onToggleLaunchAtStartup}
                onToggleGlobalQuickAddShortcut={onToggleGlobalQuickAddShortcut}
                onToggleDragLock={onToggleDragLock}
              />
            ) : activeTab === 'data' ? (
              <DataBackupSettingsTab
                totalTodoCount={totalTodoCount}
                completedTodoCount={completedTodoCount}
                oneDriveStatus={oneDriveStatus}
                onOneDriveStatusChange={setOneDriveStatus}
                isImporting={isImporting}
                onImportingChange={setIsImporting}
                pendingImport={pendingImport}
                onPendingImportChange={setPendingImport}
                onClearAllCompleted={onClearAllCompleted}
                onImportBackup={onImportBackup}
                onApplyRestoredBootstrap={onApplyRestoredBootstrap}
                onResetAllData={onResetAllData}
                formatTimestamp={formatTimestamp}
              />
            ) : activeTab === 'trash' ? (
              <TrashSettingsTab
                trashedCategories={trashedCategories}
                trashedTodos={trashedTodos}
                onRestoreTodo={onRestoreTodo}
                onPermanentDeleteTodo={onPermanentDeleteTodo}
                onRestoreCategory={onRestoreCategory}
                onPermanentDeleteCategory={onPermanentDeleteCategory}
                onEmptyTrash={onEmptyTrash}
                formatTimestamp={formatTimestamp}
              />
            ) : activeTab === 'docs' ? (
              <DocsSettingsSection
                shortcuts={shortcuts}
                webhookEnabled={webhookEnabled}
                webhookUrl={webhookUrl}
                webhookSecret={webhookSecret}
                onSaveWebhook={
                  onSaveWebhook ??
                  (async (patch) => {
                    await api.updateSettings(patch);
                  })
                }
              />
            ) : (
              <AboutLegalSettingsTab
                themeMode={themeMode}
                themeId={themeId}
                customThemeColor={customThemeColor}
                appIconId={appIconId}
                customIconColor={customIconColor}
                zoomPercent={zoomPercent}
                highContrast={highContrast}
                reducedMotion={reducedMotion}
                closeBehavior={closeBehavior}
                launchAtStartup={launchAtStartup}
                globalQuickAddShortcut={globalQuickAddShortcut}
                oneDriveStatus={oneDriveStatus}
                totalTodoCount={totalTodoCount}
                completedTodoCount={completedTodoCount}
                trashCount={trashCount}
                autoUpdateCheck={autoUpdateCheck}
                onToggleAutoUpdateCheck={onToggleAutoUpdateCheck}
                updateState={updateState}
                onCheckForUpdates={onCheckForUpdates}
                onDownloadAndInstall={onDownloadAndInstall}
                onQuitAndInstallUpdate={onQuitAndInstallUpdate}
                onOpenLegalDoc={setActiveLegalDoc}
                onOpenWelcomeGuide={onOpenWelcomeGuide}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default SettingsModal;
