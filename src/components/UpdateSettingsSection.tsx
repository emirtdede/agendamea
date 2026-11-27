import { AlertCircle, Check, Download, ExternalLink, RefreshCw, RotateCcw, X } from 'lucide-react';
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
  channelLabel?: string;
  autoUpdateCheck: boolean;
  updateState: AppUpdateState;
  onToggleAutoUpdateCheck: (enabled: boolean) => void;
  onCheckNow: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onCancelDownload?: () => Promise<void>;
  onQuitAndInstall?: () => Promise<void>;
}

export const UpdateSettingsSection = React.memo(function UpdateSettingsSection({
  channelLabel,
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
        className="space-y-2.5"
      >
        <div className="flex items-center gap-2">
          <Download className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.updatesSectionTitle}
          </h3>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">
              {t.updateStoreManagedTitle}
            </p>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              {t.updateStoreManagedDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void window.agendameaWindow?.openMicrosoftStorePage?.();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow shrink-0"
          >
            <span>{t.updateOpenStoreButton}</span>
            <ExternalLink className="h-3.5 w-3.5" />
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
      className="space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <Download className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {t.updatesSectionTitle}
        </h3>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70">
        {/* Primary Status & Check Row */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {isDownloaded && updateState.result ? (
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--text-primary)]">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    <span>
                      {t.updateReadyToInstallLabel}:{' '}
                      <span className="font-mono-tabular">v{updateState.result.latestVersion}</span>
                    </span>
                  </span>
                ) : isAvailable && updateState.result ? (
                  <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                    {t.updateAvailableLabel}:{' '}
                    <span className="font-mono-tabular">v{updateState.result.latestVersion}</span>
                  </span>
                ) : updateState.status === 'error' ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-red-500 dark:text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{updateState.errorMessage || t.updateErrorOfflineLabel}</span>
                  </span>
                ) : (
                  <span
                    data-testid={updateState.status === 'idle' ? 'update-status-idle' : undefined}
                    className="text-[13.5px] font-semibold text-[var(--text-primary)]"
                  >
                    {updateState.status === 'up-to-date'
                      ? t.upToDateLabel
                      : isChecking
                        ? t.checkingUpdatesLabel
                        : t.upToDateLabel}
                  </span>
                )}

                {channelLabel && (
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
                    {channelLabel}
                  </span>
                )}
              </div>

              <p className="text-xs text-[var(--text-muted)]">
                {formattedLastChecked
                  ? `${t.lastCheckedPrefix}: ${formattedLastChecked}`
                  : t.updateNotCheckedYetLabel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isDownloaded && onQuitAndInstall ? (
                <button
                  type="button"
                  onClick={() => void onQuitAndInstall()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ag-hover-accent-glow"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t.restartAndUpdateButton}</span>
                </button>
              ) : isAvailable && updateState.result ? (
                <>
                  {isDownloading && onCancelDownload && (
                    <button
                      type="button"
                      data-testid="update-cancel-download-btn"
                      onClick={() => void onCancelDownload()}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-card-glow"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{t.cancelButton}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onDownloadAndInstall()}
                    disabled={isDownloading}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ag-hover-accent-glow disabled:opacity-55"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>
                      {isDownloading
                        ? `${t.downloadingUpdateLabel} ${updateState.downloadPercent ?? 0}%`
                        : t.downloadAndInstallButton}
                    </span>
                  </button>
                </>
              ) : null}

              <button
                type="button"
                data-testid="update-check-now-btn"
                onClick={() => void onCheckNow()}
                disabled={isChecking || isDownloading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow disabled:opacity-45 shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? t.checkingUpdatesLabel : t.checkForUpdatesButton}</span>
              </button>
            </div>
          </div>

          {isDownloading && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{
                  width: `${Math.max(4, updateState.downloadPercent ?? 0)}%`,
                  backgroundColor: 'var(--accent)',
                }}
              />
            </div>
          )}

          {isAvailable && updateState.result?.releaseNotes && (
            <div className="flex flex-wrap items-start justify-between gap-2 border-t border-[var(--border)]/60 pt-2.5">
              <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-line line-clamp-4 flex-1 min-w-0">
                {updateState.result.releaseNotes}
              </p>
              <a
                href={updateState.result.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] shrink-0"
              >
                <span>{t.viewReleaseNotes}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* Auto-check toggle row */}
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              {t.autoUpdateToggleTitle}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t.autoUpdateToggleDesc}</p>
          </div>
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
