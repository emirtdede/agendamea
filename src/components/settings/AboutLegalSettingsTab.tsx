import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, FileText, Scale, Shield, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { LegalDocId } from '../../i18n/translations';
import type { AppIconId, CloseBehavior, OneDriveStatus, ThemeId, ThemeMode } from '../../types';
import { resolveAppIconColors } from '../../utils/themes';
import { BrandMark } from '../BrandMark';
import { UpdatesSection, type AppUpdateState } from '../UpdateSettingsSection';
import { VelliumLogo } from '../VelliumLogo';

export interface AboutLegalSettingsTabProps {
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  appIconId: AppIconId;
  customIconColor: string;
  zoomPercent: number;
  highContrast: boolean;
  reducedMotion: boolean;
  closeBehavior: CloseBehavior;
  launchAtStartup: boolean;
  globalQuickAddShortcut: boolean;
  oneDriveStatus: OneDriveStatus | null;
  totalTodoCount: number;
  completedTodoCount: number;
  trashCount: number;
  autoUpdateCheck: boolean;
  onToggleAutoUpdateCheck: (enabled: boolean) => void;
  updateState: AppUpdateState;
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onQuitAndInstallUpdate?: () => Promise<void>;
  onOpenLegalDoc: (docId: LegalDocId) => void;
  onOpenWelcomeGuide?: () => void;
}

export const AboutLegalSettingsTab = React.memo(function AboutLegalSettingsTab({
  themeMode,
  themeId,
  customThemeColor,
  appIconId,
  customIconColor,
  zoomPercent,
  highContrast,
  reducedMotion,
  closeBehavior,
  launchAtStartup,
  globalQuickAddShortcut,
  oneDriveStatus,
  totalTodoCount,
  completedTodoCount,
  trashCount,
  autoUpdateCheck,
  onToggleAutoUpdateCheck,
  updateState,
  onCheckForUpdates,
  onDownloadAndInstall,
  onQuitAndInstallUpdate,
  onOpenLegalDoc,
  onOpenWelcomeGuide,
}: AboutLegalSettingsTabProps) {
  const { lang, meta, t } = useI18n();
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const legalItems = useMemo<Array<{ id: LegalDocId; title: string; Icon: typeof Shield }>>(
    () => [
      { id: 'privacy', title: t.legalPrivacyTitle, Icon: Shield },
      { id: 'terms', title: t.legalTermsTitle, Icon: Scale },
      { id: 'gdpr', title: t.legalKvkkGdprTitle, Icon: FileText },
      { id: 'opensource', title: t.legalOpenSourceTitle, Icon: FileText },
      { id: 'accessibility', title: t.legalAccessibilityTitle, Icon: Shield },
    ],
    [
      t.legalPrivacyTitle,
      t.legalTermsTitle,
      t.legalKvkkGdprTitle,
      t.legalOpenSourceTitle,
      t.legalAccessibilityTitle,
    ],
  );

  const activeIconColors = resolveAppIconColors(
    appIconId,
    themeId,
    themeMode,
    customThemeColor,
    customIconColor,
  );

  const handleCopyDiagnostics = async () => {
    try {
      const diag = await window.agendameaWindow?.getDiagnostics?.();
      const lines = [
        `Agendamea v${diag?.appVersion || '1.0.0'} (Vellium)`,
        `OS: ${diag ? `${diag.platform} ${diag.arch} (${diag.osRelease})` : navigator.userAgent}`,
        diag?.electronVersion
          ? `Runtime: Electron ${diag.electronVersion} / Chrome ${diag.chromeVersion} / Node ${diag.nodeVersion}`
          : 'Runtime: Web/PWA',
        `Channel: ${diag?.isWindowsStore ? 'Microsoft Store' : 'Desktop'}`,
        `Language: ${lang} (${meta.nativeName})`,
        `Theme: ${themeId} (${themeMode}) | Icon: ${appIconId} | Zoom: ${zoomPercent}%`,
        `Accessibility: HighContrast=${Boolean(highContrast)} | ReducedMotion=${Boolean(reducedMotion)}`,
        `Startup: LaunchAtStartup=${Boolean(launchAtStartup)} | GlobalShortcut=${Boolean(globalQuickAddShortcut)} | Close=${closeBehavior}`,
        `CloudSync: Connected=${Boolean(oneDriveStatus?.connected)} | AutoSync=${Boolean(oneDriveStatus?.autoSync)}`,
        `LocalData: ActiveTasks=${totalTodoCount} | Completed=${completedTodoCount} | Trash=${trashCount}`,
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      if (isMountedRef.current) {
        setDiagnosticsCopied(true);
        window.setTimeout(() => {
          if (isMountedRef.current) setDiagnosticsCopied(false);
        }, 3000);
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <>
      <UpdatesSection
        autoUpdateCheck={autoUpdateCheck}
        onToggleAutoUpdateCheck={onToggleAutoUpdateCheck}
        updateState={updateState}
        onCheckForUpdates={onCheckForUpdates}
        onDownloadAndInstall={onDownloadAndInstall}
        onQuitAndInstall={onQuitAndInstallUpdate}
      />

      {/* Legal Pages & Microsoft Store Compliance */}
      <section aria-label={t.legalSectionTitle} className="space-y-2.5">
        <div>
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.legalSectionTitle}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.legalSectionSubtitle}</p>
        </div>

        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {legalItems.map(({ id, title, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onOpenLegalDoc(id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                <span className="truncate">{title}</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* About & Diagnostics Card (Proper Agendamea BrandMark + Razor-Sharp 34x27 Vellium Mark) */}
      <section
        aria-label="Agendamea"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark
              className="h-10 w-10 rounded-xl shrink-0"
              bgColor={activeIconColors.bg}
              fgColor={activeIconColors.fg}
              borderColor={activeIconColors.border}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Agendamea
                </span>
                <span className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  v1.0.0
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">
                © 2026 Vellium · vellium.dev
              </p>
            </div>
          </div>

          <a
            href="https://vellium.dev"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Vellium"
            title="Vellium (vellium.dev)"
            data-testid="about-vellium-logo"
            className="flex items-center justify-center rounded-lg px-2 py-1.5 text-[var(--text-primary)] opacity-85 hover:opacity-100 hover:bg-[var(--surface-hover)] transition-all shrink-0"
          >
            <VelliumLogo className="h-[27px] w-[34px]" />
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
            <a
              href="https://vellium.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] underline-offset-2 hover:underline transition-colors"
            >
              vellium.dev
            </a>
            <a
              href="mailto:support@vellium.dev"
              className="hover:text-[var(--text-primary)] underline-offset-2 hover:underline transition-colors"
            >
              support@vellium.dev
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="copy-diagnostics-btn"
              onClick={() => void handleCopyDiagnostics()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
            >
              {diagnosticsCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
              )}
              <span>
                {diagnosticsCopied ? t.diagnosticsCopiedToast : t.copyDiagnosticsButton}
              </span>
            </button>
            {onOpenWelcomeGuide && (
              <button
                type="button"
                data-testid="settings-open-welcome-guide"
                onClick={onOpenWelcomeGuide}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                <span>{t.welcomeReplayButton}</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
});
