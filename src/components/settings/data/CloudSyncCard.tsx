import { Check, Cloud, FolderOpen, RefreshCw, Upload } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type { DetectedCloudProvider, OneDriveStatus } from '../../../types';
import { ToggleSwitch } from '../../ToggleSwitch';

interface CloudSyncCardProps {
  oneDriveStatus: OneDriveStatus | null;
  cloudProviders: DetectedCloudProvider[];
  isOneDriveBusy: boolean;
  formatTimestamp: (iso: string | null) => string;
  onConnectOrSync: () => void;
  onRestore: () => void;
  onPickFolder: () => void;
  onOpenFolder: () => void;
  onSelectProvider: (provider: DetectedCloudProvider) => void;
  onToggleAutoSync: () => void;
  onDisconnect: () => void;
}

export const CloudSyncCard = React.memo(function CloudSyncCard({
  oneDriveStatus,
  cloudProviders,
  isOneDriveBusy,
  formatTimestamp,
  onConnectOrSync,
  onRestore,
  onPickFolder,
  onOpenFolder,
  onSelectProvider,
  onToggleAutoSync,
  onDisconnect,
}: CloudSyncCardProps) {
  const { meta, t } = useI18n();

  return (
    <div data-testid="onedrive-sync-card" className="px-4 py-4 space-y-3.5">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {t.cloudSyncSectionTitle}
            </p>
          </div>
          {oneDriveStatus?.connected && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] whitespace-nowrap">
                <Check className="h-3 w-3 shrink-0" />
                <span>{t.enabledBadge}</span>
              </span>
              <button
                type="button"
                disabled={isOneDriveBusy}
                onClick={onDisconnect}
                className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {t.onedriveDisconnectButton}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{t.cloudSyncSectionDesc}</p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t.cloudSyncProvidersTitle}
        </p>
        <div className="grid grid-cols-2 gap-2" data-testid="cloud-providers-grid">
          {oneDriveStatus === null
            ? [0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  data-testid="cloud-provider-skeleton"
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 animate-pulse"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-20 rounded bg-[var(--surface-subtle)]" />
                    <div className="h-2.5 w-28 rounded bg-[var(--surface-subtle)]" />
                  </div>
                  <div className="h-3.5 w-3.5 rounded-full bg-[var(--surface-subtle)]" />
                </div>
              ))
            : cloudProviders.map((provider) => {
                const isActive =
                  Boolean(oneDriveStatus?.connected) &&
                  oneDriveStatus?.activeProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    data-testid={`cloud-provider-${provider.id}`}
                    disabled={isOneDriveBusy}
                    onClick={() => onSelectProvider(provider)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start transition-colors disabled:opacity-45 ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {provider.label}
                      </p>
                      <p className="truncate text-[10.5px] text-[var(--text-muted)]">
                        {provider.detected ? t.cloudDetectedBadge : t.cloudNotInstalledHint}
                      </p>
                    </div>
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    ) : provider.detected ? (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                      />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    )}
                  </button>
                );
              })}
        </div>
      </div>

      {oneDriveStatus?.folderPath && (
        <div className="space-y-0.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
          <p
            data-testid="onedrive-folder-path"
            className="truncate font-mono-tabular text-[11px] text-[var(--text-secondary)]"
            title={oneDriveStatus.folderPath}
          >
            {oneDriveStatus.folderPath}
          </p>
          {oneDriveStatus.lastSyncedAt && (
            <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {t.onedriveLastSyncedPrefix}: {formatTimestamp(oneDriveStatus.lastSyncedAt)}
              {oneDriveStatus.hasRemoteBackup && typeof oneDriveStatus.remoteTodoCount === 'number'
                ? ` · ${oneDriveStatus.remoteTodoCount} ${t.tasksTitle.toLocaleLowerCase(meta.intlLocale)}`
                : ''}
            </p>
          )}
        </div>
      )}

      <div
        data-testid="cloud-sync-actions-grid"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5"
      >
        <button
          type="button"
          disabled={isOneDriveBusy}
          title={oneDriveStatus?.connected ? t.onedriveSyncNowButton : t.onedriveConnectButton}
          onClick={onConnectOrSync}
          className="inline-flex h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-opacity disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isOneDriveBusy ? 'animate-spin' : ''}`} />
          <span className="truncate">
            {oneDriveStatus?.connected ? t.onedriveSyncNowButton : t.onedriveConnectButton}
          </span>
        </button>

        <button
          type="button"
          disabled={isOneDriveBusy || !oneDriveStatus?.hasRemoteBackup}
          title={t.onedriveRestoreButton}
          onClick={onRestore}
          className="inline-flex h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t.onedriveRestoreButton}</span>
        </button>

        <button
          type="button"
          data-testid="onedrive-pick-folder-btn"
          disabled={isOneDriveBusy}
          title={t.cloudPickFolderButton}
          onClick={onPickFolder}
          className="inline-flex h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          <span className="truncate">{t.cloudPickFolderButton}</span>
        </button>

        <button
          type="button"
          title={t.onedriveOpenFolderButton}
          onClick={onOpenFolder}
          className="inline-flex h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t.onedriveOpenFolderButton}</span>
        </button>
      </div>

      {oneDriveStatus?.connected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {t.onedriveAutoSyncTitle}
          </span>
          <ToggleSwitch
            checked={oneDriveStatus.autoSync}
            onChange={() => onToggleAutoSync()}
            disabled={isOneDriveBusy}
            label={t.onedriveAutoSyncTitle}
            testId="cloud-auto-sync-toggle"
          />
        </div>
      )}
    </div>
  );
});
