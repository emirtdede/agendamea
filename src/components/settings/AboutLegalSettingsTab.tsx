import {
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDrive,
  HelpCircle,
  Languages,
  Scale,
  Search,
  Shield,
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

export type AboutSubTabId = 'about' | 'guide';

const VELLIUM_WEBSITE_URL = 'https://vellium.dev';

interface AboutLegalSettingsTabProps {
  oneDriveStatus: OneDriveStatus | null;
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onCancelUpdateDownload?: () => Promise<void>;
  onQuitAndInstallUpdate?: () => Promise<void>;
  onOpenLegalDoc?: (doc: LegalDocId) => void;
  onOpenWelcomeGuide?: () => void;
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

function VelliumMonogram({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3.5 4.5L18 28.5L32.5 4.5H27.8L18 20.8L8.2 4.5H3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 4.5L18 15.8L24.8 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeOpacity="0.55"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const AboutLegalSettingsTab = React.memo(function AboutLegalSettingsTab({
  oneDriveStatus,
  onCheckForUpdates,
  onDownloadAndInstall,
  onCancelUpdateDownload,
  onQuitAndInstallUpdate,
  onOpenLegalDoc,
  onOpenWelcomeGuide,
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
  const [sysInfoLoaded, setSysInfoLoaded] = useState(false);
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
        if (active) {
          setSysInfo(info);
          setSysInfoLoaded(true);
        }
      })
      .catch(() => {
        if (active) setSysInfoLoaded(true);
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
  const categoriesCountDisplay = sysInfo?.categoriesCount ?? 0;

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
    } catch {
      const ta = document.createElement('textarea');
      ta.value = ver;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setVersionCopied(true);
    if (verCopyTimerRef.current !== null) window.clearTimeout(verCopyTimerRef.current);
    verCopyTimerRef.current = window.setTimeout(() => {
      setVersionCopied(false);
      verCopyTimerRef.current = null;
    }, 2200);
  };

  const handleCopyDiagnostics = async () => {
    const text = await buildDiagnosticsText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
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
    <div className="animate-tab-enter">
      {activeView === 'guide' ? (
        <div data-setting-id="about-guide" className="animate-tab-enter space-y-4">
          <div className="relative min-w-[200px] sm:w-64">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              data-testid="about-guide-search-input"
              value={guideSearch}
              onChange={(e) => setGuideSearch(e.target.value)}
              placeholder={t.docsSearchPlaceholder}
              aria-label={t.docsSearchPlaceholder}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent py-1.5 ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
            />
            {guideSearch && (
              <button
                type="button"
                onClick={() => setGuideSearch('')}
                aria-label={t.clearSearch}
                className="absolute end-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] ag-hover-glow"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <DocsUserGuideTab searchQuery={guideSearch} />
        </div>
      ) : (
        <div className="space-y-6 pb-6">
          {/* 1. Power Pilot Header Row: Title + Subtitle + Website CTA */}
          <header
            data-setting-id="about-identity"
            className="flex flex-wrap items-start justify-between gap-4"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="font-display text-[22px] font-bold tracking-tight text-[var(--text-primary)]">
                {t.settingsTabAbout}
              </h2>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                {t.aboutHeroSubtitle}
              </p>
            </div>
            <a
              href={VELLIUM_WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="about-website-link"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow shrink-0"
            >
              <Globe className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{t.aboutWebsiteButton}</span>
            </a>
          </header>

          {/* 2. 4-Column Metric KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Version */}
            <button
              type="button"
              data-testid="about-copy-version-btn"
              onClick={() => void handleCopyVersion()}
              title={t.docsCopyButton}
              className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-3.5 text-start ag-hover-card-glow transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t.aboutMetricVersionLabel}
                </span>
                {versionCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                )}
              </div>
              <div className="mt-2.5">
                <p className="font-mono-tabular text-[17px] font-bold tracking-tight text-[var(--text-primary)]">
                  v{displayVersion}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  {channelLabel}
                </p>
              </div>
            </button>

            {/* Core */}
            <div className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t.aboutMetricCoreLabel}
                </span>
                <Cpu className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
              </div>
              <div className="mt-2.5">
                <p className="font-display text-[17px] font-bold tracking-tight text-[var(--text-primary)]">
                  {t.aboutMetricCoreValue}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  SQLite · AI · REST API
                </p>
              </div>
            </div>

            {/* Languages */}
            <div className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t.aboutMetricLanguagesLabel}
                </span>
                <Languages className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
              </div>
              <div className="mt-2.5">
                <p className="font-display text-[17px] font-bold tracking-tight text-[var(--text-primary)]">
                  {t.aboutBadgeLanguagesCount}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  {t.aboutBadgeMitLicense}
                </p>
              </div>
            </div>

            {/* Privacy */}
            <div className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t.aboutMetricPrivacyLabel}
                </span>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              </div>
              <div className="mt-2.5">
                <p className="font-display text-[17px] font-bold tracking-tight text-[var(--text-primary)]">
                  {t.aboutMetricPrivacyValue}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  {t.aboutMetricPrivacySub}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Main Product Identity Card (Agendamea - Vellium) */}
          <section
            aria-label="Agendamea - Vellium"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <BrandMark className="h-10 w-10 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-display text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                    Agendamea - Vellium
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.aboutHeroSubtitle}</p>
                </div>
              </div>
              <VelliumMonogram className="h-7 w-7 shrink-0 text-[var(--text-muted)]/60" />
            </div>

            <dl className="divide-y divide-[var(--border)]/70 border-y border-[var(--border)]/70 text-xs">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[var(--text-muted)]">{t.aboutSpecDeveloper}</dt>
                <dd className="font-mono-tabular font-medium text-[var(--text-primary)]">
                  vellium.dev
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[var(--text-muted)]">{t.aboutSpecDistribution}</dt>
                <dd className="font-mono-tabular font-medium text-[var(--text-primary)]">
                  {channelLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[var(--text-muted)]">{t.aboutSpecCore}</dt>
                <dd className="font-mono-tabular font-medium text-[var(--text-primary)]">
                  SQLite · AI · REST API
                </dd>
              </div>
            </dl>

            {/* Emerald Local-Privacy Guarantee Banner */}
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{t.aboutLocalPrivacyBanner}</span>
            </div>

            {/* Identity Card Footer Actions */}
            <div className="flex flex-col gap-3 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--text-muted)]">
                {t.aboutWelcomePrompt}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="about-copy-diagnostics-btn"
                  onClick={() => void handleCopyDiagnostics()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow whitespace-nowrap"
                >
                  {diagCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  )}
                  <span>{diagCopied ? t.diagnosticsCopiedToast : t.copyDiagnosticsButton}</span>
                </button>
                {onOpenWelcomeGuide && (
                  <button
                    type="button"
                    data-testid="about-open-welcome-btn"
                    onClick={onOpenWelcomeGuide}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>{t.aboutOpenWelcomeButton}</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* 4. Software Updates Card */}
          <UpdateSettingsSection
            currentVersion={displayVersion}
            channelLabel={channelLabel}
            autoUpdateCheck={autoUpdateCheck}
            updateState={updateState}
            onToggleAutoUpdateCheck={updaterStore.toggleAutoUpdateCheck}
            onCheckNow={onCheckForUpdates}
            onDownloadAndInstall={onDownloadAndInstall}
            onCancelDownload={onCancelUpdateDownload}
            onQuitAndInstall={onQuitAndInstallUpdate}
          />

          {/* 5. Workspace Statistics on This Device Card */}
          <section aria-label={t.aboutDeviceWorkspaceTitle} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <HardDrive className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {t.aboutDeviceWorkspaceTitle}
              </h3>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--border)]/80 bg-[var(--canvas)]/60 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {t.aboutDeviceActiveTasks}
                  </p>
                  <p className="mt-1.5 font-mono-tabular text-[20px] font-bold text-[var(--text-primary)]">
                    {activeTodoCount}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border)]/80 bg-[var(--canvas)]/60 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {t.aboutDeviceCompletedTasks}
                  </p>
                  <p className="mt-1.5 font-mono-tabular text-[20px] font-bold text-[var(--text-primary)]">
                    {completedCountDisplay}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border)]/80 bg-[var(--canvas)]/60 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {t.aboutDeviceCategories}
                  </p>
                  {!sysInfoLoaded ? (
                    <div className="mt-2.5 h-6 w-12 rounded bg-[var(--surface-subtle)] animate-pulse" />
                  ) : (
                    <p className="mt-1.5 font-mono-tabular text-[20px] font-bold text-[var(--text-primary)]">
                      {categoriesCountDisplay}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11.5px] text-[var(--text-muted)]">
                {t.aboutDeviceWorkspaceFootnote}
              </p>
            </div>
          </section>

          {/* 6. Legal & Support Card (Power Pilot Tile Grid) */}
          {onOpenLegalDoc && (
            <section
              aria-label={t.settingsTabLegal}
              data-setting-id="about-legal"
              data-testid="about-legal-section"
              className="space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t.settingsTabLegal}
                </h3>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      {
                        id: 'terms' as LegalDocId,
                        title: t.legalTermsTitle,
                        desc: t.legalTermsSummary,
                        icon: Scale,
                      },
                      {
                        id: 'privacy' as LegalDocId,
                        title: t.legalPrivacyTitle,
                        desc: t.legalPrivacySummary,
                        icon: Shield,
                      },
                      {
                        id: 'opensource' as LegalDocId,
                        title: t.legalOpenSourceTitle,
                        desc: t.legalOpenSourceSummary,
                        icon: FolderOpen,
                      },
                    ] as const
                  ).map(({ id, title, desc, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      data-testid={`legal-doc-row-${id}`}
                      onClick={() => onOpenLegalDoc(id)}
                      className="group flex flex-col justify-between rounded-lg border border-[var(--border)]/80 bg-[var(--canvas)]/60 p-3.5 text-start ag-hover-card-glow transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Icon className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
                        <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                      </div>
                      <div className="mt-3 space-y-0.5">
                        <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                          {title}
                        </p>
                        <p className="text-[11px] leading-snug text-[var(--text-muted)] line-clamp-2">
                          {desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    data-testid="legal-doc-row-gdpr"
                    onClick={() => onOpenLegalDoc('gdpr')}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--border)]/80 bg-[var(--canvas)]/60 p-3.5 text-start ag-hover-card-glow transition"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                        <p className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate">
                          {t.legalKvkkGdprTitle}
                        </p>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">
                        {t.legalGdprSummary}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                  </button>

                  <button
                    type="button"
                    data-testid="legal-doc-row-accessibility"
                    onClick={() => onOpenLegalDoc('accessibility')}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--border)]/80 bg-[var(--canvas)]/60 p-3.5 text-start ag-hover-card-glow transition"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <HelpCircle className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                        <p className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate">
                          {t.legalAccessibilityTitle}
                        </p>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">
                        {t.aboutLegalSupportCardDesc}
                      </p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  </button>
                </div>

                <p className="border-t border-[var(--border)]/60 pt-3 text-[11px] text-[var(--text-muted)]">
                  Copyright © {new Date().getFullYear()} Vellium. {t.aboutCopyrightNotice}
                </p>
              </div>
            </section>
          )}

          {/* 7. Restrained System Health, Release Notes & Diagnostics Card */}
          <section
            aria-label={t.aboutDiagnosticsTitle}
            data-setting-id="about-support"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70"
          >
            {/* What's New Changelog */}
            <div data-setting-id="about-changelog" className="px-4">
              <button
                type="button"
                data-testid="about-changelog-toggle"
                aria-expanded={changelogOpen}
                onClick={() => setChangelogOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 py-3 text-start ag-hover-glow"
              >
                <span className="text-[13px] font-medium text-[var(--text-primary)]">
                  {t.aboutWhatsNewTitle}
                </span>
                {changelogOpen ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
                )}
              </button>

              {changelogOpen && (
                <div className="animate-accordion pb-4 divide-y divide-[var(--border)]/60">
                  {APP_CHANGELOG.map((rel) => (
                    <div key={rel.version} className="py-3 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono-tabular text-xs font-semibold text-[var(--text-primary)]">
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
            </div>

            {/* System & Runtime Health (Collapsed by default) */}
            <div
              data-setting-id="about-health"
              data-testid="about-system-health-card"
              className="px-4"
            >
              <button
                type="button"
                data-testid="about-health-toggle"
                aria-expanded={healthOpen}
                onClick={() => setHealthOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 py-3 text-start ag-hover-glow"
              >
                <span className="text-[13px] font-medium text-[var(--text-primary)]">
                  {t.aboutSystemHealthTitle}
                </span>
                {healthOpen ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
                )}
              </button>

              {healthOpen && (
                <div className="animate-accordion pb-4 grid grid-cols-1 gap-4 sm:grid-cols-3 pt-1">
                  <div>
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">
                      {t.aboutHealthRuntimeLabel}
                    </p>
                    <p className="mt-1 font-mono-tabular text-xs text-[var(--text-primary)] truncate">
                      {electronDiag?.electronVersion
                        ? `Electron ${electronDiag.electronVersion} · ${electronDiag.platform} ${electronDiag.arch}`
                        : t.aboutChannelWebPwa}
                    </p>
                    {electronDiag?.chromeVersion && (
                      <p className="mt-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        Chromium {electronDiag.chromeVersion} · Node {electronDiag.nodeVersion}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">
                      {t.aboutHealthDatabaseLabel}
                    </p>
                    <p className="mt-1 font-mono-tabular text-xs text-[var(--text-primary)]">
                      SQLite v{sysInfo?.schemaVersion ?? 5} ·{' '}
                      {formatByteSize(sysInfo?.dbSizeBytes ?? 0)}
                    </p>
                    {sysInfo && sysInfo.modelsDiskBytes > 0 && (
                      <p className="mt-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        {t.aboutHealthModelsSizeLabel}: {formatByteSize(sysInfo.modelsDiskBytes)}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">
                      {t.aboutHealthWorkspaceLabel}
                    </p>
                    <p
                      data-testid="about-workspace-counters"
                      className="mt-1 font-mono-tabular text-xs text-[var(--text-primary)]"
                    >
                      {activeTodoCount} {t.filterActive} · {completedCountDisplay}{' '}
                      {t.filterCompleted} · {trashedCountDisplay} {t.tabTrash}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {t.aboutHealthCloudLabel}:{' '}
                      {oneDriveStatus?.connected
                        ? `${t.enabledBadge} (${oneDriveStatus.activeProvider ?? t.cloudCustomFolderLabel})`
                        : t.aboutHealthLocalOnly}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Compact 4-Action Support & Folders Row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <button
                type="button"
                data-testid="about-download-diagnostics-btn"
                onClick={() => void handleDownloadDiagnostics()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
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
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>{t.aboutOpenDataFolderButton}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="about-open-logs-folder-btn"
                    onClick={() => void window.agendameaWindow?.openLogsFolder?.()}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
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
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
              >
                <Bug className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>{t.aboutReportBugButton}</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
});
