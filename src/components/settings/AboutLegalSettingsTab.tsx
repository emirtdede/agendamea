import {
  Activity,
  BookOpen,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDrive,
  Info,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { APP_CHANGELOG } from '../../data/changelog';
import { useI18n } from '../../i18n/I18nContext';
import type { LegalDocId } from '../../i18n/translations';
import { updaterStore, useUpdaterSelector } from '../../store/updaterStore';
import { useWorkspaceSnapshotSelector } from '../../store/workspaceSnapshotStore';
import type { OneDriveStatus, SystemInfoPayload } from '../../types';
import { APP_VERSION, GITHUB_REPO_URL } from '../../utils/appVersion';
import { formatByteSize } from '../../utils/formatBytes';
import { BrandMark } from '../BrandMark';
import { UpdateSettingsSection } from '../UpdateSettingsSection';
import { DocsUserGuideTab } from './docs/DocsUserGuideTab';
import { LegalSettingsTab } from './LegalSettingsTab';

export type AboutSubTabId = 'about' | 'guide';

interface AboutLegalSettingsTabProps {
  oneDriveStatus: OneDriveStatus | null;
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onCancelUpdateDownload?: () => Promise<void>;
  onQuitAndInstallUpdate?: () => Promise<void>;
  onOpenLegalDoc?: (doc: LegalDocId) => void;
  requestedSubTab?: AboutSubTabId;
  expandSectionId?: string;
  subTabSeq?: number;
}

interface ElectronDiagnosticsSnap {
  appVersion?: string;
  electronVersion?: string;
  chromeVersion?: string;
  nodeVersion?: string;
  platform?: string;
  arch?: string;
  osRelease?: string;
  isWindowsStore?: boolean;
  distributionChannel?: 'store' | 'portable' | 'setup' | 'dev';
  locale?: string;
  cliInstalled?: boolean;
  runtimePort?: number | null;
  userDataDir?: string;
}

export const AboutLegalSettingsTab = React.memo(function AboutLegalSettingsTab({
  oneDriveStatus,
  onCheckForUpdates,
  onDownloadAndInstall,
  onCancelUpdateDownload,
  onQuitAndInstallUpdate,
  onOpenLegalDoc,
  requestedSubTab,
  expandSectionId,
  subTabSeq,
}: AboutLegalSettingsTabProps) {
  const { t, lang } = useI18n();
  const { autoUpdateCheck, updateState } = useUpdaterSelector((s) => ({
    autoUpdateCheck: s.autoUpdateCheck,
    updateState: s.updateState,
  }));
  const { totalTodoCount, completedTodoCount, trashedTodosCount } = useWorkspaceSnapshotSelector(
    (s) => ({
      totalTodoCount: s.totalTodoCount,
      completedTodoCount: s.completedTodoCount,
      trashedTodosCount: s.trashedTodos.length,
    }),
  );

  const [activeView, setActiveView] = useState<AboutSubTabId>(requestedSubTab ?? 'about');
  const [guideSearch, setGuideSearch] = useState('');
  const [diagCopied, setDiagCopied] = useState(false);
  const [versionCopied, setVersionCopied] = useState(false);
  const [healthOpen, setHealthOpen] = useState(expandSectionId === 'about-health');
  const [changelogOpen, setChangelogOpen] = useState(expandSectionId === 'about-changelog');
  const [sysInfo, setSysInfo] = useState<SystemInfoPayload | null>(null);
  const [electronDiag, setElectronDiag] = useState<ElectronDiagnosticsSnap | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const verCopyTimerRef = useRef<number | null>(null);
  const pendingRevokesRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (subTabSeq === undefined) return;
    if (requestedSubTab) {
      setActiveView(requestedSubTab);
    }
    if (expandSectionId === 'about-health') {
      setHealthOpen(true);
    } else if (expandSectionId === 'about-changelog') {
      setChangelogOpen(true);
    }
  }, [requestedSubTab, expandSectionId, subTabSeq]);

  const hasDesktopBridge =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.getDiagnostics);

  useEffect(() => {
    let active = true;
    void api
      .getSystemInfo()
      .then((info) => {
        if (active) setSysInfo(info);
      })
      .catch(() => {
        /* non-fatal */
      });
    if (window.agendameaWindow?.getDiagnostics) {
      void window.agendameaWindow
        .getDiagnostics()
        .then((d) => {
          if (active) setElectronDiag(d);
        })
        .catch(() => {
          /* non-fatal */
        });
    }
    return () => {
      active = false;
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (verCopyTimerRef.current !== null) window.clearTimeout(verCopyTimerRef.current);
      for (const [timerId, objUrl] of pendingRevokesRef.current) {
        window.clearTimeout(timerId);
        URL.revokeObjectURL(objUrl);
      }
      pendingRevokesRef.current.clear();
    };
  }, []);

  const activeTodoCount = useMemo(
    () => (sysInfo ? sysInfo.activeTodos : Math.max(0, totalTodoCount - completedTodoCount)),
    [sysInfo, totalTodoCount, completedTodoCount],
  );
  const completedCountDisplay = sysInfo ? sysInfo.completedTodos : completedTodoCount;
  const trashedCountDisplay = sysInfo ? sysInfo.trashedTodos : trashedTodosCount;

  const channelLabel = useMemo(() => {
    const ch = electronDiag?.distributionChannel;
    if (ch === 'store') return 'Microsoft Store';
    if (ch === 'portable') return t.aboutChannelPortable;
    if (ch === 'setup') return t.aboutChannelDesktopSetup;
    if (ch === 'dev') return t.aboutChannelDev;
    return t.aboutChannelWebPwa;
  }, [
    electronDiag?.distributionChannel,
    t.aboutChannelDesktopSetup,
    t.aboutChannelDev,
    t.aboutChannelPortable,
    t.aboutChannelWebPwa,
  ]);

  const buildDiagnosticsText = useCallback(async (): Promise<string> => {
    const lines: string[] = [
      `App: Agendamea v${updateState.result?.currentVersion ?? sysInfo?.appVersion ?? APP_VERSION}`,
      `Channel: ${channelLabel}`,
      `Language: ${lang}`,
      `ActiveTasks: ${activeTodoCount}`,
      `CompletedTasks: ${completedCountDisplay}`,
      `TrashedTasks: ${trashedCountDisplay}`,
      `TotalTasks: ${activeTodoCount + completedCountDisplay}`,
      `CloudSync: ${oneDriveStatus?.connected ? `connected (${oneDriveStatus.activeProvider ?? 'folder'})` : 'disconnected'}`,
    ];
    if (sysInfo) {
      lines.push(`LoopbackApi: http://127.0.0.1:${sysInfo.runtimePort}`);
      lines.push(`SqliteSchema: v${sysInfo.schemaVersion}`);
      lines.push(`DatabaseSize: ${formatByteSize(sysInfo.dbSizeBytes)}`);
      lines.push(`AiModelsDisk: ${formatByteSize(sysInfo.modelsDiskBytes)}`);
      lines.push(`AiTier: ${sysInfo.aiTier}`);
      lines.push(`CrashReports: ${sysInfo.crashReportCount}`);
    }
    try {
      const diag = electronDiag ?? (await window.agendameaWindow?.getDiagnostics?.());
      if (diag) {
        lines.push(
          `Runtime: Electron ${diag.electronVersion || 'n/a'} / Chrome ${diag.chromeVersion || 'n/a'} / Node ${diag.nodeVersion || 'n/a'}`,
        );
        lines.push(
          `Platform: ${diag.platform || 'unknown'} ${diag.arch || ''} (${diag.osRelease || ''})`,
        );
        lines.push(`StoreBuild: ${diag.isWindowsStore ? 'yes' : 'no'}`);
        lines.push(`CliInstalled: ${diag.cliInstalled ? 'yes' : 'no'}`);
      } else {
        lines.push(`Runtime: Web / PWA (${navigator.userAgent})`);
      }
    } catch {
      lines.push(`Runtime: Web / PWA`);
    }
    lines.push(`GeneratedAt: ${new Date().toISOString()}`);
    return lines.join('\n');
  }, [
    activeTodoCount,
    channelLabel,
    completedCountDisplay,
    electronDiag,
    lang,
    oneDriveStatus?.activeProvider,
    oneDriveStatus?.connected,
    sysInfo,
    trashedCountDisplay,
    updateState.result?.currentVersion,
  ]);

  const handleCopyVersion = async () => {
    const ver = `Agendamea v${updateState.result?.currentVersion ?? APP_VERSION}`;
    try {
      await navigator.clipboard.writeText(ver);
      setVersionCopied(true);
      if (verCopyTimerRef.current !== null) window.clearTimeout(verCopyTimerRef.current);
      verCopyTimerRef.current = window.setTimeout(() => {
        setVersionCopied(false);
        verCopyTimerRef.current = null;
      }, 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyDiagnostics = async () => {
    const text = await buildDiagnosticsText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setDiagCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setDiagCopied(false);
      copyTimerRef.current = null;
    }, 2200);
  };

  const handleDownloadDiagnostics = async () => {
    const text = await buildDiagnosticsText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agendamea-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    const revokeTimer = window.setTimeout(() => {
      pendingRevokesRef.current.delete(revokeTimer);
      URL.revokeObjectURL(url);
    }, 1000);
    pendingRevokesRef.current.set(revokeTimer, url);
  };

  const handleReportBug = async () => {
    const diagText = await buildDiagnosticsText();
    const title = encodeURIComponent(
      `[Bug] Agendamea v${updateState.result?.currentVersion ?? APP_VERSION}: `,
    );
    const body = encodeURIComponent(
      `### Description\n\n(Describe the issue here)\n\n### Steps to Reproduce\n1. \n2. \n\n### Diagnostics (Privacy-Safe)\n\`\`\`\n${diagText}\n\`\`\`\n`,
    );
    window.open(
      `${GITHUB_REPO_URL}/issues/new?title=${title}&body=${body}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const displayVersion = updateState.result?.currentVersion ?? APP_VERSION;

  return (
    <div className="space-y-5">
      {/* 2-Way Segmented View Switcher: Updates & About vs User Guide (role="group", zero nested tablist) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <fieldset
          aria-label={t.settingsTabAbout}
          className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1"
        >
          <button
            type="button"
            data-testid="about-subtab-about"
            aria-pressed={activeView === 'about'}
            onClick={() => setActiveView('about')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeView === 'about'
                ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{t.settingsTabAbout}</span>
          </button>

          <button
            type="button"
            data-testid="about-subtab-guide"
            aria-pressed={activeView === 'guide'}
            onClick={() => setActiveView('guide')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeView === 'guide'
                ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span>{t.docsSubTabGuide}</span>
          </button>
        </fieldset>

        {activeView === 'guide' && (
          <div className="relative min-w-[200px] sm:w-56">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              data-testid="about-guide-search-input"
              value={guideSearch}
              onChange={(e) => setGuideSearch(e.target.value)}
              placeholder={t.docsSearchPlaceholder}
              aria-label={t.docsSearchPlaceholder}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            />
            {guideSearch && (
              <button
                type="button"
                onClick={() => setGuideSearch('')}
                aria-label={t.clearSearch}
                className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {activeView === 'guide' ? (
        <div data-setting-id="about-guide" className="animate-tab-enter">
          <DocsUserGuideTab searchQuery={guideSearch} />
        </div>
      ) : (
        <div className="space-y-5 animate-tab-enter">
          {/* 1. Identity & Trust Hero Card */}
          <section
            data-setting-id="about-identity"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <BrandMark className="h-10 w-10 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                      Agendamea
                    </h2>
                    <button
                      type="button"
                      data-testid="about-copy-version-btn"
                      onClick={() => void handleCopyVersion()}
                      title={t.docsCopyButton}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-0.5 font-mono-tabular text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                    >
                      <span>v{displayVersion}</span>
                      {versionCopied ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3 opacity-70" />
                      )}
                    </button>
                    <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent)]">
                      {channelLabel}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                    {t.settingsSubtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Privacy & Architecture Trust Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                <HardDrive className="h-3.5 w-3.5 text-emerald-500" />
                <span>{t.aboutBadgeLocalFirst}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>{t.aboutBadgeZeroTelemetry}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                <Scale className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>{t.aboutBadgeMitLicense}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                <Globe className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>{t.aboutBadgeLanguagesCount}</span>
              </span>
            </div>
          </section>

          {/* 2. Updates Section */}
          <UpdateSettingsSection
            currentVersion={displayVersion}
            autoUpdateCheck={autoUpdateCheck}
            updateState={updateState}
            onToggleAutoUpdateCheck={updaterStore.toggleAutoUpdateCheck}
            onCheckNow={onCheckForUpdates}
            onDownloadAndInstall={onDownloadAndInstall}
            onCancelDownload={onCancelUpdateDownload}
            onQuitAndInstall={onQuitAndInstallUpdate}
          />

          {/* 3. Collapsible Live System & Runtime Health Card (Compact by Default) */}
          <section
            aria-label={t.aboutSystemHealthTitle}
            data-setting-id="about-health"
            data-testid="about-system-health-card"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
          >
            <button
              type="button"
              data-testid="about-health-toggle"
              aria-expanded={healthOpen}
              onClick={() => setHealthOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Activity className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="font-display text-xs font-semibold text-[var(--text-primary)]">
                  {t.aboutSystemHealthTitle}
                </span>
                {sysInfo && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono-tabular text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>127.0.0.1:{sysInfo.runtimePort}</span>
                  </span>
                )}
              </div>
              {healthOpen ? (
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
              )}
            </button>

            {healthOpen && (
              <div className="animate-accordion border-t border-[var(--border)] grid grid-cols-1 gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
                <div className="bg-[var(--surface)] px-4 py-3">
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">
                    {t.aboutHealthRuntimeLabel}
                  </p>
                  <p className="mt-0.5 font-mono-tabular text-xs font-semibold text-[var(--text-primary)] truncate">
                    {electronDiag?.electronVersion
                      ? `Electron ${electronDiag.electronVersion} · ${electronDiag.platform} ${electronDiag.arch}`
                      : t.aboutChannelWebPwa}
                  </p>
                  {electronDiag?.chromeVersion && (
                    <p className="mt-0.5 font-mono-tabular text-[10.5px] text-[var(--text-muted)]">
                      Chromium {electronDiag.chromeVersion} · Node {electronDiag.nodeVersion}
                    </p>
                  )}
                </div>

                <div className="bg-[var(--surface)] px-4 py-3">
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">
                    {t.aboutHealthDatabaseLabel}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono-tabular text-xs font-semibold text-[var(--text-primary)]">
                    <Database className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    <span>
                      SQLite WAL v{sysInfo?.schemaVersion ?? 5} ·{' '}
                      {formatByteSize(sysInfo?.dbSizeBytes ?? 0)}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono-tabular text-[10.5px] text-[var(--text-muted)]">
                    {t.aboutHealthModelsSizeLabel}: {formatByteSize(sysInfo?.modelsDiskBytes ?? 0)}
                  </p>
                </div>

                <div className="bg-[var(--surface)] px-4 py-3">
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">
                    {t.aboutHealthWorkspaceLabel}
                  </p>
                  <p
                    data-testid="about-workspace-counters"
                    className="mt-0.5 font-mono-tabular text-xs font-semibold text-[var(--text-primary)]"
                  >
                    {activeTodoCount} {t.filterActive} · {completedCountDisplay} {t.filterCompleted}{' '}
                    · {trashedCountDisplay} {t.tabTrash}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                    {t.aboutHealthCloudLabel}:{' '}
                    {oneDriveStatus?.connected
                      ? `${t.enabledBadge} (${oneDriveStatus.activeProvider ?? t.cloudCustomFolderLabel})`
                      : t.aboutHealthLocalOnly}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* 4. Collapsible What's New Changelog */}
          <section
            aria-label={t.aboutWhatsNewTitle}
            data-setting-id="about-changelog"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
          >
            <button
              type="button"
              data-testid="about-changelog-toggle"
              aria-expanded={changelogOpen}
              onClick={() => setChangelogOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-[var(--accent)] shrink-0" />
                <span className="font-display text-xs font-semibold text-[var(--text-primary)]">
                  {t.aboutWhatsNewTitle}
                </span>
                <span className="font-mono-tabular rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-muted)]">
                  v{APP_CHANGELOG[0]?.version}
                </span>
              </div>
              {changelogOpen ? (
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
              )}
            </button>

            {changelogOpen && (
              <div className="animate-accordion border-t border-[var(--border)] divide-y divide-[var(--border)]">
                {APP_CHANGELOG.map((rel) => (
                  <div key={rel.version} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-[var(--text-primary)]">
                        v{rel.version}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        {rel.date}
                      </span>
                    </div>
                    <ul className="space-y-1.5 ps-4 list-disc text-xs leading-relaxed text-[var(--text-secondary)]">
                      {rel.highlightKeys.map((key) => (
                        <li key={key}>{t[key]}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 5. Troubleshooting, Folders & Support Actions (Both Data & Logs Folders Preserved) */}
          <section
            aria-label={t.aboutDiagnosticsTitle}
            data-setting-id="about-support"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3.5"
          >
            <div>
              <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
                {t.aboutDiagnosticsTitle}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.aboutDiagnosticsDesc}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="about-copy-diagnostics-btn"
                onClick={() => void handleCopyDiagnostics()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                {diagCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                )}
                <span>{diagCopied ? t.diagnosticsCopiedToast : t.copyDiagnosticsButton}</span>
              </button>

              <button
                type="button"
                data-testid="about-download-diagnostics-btn"
                onClick={() => void handleDownloadDiagnostics()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Download className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>{t.aboutDownloadDiagnosticsButton}</span>
              </button>

              {hasDesktopBridge && (
                <>
                  <button
                    type="button"
                    data-testid="about-open-data-folder-btn"
                    onClick={() => void window.agendameaWindow?.openDataFolder?.()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>{t.aboutOpenDataFolderButton}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="about-open-logs-folder-btn"
                    onClick={() => void window.agendameaWindow?.openLogsFolder?.()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <Terminal className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>{t.aboutOpenLogsFolderButton}</span>
                  </button>
                </>
              )}

              <button
                type="button"
                data-testid="about-report-bug-btn"
                onClick={() => void handleReportBug()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Bug className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>{t.aboutReportBugButton}</span>
              </button>

              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{t.aboutGithubLink}</span>
              </a>
            </div>
          </section>

          {/* 6. Embedded Legal Documents (5 Store & Open Source Compliance Documents) */}
          {onOpenLegalDoc && (
            <section
              aria-label={t.settingsTabLegal}
              data-setting-id="about-legal"
              data-testid="about-legal-section"
              className="space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-[var(--accent)] shrink-0" />
                <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
                  {t.settingsTabLegal}
                </h3>
              </div>
              <LegalSettingsTab onOpenLegalDoc={onOpenLegalDoc} />
            </section>
          )}

          {/* Footer Publisher Credit */}
          <div className="flex justify-end pt-1">
            <span className="text-[11px] text-[var(--text-muted)]">
              {t.aboutMadeByVellium} · © {new Date().getFullYear()} Vellium
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
