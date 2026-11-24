import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { UpdateCheckResult } from '../types';
import { getCachedDateTimeFormatter } from '../utils/intlCache';
import { ToggleSwitch } from './ToggleSwitch';

export interface AppUpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error';
  result: UpdateCheckResult | null;
  downloadPercent: number | null;
  errorMessage: string | null;
}

interface UpdateSettingsSectionProps {
  currentVersion: string;
  autoUpdateCheck: boolean;
  updateState: AppUpdateState;
  onToggleAutoUpdateCheck: (enabled: boolean) => void;
  onCheckNow: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onCancelDownload?: () => Promise<void>;
  onQuitAndInstall?: () => Promise<void>;
}

export const UpdateSettingsSection = React.memo(function UpdateSettingsSection({
  currentVersion,
  autoUpdateCheck,
  updateState,
  onToggleAutoUpdateCheck,
  onCheckNow,
  onDownloadAndInstall,
  onCancelDownload,
  onQuitAndInstall,
}: UpdateSettingsSectionProps) {
  const { t, meta } = useI18n();
  const isWindowsStore =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.isWindowsStore);

  const formattedLastChecked = useMemo(() => {
    const iso = updateState.result?.checkedAt;
    if (!iso) return null;
    try {
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return null;
      return getCachedDateTimeFormatter(meta.intlLocale, 'update-last-checked-full', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(dt);
    } catch {
      return null;
    }
  }, [updateState.result?.checkedAt, meta.intlLocale]);

  if (isWindowsStore) {
    return (
      <section
        aria-label={t.updatesSectionTitle}
        data-setting-id="about-updates"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-[var(--accent)] shrink-0" />
              <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
                {t.updateStoreManagedTitle}
              </h3>
              <span className="font-mono-tabular rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
                v{currentVersion}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              {t.updateStoreManagedDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void window.agendameaWindow?.openMicrosoftStorePage?.();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>{t.updateOpenStoreButton}</span>
          </button>
        </div>
      </section>
    );
  }

  const isChecking = updateState.status === 'checking';
  const isDownloading = updateState.status === 'downloading';
  const isDownloaded = updateState.status === 'downloaded';
  const isAvailable =
    updateState.status === 'available' ||
    isDownloading ||
    isDownloaded ||
    Boolean(updateState.result?.updateAvailable);

  return (
    <section
      aria-label={t.updatesSectionTitle}
      data-setting-id="about-updates"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b border-[var(--border)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
              {t.updatesSectionTitle}
            </h3>
            <span className="font-mono-tabular rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
              v{currentVersion}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.autoUpdateToggleDesc}</p>
        </div>

        <button
          type="button"
          data-testid="update-check-now-btn"
          onClick={() => void onCheckNow()}
          disabled={isChecking || isDownloading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{isChecking ? t.checkingUpdatesLabel : t.checkForUpdatesButton}</span>
        </button>
      </div>

      {/* Status Body */}
      <div className="px-4 py-3.5 space-y-3">
        {isDownloaded && updateState.result ? (
          <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {t.updateReadyToInstallLabel}:{' '}
                  <span className="font-mono-tabular">v{updateState.result.latestVersion}</span>
                </span>
              </div>
              {onQuitAndInstall && (
                <button
                  type="button"
                  onClick={() => void onQuitAndInstall()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t.restartAndUpdateButton}</span>
                </button>
              )}
            </div>
          </div>
        ) : isAvailable && updateState.result ? (
          <div className="rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-soft)] p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-[var(--accent)] shrink-0" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {t.updateAvailableLabel}:{' '}
                  <span className="font-mono-tabular">v{updateState.result.latestVersion}</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isDownloading && onCancelDownload && (
                  <button
                    type="button"
                    data-testid="update-cancel-download-btn"
                    onClick={() => void onCancelDownload()}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>{t.cancelButton}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void onDownloadAndInstall()}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>
                    {isDownloading
                      ? `${t.downloadingUpdateLabel} ${updateState.downloadPercent ?? 0}%`
                      : t.downloadAndInstallButton}
                  </span>
                </button>
                <a
                  href={updateState.result.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <span>{t.viewReleaseNotes}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {isDownloading && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.max(4, updateState.downloadPercent ?? 0)}%`,
                    backgroundColor: 'var(--accent)',
                  }}
                />
              </div>
            )}

            {updateState.result.releaseNotes && (
              <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-line line-clamp-4">
                {updateState.result.releaseNotes}
              </p>
            )}
          </div>
        ) : updateState.status === 'error' ? (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{updateState.errorMessage || t.updateErrorOfflineLabel}</span>
          </div>
        ) : updateState.status === 'up-to-date' ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>{t.upToDateLabel}</span>
            </span>
            {formattedLastChecked && (
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                {t.lastCheckedPrefix}: {formattedLastChecked}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <span data-testid="update-status-idle">
              {isChecking ? t.checkingUpdatesLabel : t.updateNotCheckedYetLabel}
            </span>
            {formattedLastChecked && (
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                {t.lastCheckedPrefix}: {formattedLastChecked}
              </span>
            )}
          </div>
        )}

        {/* Auto-check toggle */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text-secondary)]">{t.autoUpdateToggleTitle}</span>
          <ToggleSwitch
            checked={autoUpdateCheck}
            onChange={onToggleAutoUpdateCheck}
            label={t.autoUpdateToggleTitle}
            testId="update-auto-check-toggle"
          />
        </div>
      </div>
    </section>
  );
});
